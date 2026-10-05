/**
 * The repository state a delegation receipt compares (REQ-LIB-090): five facets
 * read through git reads only. This module's own git calls go through the
 * `git-read` allowlist; the content facet's base reuses `computeChangeState`
 * unchanged — read-only, run without the repository-selecting environment, and
 * run by every delegation caller with `GIT_OPTIONAL_LOCKS=0`, so no read on this
 * path refreshes the index's stat cache (which no facet includes anyway).
 *
 * `computeChangeState` deliberately leaves the report `prospec check` writes at
 * the project root out of its digest (a check must not invalidate its own
 * baseline). A delegate rewriting it in the main tree is still a mutation of the
 * human's files, so the content facet hashes that file alongside that digest and
 * the checkpoint copies it like any other uncommitted file.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import * as path from 'node:path';
import {
  GIT_OPERATION_MARKERS,
  GIT_STATE_FACETS,
  type GitOperationMarker,
  type GitStateFacet,
  type IndexBlocker,
  type RepoState,
} from '../types/delegation.js';
import { DRIFT_REPORT_FILENAME } from '../types/drift-report.js';
import { computeChangeState, gitProjectPrefix } from './drift-sources.js';
import { gitRead, gitReadOptional, gitReadRecords, withFixedGitEnv } from './git-read.js';

/** The project-root reports `computeChangeState` excludes; the content facet covers them itself. */
export const DELEGATION_REPORT_FILES = [DRIFT_REPORT_FILENAME] as const;

/** The one sha256 helper of the delegation path. */
export function sha256(text: string | Buffer): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * One report file's contribution to the content facet: absent, deleted, a link with
 * its target, or bytes with the executable bit — only that bit, as git checks out
 * only that bit, so a clean tracked report at an unusual mode still reproduces.
 */
function reportToken(cwd: string, name: string): string {
  const listed = gitRead(cwd, 'ls-files', ['-z', '--cached', '--others', '--exclude-standard', '--', name]);
  if (listed === '') return `${name}\0absent`;
  const absolute = path.join(cwd, name);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(absolute);
  } catch {
    return `${name}\0deleted`;
  }
  if (stat.isSymbolicLink()) return `${name}\0link\0${readlinkSync(absolute)}`;
  if (!stat.isFile()) throw new Error(`${name} is neither a regular file nor a symlink`);
  return `${name}\0${(stat.mode & 0o111) !== 0 ? 'executable' : 'plain'}\0${sha256(readFileSync(absolute))}`;
}

/**
 * The content facet: the `computeChangeState` digest of the project's non-ignored
 * files outside `.prospec/`, hashed together with the root report that digest
 * excludes. The snapshot self-check computes the same value at the snapshot's path.
 */
export function contentDigest(cwd: string): RepoState['content'] {
  return withFixedGitEnv(() => {
    const state = computeChangeState(cwd);
    if (state.digest === null) return { unreadable: failureLine(state.reason ?? 'content digest unavailable') };
    const tokens = DELEGATION_REPORT_FILES.map((name) => reportToken(cwd, name));
    return { digest: sha256([state.digest, ...tokens].join('\0')) };
  });
}

/**
 * The report files the checkpoint must copy: those `git status` shows as changed,
 * untracked (non-ignored) or deleted — the same shape `workTreePaths` returns for the
 * rest of the tree, which leaves this file out.
 */
export function reportPaths(cwd: string): { changed: string[]; deleted: Set<string> } {
  return withFixedGitEnv(() => {
    const prefix = gitProjectPrefix(cwd);
    const changed: string[] = [];
    const deleted = new Set<string>();
    for (const name of DELEGATION_REPORT_FILES) {
      const records = gitRead(cwd, 'status', ['--porcelain=v1', '-z', '--untracked-files=all', '--', name])
        .split('\0')
        .filter((record) => record !== '');
      const record = records.find((r) => r.length > 3 && r.slice(3) === `${prefix}${name}`);
      if (record === undefined) continue;
      changed.push(name);
      if (record.slice(0, 2).includes('D')) deleted.add(name);
    }
    return { changed, deleted };
  });
}

