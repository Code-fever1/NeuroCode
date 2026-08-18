import * as vscode from 'vscode';
import { PipelineState, ProjectStructure, TestReport, WebviewRequest } from '../shared/types';
import { ProjectScanner } from '../scanner/scanner';
import { TestGenerator } from '../generator/testGenerator';
import { Executor } from '../executor/executor';
import { HistoryStore } from '../reporter/history';
import { exportJson, exportMarkdown } from '../reporter/report';
import { NeuroCodePanel } from '../panel/neurocodePanel';

/**
 * Owns the QA pipeline state (scan -> generate -> execute -> report) and
 * bridges commands, the webview dashboard, and the execution engines.
 */
export class NeuroCodeController {
  private state: PipelineState = {
    tests: [],
    generating: false,
    scanning: false,
    running: false,
  };

  private structure?: ProjectStructure;
  private readonly panel: NeuroCodePanel;
  private readonly history: HistoryStore;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly workspaceRoot: string,
  ) {
    this.history = new HistoryStore(context);
    this.panel = new NeuroCodePanel(
      context.extensionUri,
      (req) => void this.handleMessage(req),
      () => this.state,
    );
  }

  /** Register the sidebar webview provider and the command palette actions. */
  register(): void {
    this.context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(NeuroCodePanel.viewType, this.panel),
    );

    const commands: Array<[string, () => void | Promise<void>]> = [
      ['neurocode.scanProject', () => this.scanProject()],
      ['neurocode.generateTests', () => this.generateTests()],
      ['neurocode.runTests', () => this.runTests()],
      ['neurocode.rerunFailed', () => this.rerunFailed()],
      ['neurocode.showDashboard', () => this.reveal()],
      ['neurocode.exportReport', () => this.exportReport()],
    ];

    for (const [id, handler] of commands) {
      this.context.subscriptions.push(vscode.commands.registerCommand(id, handler));
    }
  }

  private reveal(): void {
    void vscode.commands.executeCommand('neurocode.sidebar.focus');
  }

  // ---- Commands ---------------------------------------------------------

  async scanProject(): Promise<void> {
    this.state.scanning = true;
    this.state.lastError = undefined;
    this.pushState();

    try {
      const scanner = new ProjectScanner();
      this.structure = await scanner.scan(this.workspaceRoot, {
        onProgress: (msg) => void vscode.window.setStatusBarMessage(`NeuroCode: ${msg}`, 3000),
      });
      this.state.projectName = this.structure.name;
      this.state.projectType = this.structure.projectType;
      this.state.scannedAt = new Date().toISOString();
      this.state.structureSummary = this.describeStructure(this.structure);
      this.state.tests = [];
      this.state.report = undefined;

      void vscode.window.showInformationMessage(
        `NeuroCode: detected ${this.structure.projectType} project "${this.structure.name}"`,
      );
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`NeuroCode scan failed: ${this.state.lastError}`);
    } finally {
      this.state.scanning = false;
      this.pushState();
    }
  }

  async generateTests(): Promise<void> {
    if (!this.structure) {
      void vscode.window.showWarningMessage('NeuroCode: scan the project first (Ctrl+Shift+P -> "NeuroCode: Scan Project").');
      return;
    }
    if (this.state.generating) return;

    this.state.generating = true;
    this.state.lastError = undefined;
    this.pushState();

    try {
      const config = vscode.workspace.getConfiguration('neurocode');
      const generator = new TestGenerator(this.structure, {
        apiBaseUrl: config.get<string>('apiBaseUrl') ?? 'https://api.openai.com/v1',
        apiKey: config.get<string>('apiKey') ?? process.env.NEUROCODE_API_KEY ?? '',
        model: config.get<string>('model') ?? 'gpt-4o-mini',
        maxTestCases: config.get<number>('maxTestCases') ?? 20,
        appUrl: config.get<string>('appUrl'),
      });

      this.state.tests = await generator.generate({
        onProgress: (msg) => void vscode.window.setStatusBarMessage(`NeuroCode: ${msg}`, 3000),
      });
      this.state.report = undefined;

      void vscode.window.showInformationMessage(`NeuroCode: generated ${this.state.tests.length} test cases. Review them in the dashboard before running.`);
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`NeuroCode generation failed: ${this.state.lastError}`);
    } finally {
      this.state.generating = false;
      this.pushState();
    }
  }

  async runTests(testIds?: string[]): Promise<void> {
    if (this.state.tests.length === 0) {
      void vscode.window.showWarningMessage('NeuroCode: generate test cases first.');
      return;
    }
    if (this.state.running) return;

    const selected = testIds ? this.state.tests.filter((t) => testIds.includes(t.id)) : this.state.tests;
    if (selected.length === 0) return;

    this.state.running = true;
    this.state.lastError = undefined;
    this.pushState();

    try {
      const config = vscode.workspace.getConfiguration('neurocode');
      const executor = new Executor();
      const report = await executor.run(selected, {
        workspaceRoot: this.workspaceRoot,
        appUrl: config.get<string>('appUrl') ?? 'http://localhost:3000',
        headless: config.get<boolean>('playwrightHeadless') ?? true,
        onProgress: (result, index, total) => {
          const updated = this.state.report ?? this.emptyReport(selected.length);
          const existing = updated.results.findIndex((r) => r.testId === result.testId);
          if (existing >= 0) {
            updated.results[existing] = result;
          } else {
            updated.results.push(result);
          }
          updated.total = Math.max(updated.total, index);
          updated.passed = updated.results.filter((r) => r.status === 'passed').length;
          updated.failed = updated.results.filter((r) => r.status === 'failed').length;
          updated.errored = updated.results.filter((r) => r.status === 'error').length;
          updated.skipped = updated.results.filter((r) => r.status === 'skipped').length;
          this.state.report = updated;
          this.pushState();
          void vscode.window.setStatusBarMessage(`NeuroCode: ${index}/${total} tests completed`, 2000);
        },
      });

      report.projectName = this.structure?.name ?? report.projectName;
      report.projectType = this.structure?.projectType ?? 'unknown';
      this.state.report = report;
      await this.history.save(report);

      const failed = report.failed + report.errored;
      if (failed > 0) {
        void vscode.window.showWarningMessage(`NeuroCode: ${report.passed}/${report.total} passed — ${failed} failed. Check the dashboard for evidence.`);
      } else {
        void vscode.window.showInformationMessage(`NeuroCode: all ${report.total} tests passed!`);
      }
    } catch (err) {
      this.state.lastError = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`NeuroCode run failed: ${this.state.lastError}`);
    } finally {
      this.state.running = false;
      this.pushState();
    }
  }

  async rerunFailed(): Promise<void> {
    const failed = this.state.report?.results
      .filter((r) => r.status === 'failed' || r.status === 'error')
      .map((r) => r.testId);
    if (!failed || failed.length === 0) {
      void vscode.window.showInformationMessage('NeuroCode: no failed tests to rerun.');
      return;
    }
    this.state.report = undefined;
    await this.runTests(failed);
  }

  async exportReport(): Promise<void> {
    if (!this.state.report) {
      void vscode.window.showWarningMessage('NeuroCode: run tests before exporting a report.');
      return;
    }
    const pick = await vscode.window.showQuickPick(['Markdown (.md)', 'JSON (.json)'], {
      placeHolder: 'Choose export format',
    });
    if (!pick) return;
    if (pick.startsWith('Markdown')) {
      await exportMarkdown(this.state.report, this.state.tests);
    } else {
      await exportJson(this.state.report, this.state.tests);
    }
  }

  // ---- Webview messages -------------------------------------------------

  private async handleMessage(req: WebviewRequest): Promise<void> {
    switch (req.type) {
      case 'scanProject':
        await this.scanProject();
        break;
      case 'generateTests':
        await this.generateTests();
        break;
      case 'runTests':
        await this.runTests(req.testIds);
        break;
      case 'rerunFailed':
        await this.rerunFailed();
        break;
      case 'exportReport':
        await this.exportReport();
        break;
      case 'getState':
        this.pushState();
        break;
      case 'updateTest': {
        const idx = this.state.tests.findIndex((t) => t.id === req.test.id);
        if (idx >= 0) this.state.tests[idx] = req.test;
        this.pushState();
        break;
      }
      case 'deleteTest': {
        this.state.tests = this.state.tests.filter((t) => t.id !== req.testId);
        this.pushState();
        break;
      }
    }
  }

  // ---- Helpers ----------------------------------------------------------

  private pushState(): void {
    this.panel.post({ type: 'state', state: this.state });
  }

  private describeStructure(s: ProjectStructure): string {
    const parts: string[] = [`Type: ${s.projectType}`];
    if (s.api) {
      parts.push(`${s.api.endpoints.length} endpoints`);
      if (s.api.schemas.length > 0) parts.push(`${s.api.schemas.length} schemas`);
    }
    if (s.web) {
      parts.push(`${s.web.routes.length} routes`);
      parts.push(`${s.web.forms.length} form fields`);
      parts.push(`${s.web.components.length} components`);
    }
    if (s.cli) {
      parts.push(`${s.cli.commands.length} commands`);
    }
    return parts.join(' · ');
  }

  private emptyReport(total: number): TestReport {
    return {
      projectName: this.structure?.name ?? 'project',
      projectType: this.structure?.projectType ?? 'unknown',
      generatedAt: new Date().toISOString(),
      durationMs: 0,
      total,
      passed: 0,
      failed: 0,
      errored: 0,
      skipped: 0,
      results: [],
    };
  }
}
