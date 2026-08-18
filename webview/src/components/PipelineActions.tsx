import { PipelineState } from '../../../src/shared/types';

interface Props {
  state: PipelineState;
  onScan: () => void;
  onGenerate: () => void;
  onRun: () => void;
  onRerunFailed: () => void;
  onExport: () => void;
}

export function PipelineActions({ state, onScan, onGenerate, onRun, onRerunFailed, onExport }: Props) {
  const busy = state.scanning || state.generating || state.running;
  const failedCount = state.report?.failed ?? 0;
  const hasTests = state.tests.length > 0;
  const hasReport = !!state.report;

  return (
    <div className="pipeline-actions">
      <div className="pipeline-step">
        <button
          className={`step-btn ${state.projectType ? 'done' : ''}`}
          onClick={onScan}
          disabled={busy}
        >
          <span className="step-number">1</span>
          <span className="step-label">{state.scanning ? 'Scanning…' : 'Scan Project'}</span>
        </button>
      </div>

      <div className="pipeline-step">
        <button
          className={`step-btn ${hasTests ? 'done' : ''}`}
          onClick={onGenerate}
          disabled={busy || !state.projectType}
        >
          <span className="step-number">2</span>
          <span className="step-label">{state.generating ? 'Generating…' : 'Generate Tests'}</span>
        </button>
      </div>

      <div className="pipeline-divider" />

      <div className="pipeline-row">
        <button
          className="action-btn primary"
          onClick={onRun}
          disabled={busy || !hasTests}
        >
          {state.running ? <><span className="spinner-sm" /> Running…</> : '▶ Run All Tests'}
        </button>
      </div>

      <div className="pipeline-row">
        <button
          className="action-btn"
          onClick={onRerunFailed}
          disabled={busy || failedCount === 0}
        >
          ⟳ Rerun Failed{failedCount > 0 ? ` (${failedCount})` : ''}
        </button>
        <button
          className="action-btn"
          onClick={onExport}
          disabled={!hasReport}
        >
          ⬇ Export
        </button>
      </div>
    </div>
  );
}
