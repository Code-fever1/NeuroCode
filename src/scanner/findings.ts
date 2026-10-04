import { ProjectStructure, ScanFinding } from '../shared/types';

/**
 * Turns a project scan into the list the sidebar shows.
 * Every row comes from something the scanners actually found.
 */
export function buildFindings(structure: ProjectStructure): ScanFinding[] {
  const items: ScanFinding[] = [];
  const rel = (file: string) => relativeTo(structure.rootPath, file);

  for (const ep of structure.api?.endpoints ?? []) {
    items.push({
      group: 'API endpoints',
      label: `${ep.method} ${ep.path}`,
      detail: `${rel(ep.file)}:${ep.line}`,
    });
  }

  for (const route of structure.web?.routes ?? []) {
    items.push({
      group: 'Pages',
      label: route.path,
      detail: `${rel(route.file)}:${route.line}`,
    });
  }

  for (const form of structure.web?.forms ?? []) {
    const required = form.required ? 'required' : 'optional';
    items.push({
      group: 'Form fields',
      label: form.name,
      detail: `${form.type}, ${required} · ${rel(form.file)}:${form.line}`,
    });
  }

  for (const component of structure.web?.components ?? []) {
    items.push({
      group: 'UI components',
      label: component.name,
      detail: `${component.interactiveElements} interactive · ${rel(component.path)}`,
    });
  }

  for (const command of structure.cli?.commands ?? []) {
    const args = command.args.length > 0 ? ` ${command.args.join(' ')}` : '';
    items.push({
      group: 'Commands',
      label: `${command.name}${args}`,
      detail: rel(command.file),
    });
  }

  const scripts = structure.scripts ?? {};
  for (const name of Object.keys(scripts)) {
    items.push({
      group: 'Scripts',
      label: name,
      detail: scripts[name],
    });
  }

  for (const file of (structure.sourceFiles ?? []).slice(0, 20)) {
    items.push({
      group: 'Project files',
      label: file,
      detail: 'source file',
    });
  }

  return items;
}

function relativeTo(root: string, file: string): string {
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');
  const target = file.replace(/\\/g, '/');
  if (target.startsWith(`${base}/`)) return target.slice(base.length + 1);
  return target;
}
