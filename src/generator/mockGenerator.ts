import { BrowserAction, HttpSpec, ProjectStructure, TestCase, TestCategory } from '../shared/types';
import { browserSteps, httpSteps, joinUrl, priorityFor, processSteps } from './planSteps';

/**
 * Deterministic, rule-based test generator used when no LLM API key is
 * configured. Produces positive/negative/boundary tests directly from the
 * scanned structure so the pipeline is fully usable offline and testable
 * without external services.
 */
export class MockGenerator {
  constructor(
    private readonly structure: ProjectStructure,
    private readonly appUrl = 'http://localhost:3000',
  ) {}

  generate(): TestCase[] {
    const tests: TestCase[] = [];
    let n = 0;

    const api = this.structure.api;
    if (api && api.endpoints.length > 0) {
      for (const ep of api.endpoints.slice(0, 12)) {
        const base = this.baseUrl(api.baseUrl);
        const url = joinUrl(base, ep.path);
        const method = ep.method === 'ANY' || ep.method === 'PAGE' ? 'GET' : ep.method;

        if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          const positive = 'The request succeeds with status 200 and a valid response body.';
          tests.push(this.httpTest(++n, 'positive', `${method} ${ep.path} returns 200`, { method: method as HttpSpec['method'], url }, positive, `Happy path for ${method} ${ep.path}.`));
          tests.push(this.httpTest(++n, 'boundary', `${method} ${ep.path} with an unknown query parameter`, { method: method as HttpSpec['method'], url, query: { unknown: 'value' } }, 'The endpoint tolerates an unexpected query parameter and does not return 500.', `Boundary query on ${method} ${ep.path}.`));
          tests.push(this.httpTest(++n, 'negative', `${method} ${ep.path} rejects an unknown subpath`, { method: method as HttpSpec['method'], url: joinUrl(base, `${ep.path.replace(/\/$/, '')}/__missing__`) }, 'An unknown subpath is rejected with 404 and never 500.', `Negative path under ${ep.path}.`));
          tests.push(this.httpTest(++n, 'regression', `${method} ${ep.path} still returns success`, { method: method as HttpSpec['method'], url }, 'Regression check: the primary success path still returns 200.', `Re-check the critical ${method} ${ep.path} flow.`));
        } else {
          const schema = this.schemaFor(ep.path);
          const validPayload = this.payloadFor(schema);
          const httpMethod = method as HttpSpec['method'];
          const described = schema
            ? `Body is built from schema ${schema.name}.`
            : 'No matching request schema was found, so the body is a placeholder.';
          tests.push(this.httpTest(++n, 'positive', `${method} ${ep.path} accepts a valid payload`, { method: httpMethod, url, body: validPayload }, 'The endpoint accepts the payload and returns a success status (2xx).', described));
          tests.push(this.httpTest(++n, 'negative', `${method} ${ep.path} rejects an empty payload`, { method: httpMethod, url, body: {} }, 'The endpoint rejects an empty payload with 400 or 422 and does not return 500.', `Invalid body for ${method} ${ep.path}.`));
          if (Object.keys(validPayload).length > 1) {
            tests.push(this.httpTest(++n, 'boundary', `${method} ${ep.path} with missing fields`, { method: httpMethod, url, body: this.partialPayload(validPayload) }, 'A partial payload is rejected with 400 or 422, never 500.', `Missing fields on ${method} ${ep.path}.`));
          }
          tests.push(this.httpTest(++n, 'regression', `${method} ${ep.path} still accepts a valid payload`, { method: httpMethod, url, body: validPayload }, 'Regression check: a valid payload is still accepted with a 2xx status.', `Re-check the critical ${method} ${ep.path} flow.`));
        }
      }
    }

