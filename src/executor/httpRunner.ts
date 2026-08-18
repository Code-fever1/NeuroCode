import { HttpSpec, TestCase, TestResult } from '../shared/types';
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

      const ok = response.ok;
      const statusPass = ok || response.status < 500;

      // Heuristic: 5xx responses are always failures; 4xx may be the
      // expected outcome of negative tests, verified against the expectation text.
      const mentions4xx = /4\d\d|400|401|403|404|422|reject|invalid|error/i.test(test.expected);
      const pass = ok || (mentions4xx && response.status >= 400 && response.status < 500);

      const diff = this.buildDiff(test, response.status, responseBody);

      return {
        testId: test.id,
        status: pass ? 'passed' : 'failed',
        durationMs,
        message: pass
          ? `${spec.method} ${spec.url} -> ${response.status}`
          : `${spec.method} ${spec.url} returned ${response.status} (${statusPass ? 'unexpected 4xx' : 'server error'})`,
        evidence: {
          responseDiff: diff,
          error: pass ? undefined : `HTTP ${response.status}`,
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
