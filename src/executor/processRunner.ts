import { execFile, spawn } from 'node:child_process';
import { ProcessSpec, TestCase, TestResult } from '../shared/types';
import { ExecutionContext, ExecutionEngine } from './engine';

/**
 * Process execution engine for CLI tools and backend services.
 * Runs commands via child_process and checks exit codes and output
 * expectations. Captures stdout/stderr as failure evidence.
 */
export class ProcessRunner implements ExecutionEngine {
  readonly kind = 'process' as const;

  async execute(test: TestCase, context: ExecutionContext): Promise<TestResult> {
    const spec = test.spec as ProcessSpec;
    const started = Date.now();

    return new Promise<TestResult>((resolve) => {
      const cwd = spec.cwd ?? context.workspaceRoot;
      const timeoutMs = spec.timeoutMs ?? 15_000;

      const child = spawn(spec.command, spec.args ?? [], {
        cwd,
        shell: false,
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGKILL');
        resolve(this.finish(test, 'error', started, 'Timed out', stdout, stderr, `Command exceeded ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on('data', (d) => (stdout += String(d)));
      child.stderr?.on('data', (d) => (stderr += String(d)));

      if (spec.stdin !== undefined) {
        child.stdin?.write(spec.stdin);
        child.stdin?.end();
      }

      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.finish(test, 'error', started, `Failed to start: ${err.message}`, stdout, stderr, err.stack));
      });

      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        const exitOk = spec.expectExitCode === undefined || code === spec.expectExitCode;
        const outputOk = !spec.expectOutputContains || spec.expectOutputContains.every((needle) => stdout.includes(needle) || stderr.includes(needle));

        if (exitOk && outputOk) {
          resolve(this.finish(test, 'passed', started, `Exit code ${code}`, stdout, stderr));
        } else {
          const reasons: string[] = [];
          if (!exitOk) reasons.push(`exit code ${code} (expected ${spec.expectExitCode})`);
          if (!outputOk) reasons.push('expected output not found');
          resolve(this.finish(test, 'failed', started, reasons.join('; '), stdout, stderr));
        }
      });
    });
  }

  private finish(
    test: TestCase,
    status: TestResult['status'],
    started: number,
    message: string,
    stdout: string,
    stderr: string,
    error?: string,
  ): TestResult {
    const log = `$ stdout:\n${stdout || '(empty)'}\n$ stderr:\n${stderr || '(empty)'}`;
    return {
      testId: test.id,
      status,
      durationMs: Date.now() - started,
      message,
      evidence: {
        outputLog: log,
        error,
      },
    };
  }
}

// Re-exported for API parity with the other runners (not used internally).
export { execFile };
