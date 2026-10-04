import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { PipelineState, WebviewRequest, WebviewResponse } from '../shared/types';

/**
 * Sidebar dashboard. The page is plain HTML so it does not depend on the
 * React bundle. Buttons talk to the extension through postMessage.
 */
export class NeuroCodePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'neurocodeDashboard';

  private view?: vscode.WebviewView;

  constructor(
    _extensionUri: vscode.Uri,
    private readonly onMessage: (req: WebviewRequest) => void,
    private readonly getState: () => PipelineState,
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
    };

    const nonce = crypto.randomUUID();
    webviewView.webview.html = renderHtml(nonce);
    webviewView.webview.onDidReceiveMessage((message: WebviewRequest) => this.onMessage(message));
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });

    this.post({ type: 'state', state: this.getState() });
  }

  post(response: WebviewResponse): void {
    void this.view?.webview.postMessage(response);
  }
}

function renderHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 12px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); font-size: 13px; }
    h2 { margin: 14px 0 6px; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--vscode-descriptionForeground); }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .brand { font-weight: 700; }
    .badge { font-size: 10px; text-transform: uppercase; padding: 2px 6px; border-radius: 99px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .actions { display: flex; gap: 6px; }
    button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 0; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
    button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
    button:disabled { opacity: 0.45; cursor: default; }
    .meta, .hint, .expected, .step, .result { color: var(--vscode-descriptionForeground); }
    .meta { margin: 8px 0; line-height: 1.4; }
    .error { margin: 8px 0; padding: 8px; border: 1px solid var(--vscode-inputValidation-errorBorder); color: var(--vscode-errorForeground); }
    .group { margin-top: 8px; font-weight: 600; }
    .row, .case { border: 1px solid var(--vscode-panel-border, transparent); background: var(--vscode-sideBar-background); border-radius: 6px; padding: 7px 8px; margin-top: 6px; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .row b { font-weight: 600; }
    .row span, .file { color: var(--vscode-descriptionForeground); font-size: 11px; text-align: right; }
    .list { max-height: 240px; overflow: auto; }
    .case { cursor: pointer; }
    .case.selected { outline: 1px solid var(--vscode-focusBorder); }
    .case header { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .id { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .pass { color: var(--vscode-testing-iconPassed, #3fb950); }
    .fail { color: var(--vscode-testing-iconFailed, #f85149); }
    .wait { color: var(--vscode-descriptionForeground); }
    .title { margin: 4px 0; font-weight: 650; }
    .step { margin: 2px 0 2px 12px; }
    .shot { max-width: 100%; margin-top: 6px; border-radius: 4px; }
    pre { white-space: pre-wrap; word-break: break-word; font-size: 11px; margin: 6px 0 0; }
    .summary { display: flex; gap: 8px; margin-top: 8px; }
    .summary div { flex: 1; padding: 6px; border-radius: 6px; background: var(--vscode-sideBar-background); text-align: center; }
    .summary b { display: block; font-size: 16px; }
  </style>
</head>
<body>
  <div class="top">
    <div class="brand">NeuroCode</div>
    <div class="badge" id="type">not scanned</div>
  </div>
  <div class="actions">
    <button data-action="scan" id="scan">Scan</button>
    <button data-action="test" id="test">Test</button>
    <button data-action="rerun" id="rerun" class="secondary">Rerun failed</button>
    <button data-action="export" id="export" class="secondary">Export</button>
  </div>
  <div class="meta" id="meta">Scan the open project. The sidebar will list what it found, then the tests it will run.</div>
  <div class="error" id="error" hidden></div>
  <div id="summary"></div>
  <h2>Scanned project</h2>
  <div class="list" id="findings"><p class="hint">Nothing scanned yet.</p></div>
  <h2 id="plan-title">Upcoming tests</h2>
  <div id="plan"><p class="hint">Tests appear here after the scan.</p></div>
  <script nonce="${nonce}">${PANEL_SCRIPT}</script>
</body>
</html>`;
}

const PANEL_SCRIPT = `
var vscodeApi = acquireVsCodeApi();
var state = { findings: [], tests: [], scanning: false, generating: false, running: false };
var selectedId = '';

document.body.addEventListener('click', function (event) {
  var node = event.target && event.target.closest ? event.target : event.target.parentElement;
  var el = node && node.closest('[data-action]');
  if (!el || el.disabled) return;
  var action = el.getAttribute('data-action');
  if (action === 'scan') vscodeApi.postMessage({ type: 'scanProject' });
  else if (action === 'test') vscodeApi.postMessage({ type: 'runTests' });
  else if (action === 'rerun') vscodeApi.postMessage({ type: 'rerunFailed' });
  else if (action === 'export') vscodeApi.postMessage({ type: 'exportReport' });
  else if (action === 'select') {
    selectedId = el.getAttribute('data-id') || '';
    render();
  }
});

window.addEventListener('message', function (event) {
  var msg = event.data;
  if (!msg) return;
  if (msg.type === 'error') {
    state.lastError = msg.message;
    render();
    return;
  }
  if (msg.state) {
    state = msg.state;
    render();
  }
});

function render() {
  var busy = !!(state.scanning || state.generating || state.running);
  var scan = document.getElementById('scan');
  var test = document.getElementById('test');
  var rerun = document.getElementById('rerun');
  var exp = document.getElementById('export');
  scan.disabled = busy;
  test.disabled = busy || !state.tests || state.tests.length === 0;
  var failed = state.report ? (state.report.failed + state.report.errored) : 0;
  rerun.disabled = busy || failed === 0;
  exp.disabled = !state.report;
  scan.textContent = state.scanning ? 'Scanning...' : (state.generating ? 'Building plan...' : 'Scan');
  test.textContent = state.running ? 'Testing...' : 'Test';

  var type = document.getElementById('type');
  type.textContent = state.projectType || 'not scanned';

  var meta = [];
  if (state.projectName) meta.push(state.projectName);
  if (state.structureSummary) meta.push(state.structureSummary);
  if (state.targetUrl) meta.push('Target ' + state.targetUrl);
  document.getElementById('meta').textContent = meta.length
    ? meta.join(' · ')
    : 'Scan the open project. The sidebar will list what it found, then the tests it will run.';

  var error = document.getElementById('error');
  if (state.lastError) {
    error.hidden = false;
    error.textContent = state.lastError;
  } else {
    error.hidden = true;
  }

  renderSummary();
  renderFindings();
  renderPlan();
}

function renderSummary() {
  var el = document.getElementById('summary');
  if (!state.report) { el.innerHTML = ''; return; }
  var r = state.report;
  el.innerHTML = '<div class="summary">'
    + stat(r.passed, 'passed', 'pass')
    + stat(r.failed, 'failed', 'fail')
    + stat(r.errored, 'errors', 'fail')
    + stat(r.total, 'total', '')
    + '</div>';
}

function stat(n, label, cls) {
  return '<div><b class="' + cls + '">' + n + '</b>' + escapeHtml(label) + '</div>';
}

function renderFindings() {
  var el = document.getElementById('findings');
  var items = state.findings || [];
  if (state.scanning) { el.innerHTML = '<p class="hint">Reading the project...</p>'; return; }
  if (items.length === 0) { el.innerHTML = '<p class="hint">Nothing scanned yet.</p>'; return; }
  var order = ['API endpoints', 'Pages', 'Form fields', 'UI components', 'Commands', 'Scripts', 'Project files'];
  var html = '';
  order.forEach(function (group) {
    var rows = items.filter(function (item) { return item.group === group; });
    if (rows.length === 0) return;
    html += '<div class="group">' + escapeHtml(group) + ' (' + rows.length + ')</div>';
    rows.forEach(function (row) {
      html += '<div class="row"><b>' + escapeHtml(row.label) + '</b><span>' + escapeHtml(row.detail) + '</span></div>';
    });
  });
  el.innerHTML = html;
}

function renderPlan() {
  var title = document.getElementById('plan-title');
  var el = document.getElementById('plan');
  title.textContent = state.report ? 'Test results' : 'Upcoming tests';
  if (state.generating) { el.innerHTML = '<p class="hint">Building the test plan from the scan...</p>'; return; }
  var tests = state.tests || [];
  if (tests.length === 0) {
    el.innerHTML = '<p class="hint">No tests yet. Scan finds pages, forms, and API endpoints, then lists a case for each one.</p>';
    return;
  }
  var html = '';
  tests.forEach(function (test) {
    var result = findResult(test.id);
    var status = result ? result.status : 'pending';
    var mark = status === 'passed' ? 'PASS' : status === 'failed' ? 'FAIL' : status === 'error' ? 'ERROR' : 'NOT RUN';
    var cls = status === 'passed' ? 'pass' : (status === 'failed' || status === 'error') ? 'fail' : 'wait';
    html += '<article class="case' + (test.id === selectedId ? ' selected' : '') + '" data-action="select" data-id="' + escapeHtml(test.id) + '">';
    html += '<header><span class="id">' + escapeHtml(test.id) + ' · ' + escapeHtml(test.category) + ' · ' + escapeHtml(test.priority || '') + '</span>';
    html += '<span class="' + cls + '">' + mark + '</span></header>';
    html += '<div class="title">' + escapeHtml(test.title) + '</div>';
    html += '<div class="expected">What it tests: ' + escapeHtml(test.description) + '</div>';
    (test.steps || []).forEach(function (step, index) {
      html += '<div class="step">' + (index + 1) + '. ' + escapeHtml(step.type) + ' — ' + escapeHtml(step.description) + '</div>';
    });
    if (result) {
      html += '<div class="result">Result: ' + escapeHtml(result.message || status) + ' · ' + (result.durationMs / 1000).toFixed(2) + 's</div>';
      if (result.evidence) {
        if (result.evidence.responseDiff) html += '<pre>' + escapeHtml(result.evidence.responseDiff) + '</pre>';
        else if (result.evidence.outputLog) html += '<pre>' + escapeHtml(result.evidence.outputLog) + '</pre>';
        else if (result.evidence.error) html += '<pre>' + escapeHtml(result.evidence.error) + '</pre>';
        (result.evidence.screenshots || []).forEach(function (src) {
          if (String(src).indexOf('data:image/') === 0) html += '<img class="shot" alt="Screenshot" src="' + src + '" />';
        });
      }
    }
    html += '</article>';
  });
  el.innerHTML = html;
}

function findResult(id) {
  if (!state.report || !state.report.results) return null;
  for (var i = 0; i < state.report.results.length; i++) {
    if (state.report.results[i].testId === id) return state.report.results[i];
  }
  return null;
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

vscodeApi.postMessage({ type: 'getState' });
`;
