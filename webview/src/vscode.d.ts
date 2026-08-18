/**
 * Minimal typings for the VS Code webview API surface used by the dashboard.
 * The real object is injected by the extension host via acquireVsCodeApi().
 */
interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;
