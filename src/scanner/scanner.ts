import * as vscode from 'vscode';
import * as path from 'node:path';
import { ProjectStructure } from '../shared/types';
import { detectProjectType, DetectionResult } from './detector';
import { WebScanner } from './webScanner';
import { ApiScanner } from './apiScanner';
import { CliScanner } from './cliScanner';
import { SCAN_EXCLUDE } from './ignore';

export interface ScanOptions {
  onProgress?: (message: string) => void;
}

/**
 * Orchestrates the project scan pipeline: detect project type, then run the
 * scanner appropriate for that type and assemble a ProjectStructure.
 */
export class ProjectScanner {
  async scan(workspaceRoot: string, options: ScanOptions = {}): Promise<ProjectStructure> {
    options.onProgress?.('Detecting project type...');
    const detection: DetectionResult = await detectProjectType(workspaceRoot);
    options.onProgress?.(`Detected: ${detection.projectType}${detection.framework ? ` (${detection.framework})` : ''}`);

    const name = path.basename(workspaceRoot);
    const structure: ProjectStructure = {
      projectType: detection.projectType,
      name,
      rootPath: workspaceRoot,
      dependencies: [],
      devDependencies: [],
    };

    const pkg = await this.readJson(workspaceRoot, 'package.json');
    if (pkg) {
      structure.packageManager = 'npm';
      structure.scripts = (pkg.scripts as Record<string, string>) ?? undefined;
      structure.dependencies = Object.keys((pkg.dependencies as Record<string, string>) ?? {});
      structure.devDependencies = Object.keys((pkg.devDependencies as Record<string, string>) ?? {});
    }

    options.onProgress?.('Scanning pages, endpoints, and commands...');

    // Always scan every surface. The detected type picks the primary engine,
    // but the inventory and the test plan include whatever is actually in the tree.
    const [web, api, cli, files] = await Promise.all([
      new WebScanner(workspaceRoot).scan(detection.framework),
      new ApiScanner(workspaceRoot).scan(detection.framework),
      new CliScanner(workspaceRoot).scan(),
      this.listSourceFiles(),
    ]);
    structure.web = web;
    structure.api = api;
    structure.cli = cli;
    structure.sourceFileCount = files.length;
    structure.sourceFiles = files.slice(0, 40);

    options.onProgress?.('Scan complete.');
    return structure;
  }

  private async listSourceFiles(): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(
      '**/*.{ts,tsx,js,jsx,mjs,cjs,vue,svelte,html,py}',
      SCAN_EXCLUDE,
      400,
    );
    return uris
      .map((uri) => vscode.workspace.asRelativePath(uri, false))
      .filter((file) => !file.startsWith('dist/') && !file.includes('node_modules'))
      .sort();
  }

  private async readJson(root: string, file: string): Promise<Record<string, unknown> | undefined> {
    try {
      const uri = vscode.Uri.joinPath(vscode.Uri.file(root), file);
      const bytes = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(bytes).toString('utf8'));
    } catch {
      return undefined;
    }
  }
}