/**
 * The one line of a failure worth naming: git's own `fatal:`/`error:` line when the
 * message carries one (a spawned git's message is `Command failed: …` followed by
 * its stderr), else the first line.
 */
export function failureLine(message: string): string {
  const lines = message.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return lines.find((line) => /^(?:fatal|error):/.test(line)) ?? lines[0] ?? 'unreadable';
}

function reason(error: unknown): string {
  return failureLine(error instanceof Error ? error.message : String(error));
}

function readFacet<T>(read: () => T): T | { unreadable: string } {
  try {
    return read();
  } catch (error) {
    return { unreadable: reason(error) };
  }
}

function readContent(cwd: string): RepoState['content'] {
  return readFacet(() => contentDigest(cwd));
}

function readHead(cwd: string): RepoState['head'] {
  return readFacet(() => {
    const ref = gitReadOptional(cwd, 'symbolic-ref', ['-q', 'HEAD']);
    const commit = gitReadOptional(cwd, 'rev-parse', ['-q', '--verify', 'HEAD^{commit}']);
    const probes = gitRead(cwd, 'rev-parse', GIT_OPERATION_MARKERS.flatMap((m) => ['--git-path', m]))
      .split('\n')
      .filter((line) => line !== '');
    if (probes.length !== GIT_OPERATION_MARKERS.length) throw new Error('Incomplete operation marker probe');
    const operations: GitOperationMarker[] = GIT_OPERATION_MARKERS.filter((_, i) => existsSync(path.resolve(cwd, probes[i]!)));
    return { ref: ref === '' ? null : ref, commit: commit === '' ? null : commit, operations };
  });
}

function readIndex(cwd: string): RepoState['index'] {
  return readFacet(() => {
    // Mode, object id, stage, path, the skip-worktree tag and (`-v`, lowercase) the
    // assume-unchanged bit — never stat data, so a `git status` refresh leaves the
    // facet unchanged.
    // The whole index, not the project's subtree: `:/` is the top-level pathspec, so a
    // nested project still sees a staged entry or a flag outside its own directory.
    const records = gitReadRecords(cwd, 'ls-files', ['-z', '-t', '-v', '--stage', '--full-name', '--', ':/']);
    const blockers = new Set<IndexBlocker>();
    for (const record of records) {
      const match = /^([A-Za-z?]) (\d{6}) [0-9a-f]+ (\d)\t/.exec(record);
      if (!match) throw new Error('Unsupported Git index record');
      if (match[3] !== '0') blockers.add('unmerged');
      if (match[1]!.toUpperCase() === 'S') blockers.add('skip-worktree');
      if (match[2] === '160000') blockers.add('gitlink');
    }
    return { digest: sha256(records.join('\0')), blockers: [...blockers].sort() };
  });
}

function readRefs(cwd: string): RepoState['refs'] {
  return readFacet(() => {
    const entries = gitRead(cwd, 'for-each-ref', ['--format=%(refname)%00%(objectname)'])
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => {
        const [name, oid] = line.split('\0');
        if (name === undefined || oid === undefined) throw new Error('Unsupported ref record');
        return { name, oid };
      })
      // Remote-tracking refs and `git maintenance` prefetch mirrors move on a fetch.
      .filter(({ name }) => !name.startsWith('refs/remotes/') && !name.startsWith('refs/prefetch/') && name !== 'refs/stash')
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { entries };
  });
}

function readStash(cwd: string): RepoState['stash'] {
  return readFacet(() => {
    if (gitReadOptional(cwd, 'rev-parse', ['-q', '--verify', 'refs/stash']) === null) return { entries: [] };
    // Every reflog entry, not only the newest: `stash drop stash@{1}` moves no ref.
    const entries = gitRead(cwd, 'reflog', ['show', '--format=%H', 'refs/stash', '--'])
      .split('\n')
      .filter((line) => line !== '');
    return { entries };
  });
}

/** Read all five facets. A facet that cannot be read carries its reason, never a stand-in. */
export function captureRepoState(cwd: string): RepoState {
  return withFixedGitEnv(() => ({
    content: readContent(cwd),
    ...captureGitState(cwd),
  }));
}

/** Git facets for callers with their own content scope, through the same owners. */
export function captureGitState(cwd: string): Omit<RepoState, 'content'> {
  return {
    head: readHead(cwd),
    index: readIndex(cwd),
    refs: readRefs(cwd),
    stash: readStash(cwd),
  };
}

