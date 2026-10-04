import * as vscode from 'vscode';
import { NeuroCodeController } from './controller';

let controller: NeuroCodeController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[NeuroCode] activate start');
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showWarningMessage('NeuroCode: open a project folder to use the QA pipeline.');
  }

  try {
    controller = new NeuroCodeController(context, workspaceRoot ?? '');
    controller.register();
    console.log('[NeuroCode] provider registered');
  } catch (err) {
    console.error('[NeuroCode] activation error:', err);
    throw err;
  }
}

export function deactivate(): void {
  controller = undefined;
}
