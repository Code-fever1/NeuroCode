import * as vscode from 'vscode';
import { PipelineState, WebviewRequest, WebviewResponse } from '../shared/types';

/**
 * Dashboard webview rendered in the NeuroCode sidebar view.
 * Bridges messages between the React UI and the extension controller.
 */
export class NeuroCodePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neurocode.sidebar';

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (req: WebviewRequest) => void,
    private readonly getState: () => PipelineState,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: WebviewRequest) => this.onMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    // Send current state as soon as the UI is ready.
    this.post({ type: 'state', state: this.getState() });
  }

  post(response: WebviewResponse): void {
    void this.view?.webview.postMessage(response);
  }

  private renderHtml(webview: vscode.Webview): string {
    const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'bundle.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css'));

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `script-src ${webview.cspSource};`,
      'font-src data:;',
    ].join(' ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <link rel="stylesheet" href="${stylesUri}" />
  <title>NeuroCode QA Dashboard</title>
</head>
<body>
  <div id="root"></div>
  <script src="${bundleUri}"></script>
</body>
</html>`;
  }
}
