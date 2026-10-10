import * as path from 'node:path';
import { resolveHistoryPaths } from './history-paths.js';
import { isSafeResourceName } from './knowledge-reader.js';
import { PrerequisiteError } from '../types/errors.js';

/** UTC date/name convention for successful archives. */
export function archiveDirFor(cwd: string, changeName: string): string {
  if (!isSafeResourceName(changeName)) throw new PrerequisiteError('Unsafe change name', changeName);
  const today = new Date().toISOString().slice(0, 10);
  return path.join(resolveHistoryPaths(cwd).archiveRoot, `${today}-${changeName}`);
}
