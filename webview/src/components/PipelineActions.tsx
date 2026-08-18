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
  const failedCount =
    state.report?.failed ?? 0;

  return (
    <div className="actions">
      <div className="actions-row">
        <button className="btn primary" onClick={onScan} disabled={busy}>
          {state.scanning ? 'Scanning…' : '1 · Scan Project'}
        </button>
        <button className="btn primary" onClick={onGenerate} disabled={busy || !state.projectType}>
          {state.generating ? 'Generating…' : '2 · Generate Tests'}
        </button>
      </div>
      <div className="actions-row">
        <button className="btn accent" onClick={onRun} disabled={busy || state.tests.length === 0}>
          {state.running ? 'Running…' : '▶ Run All'}
        </button>
        <button className="btn" onClick={onRerunFailed} disabled={busy || failedCount === 0} title={`Rerun ${failedCount} failed test(s)`}>
          ⟳ Rerun Failed{failedCount > 0 ? ` (${failedCount})` : ''}
        </button>
        <button className="btn" onClick={onExport} disabled={!state.report}>
          ⬇ Export
        </button>
      </div>
    </div>
  );
}
