import { TestCase, TestResult } from '../../../src/shared/types';

interface Props {
  test: TestCase;
  result?: TestResult;
  onDelete: () => void;
}

export function TestDetail({ test, result, onDelete }: Props) {
  return (
    <section className="test-detail">
      <h2>{test.title}</h2>
      <p className="detail-expected">{test.expected}</p>

      <h3>Spec</h3>
      <pre className="spec">{JSON.stringify(test.spec, null, 2)}</pre>

      {result && (
        <>
          <h3>Result — {result.status} ({(result.durationMs / 1000).toFixed(2)}s)</h3>
          {result.message && <p className={`result-message ${result.status}`}>{result.message}</p>}
          {result.evidence?.error && <pre className="evidence error">{result.evidence.error}</pre>}
          {result.evidence?.responseDiff && <pre className="evidence">{result.evidence.responseDiff}</pre>}
          {result.evidence?.outputLog && <pre className="evidence">{result.evidence.outputLog}</pre>}
          {result.evidence?.screenshots?.map((src, i) => (
            <img key={i} className="evidence-img" src={src} alt={`Failure screenshot ${i + 1}`} />
          ))}
        </>
      )}

      <button className="action-btn danger" onClick={onDelete}>
        Delete test
      </button>
    </section>
  );
}
