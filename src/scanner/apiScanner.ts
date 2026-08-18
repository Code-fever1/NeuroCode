import * as vscode from 'vscode';
import * as path from 'node:path';
import { ApiStructure, RouteInfo } from '../shared/types';

/**
 * Structural scanner for backend/API projects.
 * Extracts HTTP endpoints (Express-style route registration and decorator
 * based frameworks) and simple schema definitions (TypeScript interfaces,
 * zod schemas, Joi, etc.).
 */
export class ApiScanner {
  constructor(_workspaceRoot: string) {}

  async scan(framework?: string): Promise<ApiStructure> {
    const endpoints = await this.findEndpoints(framework);
    const schemas = await this.findSchemas();
    return {
      framework,
      endpoints,
      schemas,
    };
  }

  private async findEndpoints(_framework?: string): Promise<RouteInfo[]> {
    const endpoints: RouteInfo[] = [];
    const files = await this.files('**/*.{ts,js,mjs,cjs}');
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'];

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;

      // Express-style: app.get('/path', handler) / router.get(...) / .route('/path')
      for (const method of httpMethods) {
        const re = new RegExp(`\\.${method}\\s*\\(\\s*["'\`]([^"'\`]+)["'\`]`, 'g');
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          endpoints.push({ method: method.toUpperCase(), path: m[1], file, line: this.lineAt(text, m.index) });
        }
      }

      // Decorator style: @Get('/path'), @Post('/path'), etc.
      const decoratorRe = /@(Get|Post|Put|Patch|Delete|Head|Options)\(\s*["']([^"']+)["']\s*\)/g;
      let d: RegExpExecArray | null;
      while ((d = decoratorRe.exec(text))) {
        endpoints.push({ method: d[1].toUpperCase(), path: d[2], file, line: this.lineAt(text, d.index) });
      }

      // Express Router .route('/path').get(...)
      const routeRe = /\.route\(\s*["']([^"']+)["']\s*\)/g;
      let r: RegExpExecArray | null;
      while ((r = routeRe.exec(text))) {
        endpoints.push({ method: 'ANY', path: r[1], file, line: this.lineAt(text, r.index) });
      }
    }

    return endpoints;
  }

  private async findSchemas(): Promise<ApiStructure['schemas']> {
    const schemas: ApiStructure['schemas'] = [];
    const files = await this.files('**/*.{ts,js}');

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;

      // TypeScript interfaces
      const ifaceRe = /interface\s+(\w+)\s*\{([^}]*)\}/g;
      let m: RegExpExecArray | null;
      while ((m = ifaceRe.exec(text))) {
        const fields = m[2]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('/') && !l.startsWith('*') && !l.startsWith('}'))
          .map((l) => {
            const parts = l.replace(/[;,]?$/, '').split(':');
            return { name: parts[0]?.trim().replace(/^["']|["']$/g, '') ?? '', type: parts[1]?.trim() ?? '' };
          })
          .filter((f) => f.name);
        if (fields.length > 0) {
          schemas.push({ name: m[1], file, fields });
        }
      }

      // zod schemas: const x = z.object({ ... }) or z.object({...})
      const zodRe = /z\.object\(\{([^}]*)\}\)/g;
      let z: RegExpExecArray | null;
      while ((z = zodRe.exec(text))) {
        const fields = z[1]
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('/'))
          .map((l) => {
            const parts = l.replace(/[;,]?$/, '').split(':');
            return { name: parts[0]?.trim().replace(/^["']|["']$/g, '') ?? '', type: parts[1]?.trim() ?? '' };
          })
          .filter((f) => f.name);
        if (fields.length > 0) {
          schemas.push({ name: `zod-${path.basename(file)}`, file, fields });
        }
      }
    }

    return schemas;
  }

  private async files(glob: string): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**', 5000);
    return uris.map((u) => u.fsPath).filter((p) => !p.includes('/node_modules/'));
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
