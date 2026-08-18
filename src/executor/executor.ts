import { TestCase, TestReport, TestResult } from '../shared/types';
import { ExecutionContext } from './engine';
import { HttpRunner } from './httpRunner';
import { PlaywrightRunner } from './playwrightRunner';
import { ProcessRunner } from './processRunner';

export interface RunOptions {
  onProgress?: (result: TestResult, index: number, total: number) => void;
}

/**
 * Dispatches each test case to the engine matching its `engine` field and
 * aggregates results into a TestReport.
 */
export class Executor {
  private readonly http = new HttpRunner();
  private readonly browser = new PlaywrightRunner();
  private readonly process = new ProcessRunner();

  async run(tests: TestCase[], context: ExecutionContext, options: RunOptions = {}): Promise<TestReport> {
    const started = Date.now();
    const results: TestResult[] = [];
    let completed = 0;

    for (const test of tests) {
      let result: TestResult;
      try {
        const engine =
          test.engine === 'browser' ? this.browser : test.engine === 'process' ? this.process : this.http;
        result = await engine.execute(test, context);
      } catch (err) {
        result = {
          testId: test.id,
          status: 'error',
          durationMs: 0,
          message: err instanceof Error ? err.message : String(err),
        };
      }
      results.push(result);
      completed += 1;
      options.onProgress?.(result, completed, tests.length);
    }

    const report: TestReport = {
      projectName: context.workspaceRoot.split(/[\\/]/).pop() ?? 'project',
      projectType: 'unknown',
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      errored: results.filter((r) => r.status === 'error').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    };

    return report;
  }
}