export function isUnreadable(value: RepoState[GitStateFacet]): value is { unreadable: string } {
  return 'unreadable' in value;
}

export interface RepoStateDiff {
  /** Facets readable on both sides whose values differ. */
  changed: GitStateFacet[];
  /** Facets unreadable on either side — never treated as unchanged. */
  unreadable: GitStateFacet[];
}

function canonical(value: RepoState[GitStateFacet]): string {
  if ('operations' in value) return JSON.stringify({ ...value, operations: [...value.operations].sort() });
  return JSON.stringify(value);
}

/** The one facet comparison: issue, receipt, failure and output all use it. */
export function diffRepoState(before: RepoState, after: RepoState): RepoStateDiff {
  const changed: GitStateFacet[] = [];
  const unreadable: GitStateFacet[] = [];
  for (const facet of GIT_STATE_FACETS) {
    if (isUnreadable(before[facet]) || isUnreadable(after[facet])) unreadable.push(facet);
    else if (canonical(before[facet]) !== canonical(after[facet])) changed.push(facet);
  }
  return { changed, unreadable };
}

/** True only when every facet is readable on both sides and equal. */
export function sameRepoState(before: RepoState, after: RepoState): boolean {
  const diff = diffRepoState(before, after);
  return diff.changed.length === 0 && diff.unreadable.length === 0;
}

/** Whether every facet is readable — an issue-time requirement. */
export function isFullyReadable(state: RepoState): boolean {
  return GIT_STATE_FACETS.every((facet) => !isUnreadable(state[facet]));
}

/** A short description of one facet's value, for refusal messages. */
export function describeFacet(state: RepoState, facet: GitStateFacet): string {
  const value = state[facet];
  if (isUnreadable(value)) return `unreadable (${value.unreadable})`;
  switch (facet) {
    case 'content':
      return (value as { digest: string }).digest;
    case 'head': {
      const head = value as { ref: string | null; commit: string | null; operations: string[] };
      const ops = head.operations.length > 0 ? ` [${head.operations.join(', ')}]` : '';
      return `${head.ref ?? 'detached'} @ ${head.commit ?? 'unborn'}${ops}`;
    }
    case 'index': {
      const index = value as { digest: string; blockers: string[] };
      return index.blockers.length > 0 ? `${index.digest} (${index.blockers.join(', ')})` : index.digest;
    }
    case 'refs':
      return `${(value as { entries: unknown[] }).entries.length} ref(s)`;
    case 'stash': {
      const count = (value as { entries: unknown[] }).entries.length;
      return `${count} entr${count === 1 ? 'y' : 'ies'}`;
    }
  }
}

export interface FacetChange {
  facet: GitStateFacet;
  before: string;
  after: string;
}

/** Each facet that changed or cannot be read, with both values described — the refusal's evidence. */
export function describeStateChanges(before: RepoState, after: RepoState): FacetChange[] {
  const diff = diffRepoState(before, after);
  return GIT_STATE_FACETS.filter((facet) => diff.changed.includes(facet) || diff.unreadable.includes(facet)).map((facet) => {
    const refs = facet === 'refs' ? describeRefChanges(before, after) : [];
    const suffix = refs.length > 0 ? ` (${refs.join(', ')})` : '';
    return { facet, before: describeFacet(before, facet), after: `${describeFacet(after, facet)}${suffix}` };
  });
}

/** The local refs added, removed or moved between two states, by name; empty when either side is unreadable. */
export function describeRefChanges(before: RepoState, after: RepoState): string[] {
  if (isUnreadable(before.refs) || isUnreadable(after.refs)) return [];
  const was = new Map(before.refs.entries.map((e) => [e.name, e.oid]));
  const now = new Map(after.refs.entries.map((e) => [e.name, e.oid]));
  const names = [...new Set([...was.keys(), ...now.keys()])].sort();
  return names.flatMap((name) => {
    if (!was.has(name)) return [`${name} added`];
    if (!now.has(name)) return [`${name} removed`];
    return was.get(name) === now.get(name) ? [] : [`${name} moved`];
  });
}
