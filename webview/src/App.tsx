import { useCallback, useEffect, useState } from 'react';
import { PipelineState, TestCase, TestReport, WebviewRequest, WebviewResponse } from '../../src/shared/types';
import { SummaryCards } from './components/SummaryCards';
import { PipelineActions } from './components/PipelineActions';
import { TestList } from './components/TestList';
import { TestDetail } from './components/TestDetail';

const vscode = acquireVsCodeApi();

const EMPTY_STATE: PipelineState = {
  tests: [],
  generating: false,
  scanning: false,
  running: false,
};

export function App() {
  const [state, setState] = useState<PipelineState>(EMPTY_STATE);
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>();
  const [lastRun, setLastRun] = useState<TestReport | undefined>();

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
          if (msg.state.report) setLastRun(msg.state.report);
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
  const report = state.report ?? lastRun;

  return (
    <div className="app">
      <header className="app-header">
        <h1>NeuroCode</h1>
        <span className="project-type">{state.projectType ?? 'no project scanned'}</span>
      </header>

      <PipelineActions
        state={state}
        onScan={() => post({ type: 'scanProject' })}
        onGenerate={() => post({ type: 'generateTests' })}
        onRun={() => post({ type: 'runTests' })}
        onRerunFailed={() => post({ type: 'rerunFailed' })}
        onExport={() => post({ type: 'exportReport' })}
      />

      {state.lastError && <div className="error-banner">{state.lastError}</div>}

      {state.projectName && (
        <div className="project-card">
          <div className="project-name">{state.projectName}</div>
          <div className="project-meta">
            {state.scannedAt && <span>Scanned {new Date(state.scannedAt).toLocaleTimeString()}</span>}
            {state.structureSummary && <span>{state.structureSummary}</span>}
          </div>
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
