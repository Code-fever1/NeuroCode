import * as vscode from 'vscode';
import { TestReport } from '../shared/types';

/**
 * Local test history storage backed by JSON files in the extension's
 * global storage directory. Keeps the last N reports per project.
 * (Designed so it can be swapped for SQLite later without changing callers.)
 */
export class HistoryStore {
  private static readonly MAX_REPORTS = 20;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private historyFile(projectName: string): vscode.Uri {
    const dir = this.context.globalStorageUri;
    return vscode.Uri.joinPath(dir, 'history', `${sanitize(projectName)}.json`);
  }

  async save(report: TestReport): Promise<void> {
    const uri = this.historyFile(report.projectName);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));

    const existing = await this.load(report.projectName);
    existing.push(report);
    const trimmed = existing.slice(-HistoryStore.MAX_REPORTS);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(trimmed, null, 2), 'utf8'));
  }

  async load(projectName: string): Promise<TestReport[]> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.historyFile(projectName));
      const parsed = JSON.parse(Buffer.from(bytes).toString('utf8'));
      return Array.isArray(parsed) ? (parsed as TestReport[]) : [];
    } catch {
      return [];
    }
  }

  async latest(projectName: string): Promise<TestReport | undefined> {
    const reports = await this.load(projectName);
    return reports[reports.length - 1];
  }
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
