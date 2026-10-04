import { useCallback, useEffect, useState } from 'react';
import { PipelineState, TestCase, TestReport, WebviewRequest, WebviewResponse } from '../../src/shared/types';
import { SummaryCards } from './components/SummaryCards';
import { PipelineActions } from './components/PipelineActions';
import { TestList } from './components/TestList';
import { TestDetail } from './components/TestDetail';

// Safely acquire the VS Code API — the extension host injects this globally.
// If it's missing (e.g. opened outside VS Code), fall back to a no-op so the
// UI still renders instead of crashing with a blank screen.
const vscode: { postMessage: (msg: unknown) => void } = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const api = (globalThis as any).acquireVsCodeApi?.();
    if (api) return api;
  } catch {
    // ignore
  }
  return { postMessage: () => undefined };
})();

const EMPTY_STATE: PipelineState = {
  findings: [],
  tests: [],
  generating: false,
  scanning: false,
  running: false,
};

export function App() {
  const [state, setState] = useState<PipelineState>(EMPTY_STATE);
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>();

  useEffect(() => {
    const handler = (event: MessageEvent<WebviewResponse>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'state':
        case 'scanDone':
        case 'testsGenerated':
        case 'runStarted':
        case 'runProgress':
        case 'runDone':
          setState(msg.state);
          break;
        case 'error':
          setState((s) => ({ ...s, lastError: msg.message }));
          break;
      }
    };
    window.addEventListener('message', handler);
    post({ type: 'getState' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const post = useCallback((req: WebviewRequest) => {
    vscode.postMessage(req);
  }, []);

  const selectedTest = state.tests.find((t) => t.id === selectedTestId);
  const report = state.report;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-logo">
          <span className="logo-icon">N</span>
          <span className="logo-text">NeuroCode</span>
        </div>
        {state.projectType && (
          <span className="project-type-badge">{state.projectType}</span>
        )}
      </header>

      <PipelineActions
        state={state}
        onScan={() => post({ type: 'scanProject' })}
        onGenerate={() => post({ type: 'generateTests' })}
        onRun={() => post({ type: 'runTests' })}
        onRerunFailed={() => post({ type: 'rerunFailed' })}
        onExport={() => post({ type: 'exportReport' })}
      />

      {state.lastError && (
        <div className="error-banner">
          <span className="error-icon">!</span>
          {state.lastError}
        </div>
      )}

      {state.projectName && (
        <div className="project-card">
          <div className="project-name">{state.projectName}</div>
          <div className="project-meta">
            {state.scannedAt && <span>Scanned {new Date(state.scannedAt).toLocaleTimeString()}</span>}
            {state.structureSummary && <span>{state.structureSummary}</span>}
          </div>
        </div>
      )}

      {!state.projectName && !state.scanning && (
        <div className="empty-state">
          <div className="empty-icon">scan</div>
          <p>No project scanned yet.</p>
          <p className="empty-hint">Click <strong>Scan Project</strong> to detect the project type and extract testable elements.</p>
        </div>
      )}

      {state.scanning && (
        <div className="loading-state">
          <div className="spinner" />
          <p>Scanning project structure...</p>
        </div>
      )}

      {report && <SummaryCards report={report} />}

      {state.tests.length > 0 && (
        <TestList
          tests={state.tests}
          report={report}
          running={state.running}
          selectedTestId={selectedTestId}
          onSelect={setSelectedTestId}
          onToggle={runSingle}
        />
      )}

      {selectedTest && (
        <TestDetail
          test={selectedTest}
          result={report?.results.find((r) => r.testId === selectedTest.id)}
          onDelete={() => {
            post({ type: 'deleteTest', testId: selectedTest.id });
            setSelectedTestId(undefined);
          }}
        />
      )}
    </div>
  );

  function runSingle(test: TestCase) {
    post({ type: 'runTests', testIds: [test.id] });
  }
}
