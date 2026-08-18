import { ProjectStructure, TestCase, TestCategory } from '../shared/types';
import { LlmProvider } from './llmProvider';
import { MockGenerator } from './mockGenerator';

export interface GenerationConfig {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  maxTestCases: number;
  appUrl?: string;
}

export interface GenerationOptions {
  onProgress?: (message: string) => void;
}

const CATEGORIES: TestCategory[] = ['positive', 'negative', 'boundary', 'regression'];

/**
 * AI test generation pipeline: builds a compact context document from the
 * scanned project structure, asks the LLM for structured test cases, and
 * validates/normalizes the output. Falls back to the rule-based MockGenerator
 * when no API key is available.
 */
export class TestGenerator {
  constructor(
    private readonly structure: ProjectStructure,
    private readonly config: GenerationConfig,
  ) {}

  async generate(options: GenerationOptions = {}): Promise<TestCase[]> {
    const context = this.buildContext();

    if (!this.config.apiKey) {
      options.onProgress?.('No API key configured — using rule-based mock generator.');
      return new MockGenerator(this.structure).generate().slice(0, this.config.maxTestCases);
    }

    options.onProgress?.('Calling LLM for test case generation...');
    const provider = new LlmProvider({
      apiBaseUrl: this.config.apiBaseUrl,
      apiKey: this.config.apiKey,
      model: this.config.model,
    });

    const result = await provider.generate(this.systemPrompt(), this.userPrompt(context));
    options.onProgress?.('Validating LLM output...');
    const tests = this.parseLlmOutput(result.raw ?? '');
    options.onProgress?.(`Generated ${tests.length} test cases.`);

    if (tests.length === 0) {
      options.onProgress?.('LLM returned no usable tests — falling back to mock generator.');
      return new MockGenerator(this.structure).generate().slice(0, this.config.maxTestCases);
    }
    return tests.slice(0, this.config.maxTestCases);
  }

  private buildContext(): string {
    const s = this.structure;
    const lines: string[] = [
      `Project: ${s.name}`,
      `Type: ${s.projectType}`,
      `Package manager: ${s.packageManager ?? 'unknown'}`,
      `Scripts: ${JSON.stringify(s.scripts ?? {})}`,
      `Dependencies: ${s.dependencies.slice(0, 20).join(', ')}`,
    ];

    if (s.api) {
      lines.push('--- API ENDPOINTS ---');
      for (const ep of s.api.endpoints.slice(0, 40)) {
        lines.push(`${ep.method} ${ep.path} (${ep.file}:${ep.line})`);
      }
      if (s.api.schemas.length > 0) {
        lines.push('--- SCHEMAS ---');
        for (const schema of s.api.schemas.slice(0, 10)) {
          const fields = schema.fields.map((f) => `${f.name}:${f.type}`).join(', ');
          lines.push(`${schema.name}: { ${fields} }`);
        }
      }
    }

    if (s.web) {
      lines.push('--- WEB ROUTES ---');
      for (const r of s.web.routes.slice(0, 40)) {
        lines.push(`PAGE ${r.path} (${r.file}:${r.line})`);
      }
      if (s.web.forms.length > 0) {
        lines.push('--- FORM FIELDS ---');
        for (const f of s.web.forms.slice(0, 30)) {
          lines.push(`${f.name} (${f.type})${f.required ? ' required' : ''}`);
        }
      }
    }

    if (s.cli) {
      lines.push('--- CLI COMMANDS ---');
      for (const c of s.cli.commands.slice(0, 20)) {
        lines.push(`${c.name} ${c.args.join(' ')}`.trim());
      }
    }

    return lines.join('\n');
  }

  private systemPrompt(): string {
    return [
      'You are NeuroCode, an expert software QA engineer that generates structured test cases from a project scan.',
      'You MUST respond with a single JSON object of the form:',
      '{"tests": [ { "category": "positive|negative|boundary|regression", "title": "short title", "description": "what is being tested", "engine": "http|browser|process", "spec": {...}, "expected": "observable expected behavior" } ]}',
      '',
      'Rules:',
      '- Generate a balanced mix of positive, negative, boundary, and regression cases.',
      '- For engine "http": spec = { "method": "GET|POST|PUT|PATCH|DELETE", "url": "/absolute/path", "headers": {...}, "query": {...}, "body": {...} }. Use the base URL http://localhost:3000 unless the project indicates another port.',
      '- For engine "browser": spec = { "url": "http://localhost:3000/path", "actions": [ { "type": "goto|click|fill|press|waitFor|expectText|expectUrl|screenshot", "selector": "css selector", "value": "text to type", "text": "expected text", "url": "expected url" } ] }.',
      '- For engine "process": spec = { "command": "npm", "args": [...], "expectExitCode": 0, "expectOutputContains": ["..."] }.',
      '- Never invent endpoints, routes, fields, or files that are not present in the provided context.',
      '- "regression" cases should re-verify a key flow that recently changed or is critical.',
      '- Keep every title under 90 characters and every "expected" under 200 characters.',
    ].join('\n');
  }

