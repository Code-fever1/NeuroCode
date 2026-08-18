# NeuroCode — Software Quality Analyzer

AI-assisted QA copilot for VS Code. Detects project type, generates positive/negative/boundary/regression
test cases with AI, executes them via the right engine (Playwright / HTTP runner / process runner), and
reports pass/fail results with evidence in the IDE.

## Project layout

- `src/extension/` — VS Code extension entry point + pipeline controller (scan -> generate -> run -> report)
- `src/scanner/` — project type detection and structural extraction (web routes/forms, API endpoints/schemas, CLI commands)
- `src/generator/` — AI test generation (OpenAI-compatible LLM + offline rule-based mock fallback)
- `src/executor/` — execution engines: `httpRunner`, `playwrightRunner`, `processRunner`, dispatcher `executor`
- `src/reporter/` — report aggregation, markdown/JSON export, local run history
- `src/panel/` — sidebar webview provider (bridge between extension host and React UI)
- `src/shared/types.ts` — data model shared by host, engines, and webview
- `webview/` — React dashboard bundled with esbuild into `dist/webview/`

## Commands

- `npm run dev` — build webview bundle + compile extension TS (run before F5 / extension host launch)
- `npm run compile` — typecheck + compile extension host only (`tsc -p ./`)
- `npm run build:webview` — bundle React dashboard (`node esbuild.mjs`)
- `npm run watch` — tsc watch; `npm run watch:webview` — esbuild watch
- `npm run package` — build + create `.vsix` via `@vscode/vsce`

## Running the extension

1. `npm install` (playwright-core is a dependency; browsers must be installed separately via
   `npx playwright install chromium` for browser tests)
2. `npm run dev`
3. In VS Code: Run and Debug -> "Run NeuroCode Extension" (or F5)
4. Command palette: "NeuroCode: Scan Project" -> "NeuroCode: Generate Test Cases" -> "NeuroCode: Run Tests"

## Configuration (VS Code settings)

- `neurocode.apiKey` — LLM key (or `NEUROCODE_API_KEY` env var). Empty -> offline mock generator.
- `neurocode.apiBaseUrl` — OpenAI-compatible endpoint, default `https://api.openai.com/v1`
- `neurocode.model`, `neurocode.maxTestCases`, `neurocode.appUrl`, `neurocode.playwrightHeadless`

## Notes / decisions

- The offline `MockGenerator` produces schema-aware payloads and keeps the pipeline fully testable without an LLM key.
- `ExecutionContext.onProgress` callback signature: `(result: TestResult, index: number, total: number)`.
- Test specs are versioned JSON (HttpSpec/BrowserSpec/ProcessSpec in `src/shared/types.ts`) so generated tests are portable and reviewable before execution.
- Webview loads `dist/webview/index.html` + `bundle.js` + `styles.css`; CSP allows only the extension's own resources plus inline styles.
- Keep the `noUnusedLocals`/`noUnusedParameters` TS options — unused params should be prefixed with `_`.