    const web = this.structure.web;
    if (web && (web.routes.length > 0 || web.forms.length > 0)) {
      const entryPath = web.routes.find((r) => r.path === '/')?.path ?? web.routes[0]?.path ?? '/';
      const entry = joinUrl(this.baseUrl(), entryPath);
      tests.push(
        this.browserTest(++n, 'positive', `Page ${entryPath} loads`, [
          { type: 'goto', url: entry },
          { type: 'waitFor', selector: 'body' },
          { type: 'screenshot' },
        ], 'The page renders a document body and does not crash.', `Load ${entryPath}.`)
      );
      tests.push(
        this.browserTest(++n, 'regression', `Page ${entryPath} still loads`, [
          { type: 'goto', url: entry },
          { type: 'waitFor', selector: 'body' },
        ], 'Regression check: the primary page still renders.', `Re-check ${entryPath}.`)
      );

      for (const form of web.forms.slice(0, 5)) {
        const page = joinUrl(this.baseUrl(), '/');
        tests.push(
          this.browserTest(++n, 'positive', `Submit "${form.name}" with a valid value`, [
            { type: 'goto', url: page },
            { type: 'fill', selector: `[name="${form.name}"]`, value: 'valid-value' },
            { type: 'click', selector: 'button[type="submit"], button' },
          ], 'The form accepts the value and submission proceeds.', `Valid value for required field ${form.name} (${form.type}).`)
        );
        if (form.required) {
          tests.push(
            this.browserTest(++n, 'negative', `Submit without required field "${form.name}"`, [
              { type: 'goto', url: page },
              { type: 'click', selector: 'button[type="submit"], button' },
            ], 'The form shows a validation error for the missing required field and does not submit.', `Empty required field ${form.name}.`)
          );
          tests.push(
            this.browserTest(++n, 'boundary', `Boundary-length value for "${form.name}"`, [
              { type: 'goto', url: page },
              { type: 'fill', selector: `[name="${form.name}"]`, value: 'x'.repeat(255) },
              { type: 'click', selector: 'button[type="submit"], button' },
            ], 'A 255-character value is accepted or rejected with a validation message, and the page does not crash.', `Long value for ${form.name}.`)
          );
        }
      }
    }

    const cli = this.structure.cli;
    if (cli && cli.commands.length > 0) {
      for (const cmd of cli.commands.slice(0, 5)) {
        tests.push(
          this.processTest(++n, 'positive', `Command "${cmd.name}" exits successfully`, cmd.name, [], 0, 'The command exits with code 0.', `Run ${cmd.name} with no extra arguments.`)
        );
        tests.push(
          this.processTest(++n, 'negative', `Command "${cmd.name}" rejects an unknown flag`, cmd.name, ['--definitely-not-a-flag'], undefined, 'The command rejects the unknown flag with a non-zero exit code and an error message.', `Invalid flag for ${cmd.name}.`)
        );
      }
    }

    return tests;
  }

  private baseUrl(configured?: string): string {
    return configured && configured.length > 0 ? configured : this.appUrl;
  }

  /**
   * Builds a realistic payload for a POST/PUT endpoint using the first
   * matching schema, falling back to a generic placeholder.
   */
  private payloadFor(schema: ReturnType<MockGenerator['schemaFor']>): Record<string, unknown> {
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
    return candidates[0];
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

  private httpTest(id: number, category: TestCategory, title: string, spec: HttpSpec, expected: string, description: string): TestCase {
    return {
      id: caseId(id),
      category,
      priority: priorityFor(category),
      title,
      description,
      steps: httpSteps(spec, expected),
      engine: 'http',
      spec,
      expected,
    };
  }

  private browserTest(id: number, category: TestCategory, title: string, actions: BrowserAction[], expected: string, description: string): TestCase {
    const spec = { url: this.baseUrl(), actions };
    return {
      id: caseId(id),
      category,
      priority: priorityFor(category),
      title,
      description,
      steps: browserSteps(spec, expected),
      engine: 'browser',
      spec,
      expected,
    };
  }

  private processTest(id: number, category: TestCategory, title: string, command: string, args: string[], expectExitCode: number | undefined, expected: string, description: string): TestCase {
    const spec = { command, args, expectExitCode, timeoutMs: 15_000 };
    return {
      id: caseId(id),
      category,
      priority: priorityFor(category),
      title,
      description,
      steps: processSteps(spec, expected),
      engine: 'process',
      spec,
      expected,
    };
  }
}

function caseId(id: number): string {
  return `TC${String(id).padStart(3, '0')}`;
}
