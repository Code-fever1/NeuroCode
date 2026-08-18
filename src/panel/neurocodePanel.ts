import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
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
    const nonce = crypto.randomUUID();
    const bundleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'bundle.js'));
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'styles.css'));

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:;`,
      `style-src ${webview.cspSource} 'unsafe-inline';`,
      `script-src 'nonce-${nonce}';`,
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
  <div id="root">
    <div id="loading" style="display:flex;align-items:center;justify-content:center;height:100vh;color:var(--vscode-descriptionForeground,#9d9d9d);font-family:var(--vscode-font-family,sans-serif);font-size:13px;">
      Loading NeuroCode...
    </div>
  </div>
  <script nonce="${nonce}" src="${bundleUri}"></script>
  <script nonce="${nonce}">
    // Remove loading indicator once React has mounted
    (function() {
      var check = setInterval(function() {
        var root = document.getElementById('root');
        var loading = document.getElementById('loading');
        if (loading && root && root.children.length > 1) {
          loading.remove();
          clearInterval(check);
        }
      }, 100);
      // Safety: remove after 10s even if React didn't mount
      setTimeout(function() {
        var loading = document.getElementById('loading');
        if (loading) {
          loading.textContent = 'NeuroCode UI failed to load. Check the extension host log for errors.';
          loading.style.color = '#f14c4c';
        }
      }, 10000);
    })();
  </script>
</body>
</html>`;
  }
}
