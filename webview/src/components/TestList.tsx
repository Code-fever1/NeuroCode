import { TestCase, TestReport, TestStatus } from '../../../src/shared/types';

interface Props {
  tests: TestCase[];
  report?: TestReport;
  running: boolean;
  selectedTestId?: string;
  onSelect: (id: string) => void;
  onToggle: (test: TestCase) => void;
}

const CATEGORY_ORDER: TestCase['category'][] = ['positive', 'negative', 'boundary', 'regression'];

const CATEGORY_LABEL: Record<TestCase['category'], string> = {
  positive: 'Positive',
  negative: 'Negative',
  boundary: 'Boundary',
  regression: 'Regression',
};

export function TestList({ tests, report, running, selectedTestId, onSelect, onToggle }: Props) {
  const statusOf = (id: string): TestStatus | undefined => report?.results.find((r) => r.testId === id)?.status;
  const byCategory = (cat: TestCase['category']) => tests.filter((t) => t.category === cat);
  const present = CATEGORY_ORDER.filter((c) => byCategory(c).length > 0);

  return (
    <section className="test-list">
      <h2>Test Cases ({tests.length})</h2>
      {present.map((cat) => (
        <div key={cat} className="test-group">
          <h3>{CATEGORY_LABEL[cat]} ({byCategory(cat).length})</h3>
          <ul>
            {byCategory(cat).map((t) => (
              <TestRow
                key={t.id}
                test={t}
                status={statusOf(t.id)}
                running={running}
                selected={t.id === selectedTestId}
                onSelect={() => onSelect(t.id)}
                onToggle={() => onToggle(t)}
              />
            ))}
          </ul>
        </div>
      ))}
      {tests.length === 0 && <p className="empty">No test cases yet — generate them from the scanned structure.</p>}
    </section>
  );
}

function TestRow({
  test,
  status,
  running,
  selected,
  onSelect,
  onToggle,
}: {
  test: TestCase;
  status?: TestStatus;
  running: boolean;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <li className={`test-row ${selected ? 'selected' : ''} ${status ?? ''}`}>
      <button className="test-toggle" onClick={onToggle} disabled={running} title="Run this test">
        {status === 'passed' ? '✓' : status === 'failed' ? '✗' : status === 'error' ? '!' : '▶'}
      </button>
      <button className="test-title" onClick={onSelect} title={test.title}>
        <span className="engine-tag">{test.engine}</span>
        {test.title}
      </button>
    </li>
  );
}
