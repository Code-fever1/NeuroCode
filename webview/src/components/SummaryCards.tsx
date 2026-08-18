import { TestReport } from '../../../src/shared/types';

export function SummaryCards({ report }: { report: TestReport }) {
  const passRate = report.total > 0 ? Math.round((report.passed / report.total) * 100) : 0;

  const cards = [
    { label: 'Passed', value: report.passed, cls: 'ok' },
    { label: 'Failed', value: report.failed, cls: 'bad' },
    { label: 'Errors', value: report.errored, cls: 'warn' },
    { label: 'Skipped', value: report.skipped, cls: 'muted' },
  ];

  return (
    <section className="summary">
      <div className="summary-cards">
        {cards.map((c) => (
          <div key={c.label} className={`summary-card ${c.cls}`}>
            <div className="summary-value">{c.value}</div>
            <div className="summary-label">{c.label}</div>
          </div>
        ))}
      </div>
      <div className="summary-bar">
        <div className="summary-bar-fill" style={{ width: `${passRate}%` }} />
      </div>
      <div className="summary-meta">
        <span>{passRate}% pass rate</span>
        <span>{(report.durationMs / 1000).toFixed(1)}s</span>
        <span>{new Date(report.generatedAt).toLocaleTimeString()}</span>
      </div>
    </section>
  );
}
