import * as vscode from 'vscode';
import * as path from 'node:path';
import { ProjectStructure } from '../shared/types';
import { detectProjectType, DetectionResult } from './detector';
import { WebScanner } from './webScanner';
import { ApiScanner } from './apiScanner';
import { CliScanner } from './cliScanner';

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

    options.onProgress?.('Scanning project structure...');

    switch (detection.projectType) {
      case 'web':
      case 'electron': {
        const web = new WebScanner(workspaceRoot);
        structure.web = await web.scan(detection.framework);
        break;
      }
      case 'api': {
        const api = new ApiScanner(workspaceRoot);
        structure.api = await api.scan(detection.framework);
        break;
      }
      case 'cli': {
        const cli = new CliScanner(workspaceRoot);
        structure.cli = await cli.scan();
        break;
      }
      case 'node-backend': {
        // Hybrid: scan both API endpoints and web structure when ambiguous.
        const [api, web] = await Promise.all([
          new ApiScanner(workspaceRoot).scan(detection.framework),
          new WebScanner(workspaceRoot).scan(detection.framework),
        ]);
        structure.api = api;
        structure.web = web;
        break;
      }
      default:
        break;
    }

    options.onProgress?.('Scan complete.');
    return structure;
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
