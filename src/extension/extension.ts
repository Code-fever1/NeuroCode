import * as vscode from 'vscode';
import { NeuroCodeController } from './controller';

let controller: NeuroCodeController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage('NeuroCode: open a project folder to use the QA pipeline.');
  }

  controller = new NeuroCodeController(context, workspaceRoot ?? '');
  controller.register();
}

export function deactivate(): void {
  controller = undefined;
}
