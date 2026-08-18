import { BrowserAction, HttpSpec, ProjectStructure, TestCase } from '../shared/types';

/**
 * Deterministic, rule-based test generator used when no LLM API key is
 * configured. Produces positive/negative/boundary tests directly from the
 * scanned structure so the pipeline is fully usable offline and testable
 * without external services.
 */
export class MockGenerator {
  constructor(private readonly structure: ProjectStructure) {}

  generate(): TestCase[] {
    const tests: TestCase[] = [];
    let n = 0;

    const api = this.structure.api;
    if (api && api.endpoints.length > 0) {
      for (const ep of api.endpoints.slice(0, 15)) {
        const base = this.baseUrl(api.baseUrl);
        const url = `${base}${ep.path}`;

        if (['GET', 'HEAD', 'OPTIONS', 'ANY', 'PAGE'].includes(ep.method)) {
          tests.push(
            this.httpTest(++n, 'positive', `GET ${ep.path} returns 200`, { method: 'GET', url }, 'The request succeeds with status 200 and a valid response body.')
          );
          tests.push(
            this.httpTest(++n, 'boundary', `GET ${ep.path} with unknown query parameter`, { method: 'GET', url: `${url}?unknown=value` }, 'The endpoint tolerates unexpected query parameters without crashing (returns 400/422 or ignores them, never 500).')
          );
        } else {
          const validPayload = this.payloadFor(ep.path);
          tests.push(
            this.httpTest(++n, 'positive', `POST ${ep.path} with valid payload`, { method: 'POST', url, body: validPayload }, 'The endpoint accepts the payload and returns a success status (2xx).')
          );
          tests.push(
            this.httpTest(++n, 'negative', `POST ${ep.path} with invalid payload`, { method: 'POST', url, body: {} }, 'The endpoint rejects the payload with 400/422 and a descriptive validation error.')
          );
          if (Object.keys(validPayload).length > 0) {
            tests.push(
              this.httpTest(++n, 'boundary', `POST ${ep.path} with missing required fields`, { method: 'POST', url, body: this.partialPayload(validPayload) }, 'The endpoint rejects a partial payload with a validation error (400/422), never 500.')
            );
          }
        }
      }
    }

    const web = this.structure.web;
    if (web && (web.routes.length > 0 || web.forms.length > 0)) {
      const entry = web.routes.find((r) => r.path === '/')?.path ?? '/';
      tests.push(
        this.browserTest(++n, 'positive', 'Home page loads successfully', [
          { type: 'goto', url: entry },
          { type: 'waitFor', selector: 'body' },
          { type: 'screenshot' },
        ], 'The home page renders without JavaScript errors.')
      );

      for (const form of web.forms.slice(0, 5)) {
        tests.push(
          this.browserTest(++n, 'positive', `Submit form field "${form.name}" with a valid value`, [
            { type: 'goto', url: '/' },
            { type: 'fill', selector: `[name="${form.name}"]`, value: 'valid-value' },
            { type: 'click', selector: 'button[type="submit"], button' },
          ], 'The form accepts the value and submission proceeds (success state or validation pass).')
        );
        if (form.required) {
          tests.push(
            this.browserTest(++n, 'negative', `Submit form without required field "${form.name}"`, [
              { type: 'goto', url: '/' },
              { type: 'click', selector: 'button[type="submit"], button' },
            ], 'The form shows a validation error for the missing required field and does not submit.')
          );
          tests.push(
            this.browserTest(++n, 'boundary', `Boundary-length value for "${form.name}"`, [
              { type: 'goto', url: '/' },
              { type: 'fill', selector: `[name="${form.name}"]`, value: 'x'.repeat(255) },
              { type: 'click', selector: 'button[type="submit"], button' },
            ], 'The field handles a 255-character value gracefully (accepts or shows validation message, no crash).')
          );
        }
      }
    }

    const cli = this.structure.cli;
    if (cli && cli.commands.length > 0) {
      for (const cmd of cli.commands.slice(0, 5)) {
        tests.push(
          this.processTest(++n, 'positive', `CLI command "${cmd.name}" runs successfully`, cmd.name, [], 0, `The command exits with code 0 and prints expected output.`)
        );
        tests.push(
          this.processTest(++n, 'negative', `CLI command "${cmd.name}" with invalid flag`, cmd.name, ['--definitely-not-a-flag'], undefined, `The command rejects the unknown flag with a non-zero exit code and an error message.`)
        );
      }
    }

    return tests;
  }

  private baseUrl(configured?: string): string {
    return configured ?? 'http://localhost:3000';
  }

  /**
   * Builds a realistic payload for a POST/PUT endpoint using the first
   * matching schema, falling back to a generic placeholder.
   */
  private payloadFor(endpointPath: string): Record<string, unknown> {
    const schema = this.schemaFor(endpointPath);
    if (!schema || schema.fields.length === 0) return { placeholder: 'valid-value' };

    const payload: Record<string, unknown> = {};
    for (const field of schema.fields) {
      payload[field.name] = this.sampleValue(field.type);
    }
    return payload;
  }

  private partialPayload(full: Record<string, unknown>): Record<string, unknown> {
    const keys = Object.keys(full);
    if (keys.length <= 1) return {};
    return Object.fromEntries(keys.slice(0, Math.max(1, Math.floor(keys.length / 2))).map((k) => [k, full[k]]));
  }

  private schemaFor(endpointPath: string) {
    const schemas = this.structure.api?.schemas ?? [];
    const pathSegment = endpointPath.split('/').filter(Boolean).pop()?.toLowerCase();
    // Match by singularized resource name, e.g. /api/users -> user / User
    const candidates = schemas.filter((s) => {
      const name = s.name.toLowerCase();
      return pathSegment && (name === pathSegment || name === pathSegment.replace(/s$/, '') || name.endsWith(pathSegment.replace(/s$/, '')));
    });
    return candidates[0] ?? schemas[0];
  }

  private sampleValue(type: string): unknown {
    const t = type.toLowerCase();
    if (/(number|int|float|double)/.test(t)) return 42;
    if (/(boolean|bool)/.test(t)) return true;
    if (/(date|time)/.test(t)) return '2026-01-01';
    if (/(string\[\]|array)/.test(t)) return ['a', 'b'];
    if (t.includes('?')) return 'test-value';
    if (/(string|enum)/.test(t)) return 'test-value';
    return 'test-value';
  }

  private httpTest(id: number, category: TestCase['category'], title: string, spec: HttpSpec, expected: string): TestCase {
    return {
      id: `t${id}`,
      category,
      title,
      description: title,
      engine: 'http',
      spec,
      expected,
    };
  }

  private browserTest(id: number, category: TestCase['category'], title: string, actions: BrowserAction[], expected: string): TestCase {
    return {
      id: `t${id}`,
      category,
      title,
      description: title,
      engine: 'browser',
      spec: { url: this.baseUrl(), actions },
      expected,
    };
  }

  private processTest(id: number, category: TestCase['category'], title: string, command: string, args: string[], expectExitCode: number | undefined, expected: string): TestCase {
    return {
      id: `t${id}`,
      category,
      title,
      description: title,
      engine: 'process',
      spec: { command, args, expectExitCode, timeoutMs: 15_000 },
      expected,
    };
  }
}
