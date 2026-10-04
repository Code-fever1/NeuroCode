import { BrowserSpec, HttpSpec, PlanStep, ProcessSpec, TestCase, TestCategory, TestPriority } from '../shared/types';

export function priorityFor(category: TestCategory): TestPriority {
  if (category === 'boundary') return 'medium';
  return 'high';
}

export function httpSteps(spec: HttpSpec, expected: string): PlanStep[] {
  const query = spec.query ? `?${new URLSearchParams(spec.query).toString()}` : '';
  const target = `${spec.url}${query}`;
  const send =
    spec.body !== undefined
      ? `Send ${spec.method} ${target} with body ${JSON.stringify(spec.body)}`
      : `Send ${spec.method} ${target}`;
  return [
    { type: 'action', description: send },
    { type: 'assertion', description: expected },
  ];
}

export function browserSteps(spec: BrowserSpec, expected: string): PlanStep[] {
  const steps: PlanStep[] = spec.actions.map((action) => ({
    type: 'action' as const,
    description: describeBrowserAction(action.type, action.selector, action.value, action.text, action.url),
  }));
  steps.push({ type: 'assertion', description: expected });
  return steps;
}

export function processSteps(spec: ProcessSpec, expected: string): PlanStep[] {
  const args = (spec.args ?? []).join(' ');
  return [
    { type: 'action', description: `Run \`${spec.command}${args ? ` ${args}` : ''}\`` },
    { type: 'assertion', description: expected },
  ];
}

export function stepsForTest(test: Pick<TestCase, 'engine' | 'spec' | 'expected'>): PlanStep[] {
  if (test.engine === 'http') {
    const spec = test.spec as HttpSpec;
    return httpSteps(spec, test.expected);
  }
  if (test.engine === 'browser') {
    return browserSteps(test.spec as BrowserSpec, test.expected);
  }
  return processSteps(test.spec as ProcessSpec, test.expected);
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const root = base.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${root}${suffix}`;
}

function describeBrowserAction(
  type: string,
  selector?: string,
  value?: string,
  text?: string,
  url?: string,
): string {
  switch (type) {
    case 'goto':
      return `Open ${url ?? 'the page'}`;
    case 'click':
      return `Click ${selector ?? 'the control'}`;
    case 'fill':
      return `Type "${value ?? ''}" into ${selector ?? 'the field'}`;
    case 'press':
      return `Press ${value ?? 'Enter'} on ${selector ?? 'the focused element'}`;
    case 'waitFor':
      return `Wait until ${selector ?? 'the page'} is visible`;
    case 'expectText':
      return `Check the page contains "${text ?? ''}"`;
    case 'expectUrl':
      return `Check the URL contains ${url ?? ''}`;
    case 'screenshot':
      return 'Capture a screenshot';
    default:
      return type;
  }
}
