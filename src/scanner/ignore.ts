/** Globs skipped by every scanner. Keeps dependencies, build output, and the local fixture out of a real project scan. */
export const SCAN_EXCLUDE = '**/{node_modules,dist,out,.git,coverage,test/fixture}/**';

/** True when `index` sits in a // line comment or an unclosed block comment. */
export function isInComment(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  const beforeOnLine = text.slice(lineStart, index);
  if (beforeOnLine.includes('//')) return true;

  const upto = text.slice(0, index);
  const open = upto.lastIndexOf('/*');
  if (open === -1) return false;
  const close = upto.lastIndexOf('*/');
  return close < open;
}
