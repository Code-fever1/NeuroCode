import { HttpSpec, TestCase, TestCategory, TestResult } from '../shared/types';
import { ExecutionContext, ExecutionEngine } from './engine';

/**
 * HTTP execution engine for REST/GraphQL API tests.
 * Uses the built-in fetch API; captures status, response diff against
 * expectations, and error details as failure evidence.
 */
export class HttpRunner implements ExecutionEngine {
  readonly kind = 'http' as const;

  async execute(test: TestCase, _context: ExecutionContext): Promise<TestResult> {
    const spec = test.spec as HttpSpec;
    const started = Date.now();

    try {
      const url = new URL(spec.url);
      if (spec.query) {
        for (const [k, v] of Object.entries(spec.query)) url.searchParams.set(k, v);
      }

      const response = await fetch(url.toString(), {
        method: spec.method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...spec.headers },
        body: spec.body !== undefined ? JSON.stringify(spec.body) : undefined,
      });

      const durationMs = Date.now() - started;
      const responseBody = await response.text();
      const verdict = judgeHttp(test.category, test.expected, response.status);
      const diff = this.buildDiff(test, response.status, responseBody);

      return {
        testId: test.id,
        status: verdict.pass ? 'passed' : 'failed',
        durationMs,
        message: `${spec.method} ${spec.url} -> ${response.status}. ${verdict.reason}`,
        evidence: {
          responseDiff: diff,
          error: verdict.pass ? undefined : `HTTP ${response.status}: ${verdict.reason}`,
        },
      };
    } catch (err) {
      return {
        testId: test.id,
        status: 'error',
        durationMs: Date.now() - started,
        message: `Request failed: ${err instanceof Error ? err.message : String(err)}`,
        evidence: { error: err instanceof Error ? err.stack : String(err) },
      };
    }
  }

  private buildDiff(test: TestCase, status: number, body: string): string {
    const truncated = body.length > 2000 ? `${body.slice(0, 2000)}\n... (truncated)` : body;
    return [
      `Test: ${test.title}`,
      `Expected: ${test.expected}`,
      `Actual:   HTTP ${status}`,
      `Response body:`,
      truncated || '(empty)',
    ].join('\n');
  }
}

/**
 * A 2xx is success. A negative case passes only when the server rejects it.
 * A 5xx fails every category, including boundary checks that only require "no crash".
 */
function judgeHttp(category: TestCategory, expected: string, status: number): { pass: boolean; reason: string } {
  if (status >= 500) {
    return { pass: false, reason: 'Server error. A test must never accept a 500.' };
  }

  const wantsRejection = category === 'negative' || (category !== 'boundary' && /\b(400|401|403|404|422|reject)\b/i.test(expected));
  if (wantsRejection) {
    const rejected = status >= 400 && status < 500;
    return rejected
      ? { pass: true, reason: 'Rejected as expected.' }
      : { pass: false, reason: `Expected a 4xx rejection, got ${status}.` };
  }

  if (category === 'boundary') {
    return { pass: true, reason: 'No server error.' };
  }

  const ok = status >= 200 && status < 300;
  return ok
    ? { pass: true, reason: 'Success status.' }
    : { pass: false, reason: `Expected a 2xx success, got ${status}.` };
}