  private userPrompt(context: string): string {
    return [
      'Generate a test plan for the project described below.',
      '',
      context,
      '',
      `Generate at most 25 test cases. Output ONLY the JSON object.`,
    ].join('\n');
  }

  private parseLlmOutput(raw: string): TestCase[] {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
      throw new Error('LLM response did not contain a JSON object');
    }

    let parsed: { tests?: unknown[] };
    try {
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch (err) {
      throw new Error(`LLM response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!Array.isArray(parsed.tests)) {
      throw new Error('LLM response missing "tests" array');
    }

    const tests: TestCase[] = [];
    let n = 0;
    for (const t of parsed.tests) {
      if (!t || typeof t !== 'object') continue;
      const rec = t as Record<string, unknown>;
      const category = CATEGORIES.includes(rec.category as TestCategory) ? (rec.category as TestCategory) : 'positive';
      const engine = ['http', 'browser', 'process'].includes(rec.engine as string) ? (rec.engine as TestCase['engine']) : 'http';
      const title = typeof rec.title === 'string' ? rec.title : `Test case ${n + 1}`;

      const spec = this.normalizeSpec(rec.spec, engine);
      if (!spec) continue;

      tests.push({
        id: `g${++n}`,
        category,
        title,
        description: typeof rec.description === 'string' ? rec.description : title,
        engine,
        spec,
        expected: typeof rec.expected === 'string' ? rec.expected : 'No expectation provided.',
      });
    }
    return tests;
  }

  private normalizeSpec(spec: unknown, engine: TestCase['engine']): TestCase['spec'] | undefined {
    if (!spec || typeof spec !== 'object') return undefined;
    const rec = spec as Record<string, unknown>;
    const appUrl = this.config.appUrl ?? 'http://localhost:3000';

    if (engine === 'http') {
      const method = String(rec.method ?? 'GET').toUpperCase();
      const rawUrl = String(rec.url ?? '/');
      const url = rawUrl.startsWith('http') ? rawUrl : `${appUrl}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
      return {
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(method) ? (method as never) : 'GET',
        url,
        headers: this.stringMap(rec.headers),
        query: this.stringMap(rec.query),
        body: rec.body,
      };
    }

    if (engine === 'browser') {
      const actions = Array.isArray(rec.actions) ? rec.actions : [];
      const rawUrl = String(rec.url ?? '/');
      const url = rawUrl.startsWith('http') ? rawUrl : `${appUrl}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`;
      return {
        url,
        actions: actions
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => ({
            type: String(a.type ?? 'goto') as never,
            selector: typeof a.selector === 'string' ? a.selector : undefined,
            value: typeof a.value === 'string' ? a.value : undefined,
            text: typeof a.text === 'string' ? a.text : undefined,
            url: typeof a.url === 'string' ? a.url : undefined,
            timeoutMs: typeof a.timeoutMs === 'number' ? a.timeoutMs : undefined,
          })),
      };
    }

    if (engine === 'process') {
      return {
        command: String(rec.command ?? ''),
        args: Array.isArray(rec.args) ? rec.args.map(String) : [],
        cwd: typeof rec.cwd === 'string' ? rec.cwd : undefined,
        stdin: typeof rec.stdin === 'string' ? rec.stdin : undefined,
        timeoutMs: typeof rec.timeoutMs === 'number' ? rec.timeoutMs : 15_000,
        expectExitCode: typeof rec.expectExitCode === 'number' ? rec.expectExitCode : undefined,
        expectOutputContains: Array.isArray(rec.expectOutputContains) ? rec.expectOutputContains.map(String) : undefined,
      };
    }

    return undefined;
  }

  private stringMap(value: unknown): Record<string, string> | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = String(v);
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
}
