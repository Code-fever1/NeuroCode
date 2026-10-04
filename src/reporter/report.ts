import * as vscode from 'vscode';
import { TestCase, TestReport, TestResult } from '../shared/types';

/**
 * Report helpers: summary computation and export to JSON / standalone HTML.
 */

export function summarize(report: TestReport): string {
  const rate = report.total > 0 ? Math.round((report.passed / report.total) * 100) : 0;
  return `${report.passed}/${report.total} passed (${rate}%) — ${report.failed} failed, ${report.errored} errored, ${report.skipped} skipped in ${(report.durationMs / 1000).toFixed(1)}s`;
}

export function toMarkdown(report: TestReport, tests: TestCase[]): string {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const lines: string[] = [
    `# NeuroCode QA Report — ${report.projectName}`,
    '',
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    '',
    '## Summary',
    '',
    '| Status | Count |',
    '| --- | --- |',
    `| Passed | ${report.passed} |`,
    `| Failed | ${report.failed} |`,
    `| Errored | ${report.errored} |`,
    `| Skipped | ${report.skipped} |`,
    `| Total | ${report.total} |`,
    '',
    '## Results',
    '',
  ];

  for (const result of report.results) {
    const test = byId.get(result.testId);
    const title = test?.title ?? result.testId;
    const badge =
      result.status === 'passed' ? 'PASS' : result.status === 'failed' ? 'FAIL' : result.status === 'error' ? 'ERROR' : 'SKIP';
    lines.push(`- [${badge}] ${title} — ${result.message ?? ''} (${(result.durationMs / 1000).toFixed(2)}s)`);
    if (test?.description) lines.push(`  - What it tests: ${test.description}`);
    for (const step of test?.steps ?? []) {
      lines.push(`  - ${step.type}: ${step.description}`);
    }
    if (result.evidence?.error) {
      lines.push(`  - Error: \`${result.evidence.error.split('\n')[0]}\``);
    }
    if (result.evidence?.responseDiff) {
      lines.push('  - Response diff:');
      lines.push('    ```');
      lines.push(...result.evidence.responseDiff.split('\n').slice(0, 25));
      lines.push('    ```');
    }
  }

  return lines.join('\n');
}

export async function exportMarkdown(report: TestReport, tests: TestCase[]): Promise<void> {
  const content = toMarkdown(report, tests);
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${report.projectName}-neurocode-report.md`),
    filters: { Markdown: ['md'], 'All files': ['*'] },
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  void vscode.window.showInformationMessage(`NeuroCode report exported to ${uri.fsPath}`);
}

export async function exportJson(report: TestReport, tests: TestCase[]): Promise<void> {
  const content = JSON.stringify({ report, tests }, null, 2);
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(`${report.projectName}-neurocode-report.json`),
    filters: { JSON: ['json'], 'All files': ['*'] },
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  void vscode.window.showInformationMessage(`NeuroCode report exported to ${uri.fsPath}`);
}

export function evidenceFor(result: TestResult): string | undefined {
  const ev = result.evidence;
  if (!ev) return undefined;
  if (ev.error) return ev.error.split('\n')[0];
  if (ev.responseDiff) return ev.responseDiff.split('\n').slice(0, 6).join('\n');
  if (ev.outputLog) return ev.outputLog.split('\n').slice(0, 6).join('\n');
  return undefined;
}
