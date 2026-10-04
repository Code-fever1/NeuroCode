import * as vscode from 'vscode';
import * as path from 'node:path';
import { FormFieldInfo, RouteInfo, UiComponentInfo } from '../shared/types';
import { isInComment, SCAN_EXCLUDE } from './ignore';

/**
 * Lightweight structural scanner for web frontends.
 * Uses targeted regex parsing of source files to extract routes, forms,
 * and interactive UI components without requiring a full AST build.
 */
export class WebScanner {
  constructor(private readonly workspaceRoot: string) {}

  async scan(framework?: string): Promise<{
    routes: RouteInfo[];
    forms: FormFieldInfo[];
    components: UiComponentInfo[];
    framework?: string;
  }> {
    const [routes, pageRoutes, forms, components] = await Promise.all([
      this.findRoutes(framework),
      this.findPageFiles(),
      this.findForms(),
      this.findComponents(framework),
    ]);
    return { routes: dedupeRoutes([...routes, ...pageRoutes]), forms, components, framework };
  }

  private async findRoutes(_framework?: string): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];
    const files = await this.sourceFiles();

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;

      const isTsx = /\.(tsx|jsx)$/.test(file);
      if (isTsx) {
        // React Router <Route path="..."> and object-style { path: '...' } routes
        const routeRe = /<Route[^>]*\bpath=["']([^"']+)["'][^>]*>/g;
        let m: RegExpExecArray | null;
        while ((m = routeRe.exec(text))) {
          if (isInComment(text, m.index)) continue;
          routes.push({ method: 'PAGE', path: m[1], file, line: this.lineAt(text, m.index) });
        }
        const objRe = /\bpath\s*:\s*["']([^"']+)["']\s*,?[^}]*\belement\s*:/g;
        while ((m = objRe.exec(text))) {
          if (isInComment(text, m.index)) continue;
          routes.push({ method: 'PAGE', path: m[1], file, line: this.lineAt(text, m.index) });
        }
      }
    }

    return routes;
  }

  private async findForms(): Promise<FormFieldInfo[]> {
    const forms: FormFieldInfo[] = [];
    const files = await this.sourceFiles();

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;

      const inputRe = /<(input|select|textarea)([^>]*)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = inputRe.exec(text))) {
        const attrs = m[2];
        const name = /name=["']([^"']+)["']/.exec(attrs)?.[1];
        const type = /type=["']([^"']+)["']/.exec(attrs)?.[1] ?? m[1];
        const required = /\brequired\b/.test(attrs);
        if (name && !isInComment(text, m.index)) {
          forms.push({ name, type, required, file, line: this.lineAt(text, m.index) });
        }
      }
    }

    return forms;
  }

  private async findComponents(framework?: string): Promise<UiComponentInfo[]> {
    const components: UiComponentInfo[] = [];
    const files = await this.sourceFiles();

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;
      const isTsx = /\.(tsx|jsx)$/.test(file);
      if (!isTsx) continue;

      const name = path.basename(file).replace(/\.(tsx|jsx)$/, '');
      const interactiveElements = (text.match(/<button|onClick|onSubmit|onChange|href=/g) ?? []).length;
      if (interactiveElements > 0) {
        components.push({ name, path: file, interactiveElements });
      }
    }

    // React components are defined as functions/components; also scan for
    // framework-specific entry configs (e.g. Astro pages).
    if (framework === 'astro') {
      const pages = await this.files('src/pages/**/*.astro');
      for (const p of pages) {
        components.push({ name: p, path: p, interactiveElements: 1 });
      }
    }

    return components;
  }

  private async sourceFiles(): Promise<string[]> {
    return this.files('**/*.{ts,tsx,js,jsx,vue,svelte,astro,html}');
  }

  private async findPageFiles(): Promise<RouteInfo[]> {
    const routes: RouteInfo[] = [];
    const files = await this.files('**/{app,pages,src/app,src/pages}/**/*.{tsx,jsx,vue,html}');
    for (const file of files) {
      const rel = path.relative(this.workspaceRoot, file).replace(/\\/g, '/');
      const routePath = routeFromPageFile(rel);
      if (!routePath) continue;
      routes.push({ method: 'PAGE', path: routePath, file, line: 1 });
    }
    return routes;
  }

  private async files(glob: string): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(glob, SCAN_EXCLUDE, 2000);
    return uris.map((u) => u.fsPath).filter((p) => !p.includes('/node_modules/') && !p.includes('/dist/'));
  }

  private async read(file: string): Promise<string | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(file));
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return undefined;
    }
  }

  private lineAt(text: string, index: number): number {
    return text.slice(0, index).split('\n').length;
  }
}

function dedupeRoutes(routes: RouteInfo[]): RouteInfo[] {
  const seen = new Set<string>();
  const out: RouteInfo[] = [];
  for (const route of routes) {
    const key = `${route.path} ${route.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }
  return out;
}

/** Maps a Next.js app-router or pages-router file to a URL path. */
function routeFromPageFile(rel: string): string | undefined {
  const app = rel.match(/(?:^|\/)app\/(.*)$/);
  if (app) {
    const rest = app[1];
    if (!/(^|\/)page\.(tsx|jsx|vue)$/.test(rest)) return undefined;
    let route = rest.replace(/(^|\/)page\.(tsx|jsx|vue)$/, '');
    route = route.replace(/\/\([^/]+\)/g, '').replace(/\/$/, '');
    return route === '' ? '/' : `/${route}`;
  }

  const pages = rel.match(/(?:^|\/)pages\/(.*)$/);
  if (!pages) return undefined;
  let rest = pages[1];
  if (rest.startsWith('api/') || rest.startsWith('_app.') || rest.startsWith('_document.')) return undefined;
  rest = rest.replace(/\.(tsx|jsx|vue|html)$/, '');
  if (rest === 'index') return '/';
  rest = rest.replace(/\/index$/, '');
  rest = rest.replace(/\[\.\.\.([^\]]+)\]/g, ':$1').replace(/\[([^\]]+)\]/g, ':$1');
  return `/${rest}`;
}
