import * as vscode from 'vscode';
import { ProjectType } from '../shared/types';

const WEB_FRAMEWORKS = ['react', 'vue', 'angular', 'svelte', 'next', 'nuxt', 'gatsby', 'astro'];
const API_FRAMEWORKS = ['express', 'fastify', 'nestjs', 'koa', 'hapi', 'fastapi', 'flask', 'django', 'spring-boot'];
const ELECTRON = 'electron';

export interface DetectionResult {
  projectType: ProjectType;
  framework?: string;
  reasons: string[];
}

/**
 * Detects the project type of the workspace by inspecting manifest files
 * (package.json, requirements.txt, etc.) and directory layout.
 */
export async function detectProjectType(workspaceRoot: string): Promise<DetectionResult> {
  const reasons: string[] = [];
  let framework: string | undefined;

  const pkg = await tryReadJson(workspaceRoot, 'package.json');

  if (pkg) {
    const allDeps: Record<string, unknown> = {
      ...((pkg.dependencies as Record<string, unknown> | undefined) ?? {}),
      ...((pkg.devDependencies as Record<string, unknown> | undefined) ?? {}),
    };
    const depNames = Object.keys(allDeps).map((d) => d.toLowerCase());

    const webDep = depNames.find((d) => WEB_FRAMEWORKS.some((f) => d === f || d.startsWith(`@${f}`) || d.includes(f)));
    if (webDep) {
      framework = webDep;
      reasons.push(`found web framework dependency "${webDep}"`);
    }

    const apiDep = depNames.find((d) => API_FRAMEWORKS.some((f) => d === f || d.includes(f)));
    if (apiDep) {
      framework = framework ?? apiDep;
      reasons.push(`found backend framework dependency "${apiDep}"`);
    }

    if (allDeps[ELECTRON]) {
      reasons.push('found electron in dependencies');
    }

    if (pkg.bin && typeof pkg.bin === 'object' && Object.keys(pkg.bin).length > 0) {
      reasons.push(`package declares CLI binaries (${Object.keys(pkg.bin).join(', ')})`);
    }

    if (pkg.scripts) {
      const scriptNames = Object.keys(pkg.scripts);
      if (scriptNames.includes('dev') || scriptNames.includes('serve') || scriptNames.includes('start')) {
        reasons.push('package has dev/serve/start scripts');
      }
    }
  } else {
    const pyProject = await exists(workspaceRoot, 'requirements.txt') || await exists(workspaceRoot, 'pyproject.toml');
    if (pyProject) {
      reasons.push('python project manifest found');
      const text = await tryReadText(workspaceRoot, 'requirements.txt');
      if (text && /\b(flask|django|fastapi)\b/i.test(text)) {
        framework = text.match(/\b(flask|django|fastapi)\b/i)?.[0].toLowerCase();
        reasons.push(`python backend framework "${framework}"`);
      }
    }
  }

  const projectType = classify(reasons, framework);
  return { projectType, framework, reasons };
}

function classify(reasons: string[], framework?: string): ProjectType {
  const joined = reasons.join(' ').toLowerCase();
  const fw = framework?.toLowerCase() ?? '';

  if (joined.includes('electron')) return 'electron';
  if (joined.includes('cli') || joined.includes('binary')) return 'cli';
  if (fw === 'express' || fw === 'fastify' || fw === 'nestjs' || fw === 'koa' || fw === 'hapi' || fw === 'flask' || fw === 'django' || fw === 'fastapi') {
    return 'api';
  }
  if (WEB_FRAMEWORKS.some((f) => fw.includes(f))) return 'web';
  // No framework hints: if there is any dev script and dependencies exist, assume node backend/web hybrid.
  if (reasons.length > 0) return 'node-backend';
  return 'unknown';
}

async function tryReadJson(root: string, file: string): Promise<Record<string, unknown> | undefined> {
  const text = await tryReadText(root, file);
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function tryReadText(root: string, file: string): Promise<string | undefined> {
  try {
    const uri = vscode.Uri.joinPath(vscode.Uri.file(root), file);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}

async function exists(root: string, file: string): Promise<boolean> {
  return (await tryReadText(root, file)) !== undefined;
}
