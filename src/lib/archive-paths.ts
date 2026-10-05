import * as path from 'node:path';

/** UTC date/name convention for successful archives. */
export function archiveDirFor(cwd: string, changeName: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return path.join(cwd, '.prospec', 'archive', `${today}-${changeName}`);
}
