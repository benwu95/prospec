import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { HistoryOriginSchema, type HistoryOrigin, type HistoryPaths } from '../types/history.js';
import { gitRead, gitReadRecords } from './git-read.js';
import { isContainedPath, resolveContainedTarget } from './knowledge-reader.js';

function refuse(reason: string): never {
  throw new PrerequisiteError(`Cannot resolve terminal history: ${reason}`, 'Restore the registered main worktree and corresponding Prospec project before retrying.');
}

function hasGitMarker(root: string): boolean {
  for (let dir = root; ; dir = path.dirname(dir)) {
    const names = fs.readdirSync(dir);
    if (names.includes('.git') || (names.includes('HEAD') && names.includes('objects') && names.includes('refs'))) return true;
    if (path.dirname(dir) === dir) return false;
  }
}

function gitPath(root: string, option: string): string {
  const output = gitRead(root, 'rev-parse', ['--path-format=absolute', option]);
  const value = output.replace(/\r?\n$/, '');
  if (!path.isAbsolute(value)) refuse(`Git returned a non-absolute ${option}`);
  return fs.realpathSync(value);
}

function safeDirectory(dir: string, root: string): void {
  const relative = path.relative(root, dir);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) refuse(`unsafe directory ${dir}`);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || !isContainedPath(current, root)) refuse(`unsafe directory ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const contained = resolveContainedTarget(current, root);
      if (!contained.ok) refuse(`unsafe directory ${current}: ${contained.reason}`);
    }
  }
}

export function resolveHistoryPaths(sourceProjectRoot: string): HistoryPaths {
  const source = fs.realpathSync(sourceProjectRoot);
  let history = source;
  let commonDir: string | null = null;
  let worktree = source;
  let projectPrefix = '';
  if (hasGitMarker(source)) {
    if (gitRead(source, 'rev-parse', ['--is-bare-repository']).trim() !== 'false') refuse('bare repository');
    worktree = gitPath(source, '--show-toplevel');
    commonDir = gitPath(source, '--git-common-dir');
    projectPrefix = path.relative(worktree, source);
    if (!isContainedPath(source, worktree)) refuse('source project escapes its worktree');
    const records = gitReadRecords(source, 'worktree', ['list', '--porcelain', '-z']);
    const groups: string[][] = [];
    let group: string[] = [];
    for (const record of records) {
      if (record === '') { if (group.length) groups.push(group); group = []; }
      else group.push(record);
    }
    if (group.length) groups.push(group);
    const primary = groups[0];
    if (!primary?.[0]?.startsWith('worktree ')) refuse('missing registered main worktree');
    if (primary.includes('bare')) refuse('bare main repository');
    const registered = groups.map((entry) => {
      const record = entry[0];
      if (!record?.startsWith('worktree ')) refuse('malformed worktree registration');
      return record.slice('worktree '.length);
    });
    // Missing sibling registrations do not make an otherwise live source/primary unusable.
    if (!registered.some((dir) => {
      try { return fs.realpathSync(dir) === worktree; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    })) refuse('source is not a registered worktree');
    const main = fs.realpathSync(registered[0]!);
    history = path.join(main, projectPrefix);
    safeDirectory(history, main);
    if (fs.realpathSync(history) !== history || gitPath(history, '--show-toplevel') !== main || gitPath(history, '--git-common-dir') !== commonDir) {
      refuse('main project belongs to a different repository or scope');
    }
    const config = resolveContainedTarget(path.join(history, '.prospec.yaml'), history, { read: true });
    if (!config.ok || !fs.existsSync(config.path)) refuse(`missing or unreadable main project config: ${history}/.prospec.yaml`);
    fs.readFileSync(config.path);
  }
  for (const root of new Set([source, history])) {
    for (const name of ['', 'archive', 'abandoned', 'history-operations']) safeDirectory(path.join(root, '.prospec', name), root);
  }
  return {
    sourceProjectRoot: source, historyProjectRoot: history,
    archiveRoot: path.join(history, '.prospec', 'archive'),
    abandonedRoot: path.join(history, '.prospec', 'abandoned'),
    operationsRoot: path.join(history, '.prospec', 'history-operations'),
    commonDir, worktree, projectPrefix,
  };
}

export function recheckHistoryPaths(paths: HistoryPaths): void {
  const current = resolveHistoryPaths(paths.sourceProjectRoot);
  for (const key of Object.keys(current) as (keyof HistoryPaths)[]) {
    if (current[key] !== paths[key]) refuse(`history topology changed: ${key}`);
  }
}

export function historyOrigin(paths: HistoryPaths, changeName: string): HistoryOrigin {
  return HistoryOriginSchema.parse({ commonDir: paths.commonDir, worktree: paths.worktree, projectPrefix: paths.projectPrefix, changeName });
}
