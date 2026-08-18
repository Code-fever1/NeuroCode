import * as vscode from 'vscode';
import * as path from 'node:path';
import { CliStructure } from '../shared/types';

/**
 * Structural scanner for CLI tools and command-based projects.
 * Extracts command definitions from commander/yargs style registrations
 * and package.json bin entries.
 */
export class CliScanner {
  constructor(private readonly workspaceRoot: string) {}

  async scan(): Promise<CliStructure> {
    const commands = await this.findCommands();
    return { commands };
  }

  private async findCommands(): Promise<CliStructure['commands']> {
    const commands: CliStructure['commands'] = [];
    const files = await this.files('**/*.{ts,js,mjs,cjs}');

    for (const file of files) {
      const text = await this.read(file);
      if (!text) continue;

      // commander: .command('name [args...]')
      const commanderRe = /\.command\(\s*["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = commanderRe.exec(text))) {
        const [name, ...args] = m[1].split(/\s+/);
        commands.push({ name, args, file });
      }

      // yargs: .command(['name', 'alias'], ...)
      const yargsRe = /\.command\(\s*\[?\s*["']([^"']+)["']/g;
      let y: RegExpExecArray | null;
      while ((y = yargsRe.exec(text))) {
        const [name, ...args] = y[1].split(/\s+/);
        commands.push({ name, args, file });
      }
    }

    // bin entries from package.json
    const pkg = await this.read(path.join(this.workspaceRoot, 'package.json'));
    if (pkg) {
      try {
        const parsed = JSON.parse(pkg);
        if (parsed.bin && typeof parsed.bin === 'object') {
          for (const name of Object.keys(parsed.bin)) {
            commands.push({ name, args: [], file: parsed.bin[name] });
          }
        }
      } catch {
        // ignore malformed package.json
      }
    }

    return commands;
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
}
