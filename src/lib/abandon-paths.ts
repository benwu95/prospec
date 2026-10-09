import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { isContainedPath, isSafeResourceName, resolveContainedTarget } from './knowledge-reader.js';

/** Missing directories are allowed; links and non-directory history roots are not. */
function containedDirectory(dir: string, root: string): string {
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || !isContainedPath(dir, root)) {
      throw new PrerequisiteError('Unsafe abandoned directory', `Expected a regular directory: ${dir}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const target = resolveContainedTarget(dir, root);
    if (!target.ok) throw new PrerequisiteError('Unsafe abandoned directory', target.reason);
  }
  return dir;
}

/** Always relative to the Prospec project, independent of trust-zone base_dir. */
export function abandonedRootFor(root: string): string {
  return containedDirectory(path.join(root, '.prospec', 'abandoned'), root);
}

/** The legacy retry link key `archive` identifies an entry in this root only. */
export function abandonedEntryFor(root: string, identity: string): string {
  if (!isSafeResourceName(identity)) throw new PrerequisiteError('Unsafe abandoned identity', identity);
  return containedDirectory(path.join(abandonedRootFor(root), identity), root);
}

export function abandonDirFor(root: string, changeName: string): string {
  if (!isSafeResourceName(changeName)) throw new PrerequisiteError('Unsafe change name', changeName);
  const base = `${new Date().toISOString().slice(0, 10)}-${changeName}`;
  for (let ordinal = 1; ; ordinal++) {
    const candidate = abandonedEntryFor(root, ordinal === 1 ? base : `${base}-${ordinal}`);
    try {
      fs.lstatSync(candidate);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return candidate;
    }
  }
}
