/**
 * Shared data model for the NeuroCode QA pipeline.
 * These types are used by the extension host, the execution engines,
 * and (via serialized messages) the React webview dashboard.
 */

export type ProjectType = 'web' | 'api' | 'electron' | 'cli' | 'node-backend' | 'unknown';

export type TestCategory = 'positive' | 'negative' | 'boundary' | 'regression';

export type EngineKind = 'http' | 'browser' | 'process';

/** ---- Project scan results ------------------------------------------- */

export interface RouteInfo {
  method: string;
  path: string;
  file: string;
  line: number;
  handlerName?: string;
}

export interface FormFieldInfo {
  name: string;
  type: string;
  required: boolean;
  file: string;
  line: number;
}

export interface UiComponentInfo {
  name: string;
  path: string;
  interactiveElements: number;
}

export interface WebStructure {
  framework?: string;
  entryUrl?: string;
  routes: RouteInfo[];
  forms: FormFieldInfo[];
  components: UiComponentInfo[];
}

export interface ApiStructure {
  framework?: string;
  baseUrl?: string;
  endpoints: RouteInfo[];
  schemas: Array<{ name: string; file: string; fields: Array<{ name: string; type: string }> }>;
}

export interface CliStructure {
  commands: Array<{ name: string; args: string[]; file: string }>;
}

export interface ProjectStructure {
  projectType: ProjectType;
  name: string;
  rootPath: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
  web?: WebStructure;
  api?: ApiStructure;
  cli?: CliStructure;
}

/** ---- Test case model ------------------------------------------------ */

export interface TestCase {
  id: string;
  category: TestCategory;
  title: string;
  description: string;
  engine: EngineKind;
  spec: HttpSpec | BrowserSpec | ProcessSpec;
  expected: string;
}

export interface HttpSpec {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export type BrowserActionType =
  | 'goto'
  | 'click'
  | 'fill'
  | 'press'
  | 'waitFor'
  | 'expectText'
  | 'expectUrl'
  | 'screenshot';

export interface BrowserAction {
  type: BrowserActionType;
  selector?: string;
  value?: string;
  text?: string;
  url?: string;
  timeoutMs?: number;
}

export interface BrowserSpec {
  url: string;
  actions: BrowserAction[];
}

export interface ProcessSpec {
  command: string;
  args?: string[];
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  expectExitCode?: number;
  expectOutputContains?: string[];
}

/** ---- Results & reporting --------------------------------------------- */

export type TestStatus = 'pending' | 'passed' | 'failed' | 'error' | 'skipped';

export interface FailureEvidence {
  screenshots?: string[]; // data URIs for browser tests
  responseDiff?: string; // expected vs actual for API tests
  outputLog?: string; // captured stdout/stderr for process/API tests
  error?: string;
}

export interface TestResult {
  testId: string;
  status: TestStatus;
  durationMs: number;
  message?: string;
  evidence?: FailureEvidence;
}

export interface TestReport {
  projectName: string;
  projectType: ProjectType;
  generatedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  errored: number;
  skipped: number;
  results: TestResult[];
}

/** ---- Webview message protocol ---------------------------------------- */

export type WebviewRequest =
  | { type: 'scanProject' }
  | { type: 'generateTests' }
  | { type: 'runTests'; testIds?: string[] }
  | { type: 'rerunFailed' }
  | { type: 'exportReport' }
  | { type: 'getState' }
  | { type: 'updateTest'; test: TestCase }
  | { type: 'deleteTest'; testId: string };

export interface PipelineState {
  projectName?: string;
  projectType?: ProjectType;
  scannedAt?: string;
  structureSummary?: string;
  tests: TestCase[];
  report?: TestReport;
  generating: boolean;
  scanning: boolean;
  running: boolean;
  lastError?: string;
}

export type WebviewResponse =
  | { type: 'state'; state: PipelineState }
  | { type: 'scanDone'; state: PipelineState }
  | { type: 'testsGenerated'; state: PipelineState }
  | { type: 'runStarted'; state: PipelineState }
  | { type: 'runProgress'; state: PipelineState }
  | { type: 'runDone'; state: PipelineState }
  | { type: 'error'; message: string };
