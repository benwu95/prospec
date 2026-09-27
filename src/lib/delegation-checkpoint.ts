/**
 * Isolation and preservation for delegated judgment (REQ-LIB-091), host-neutral and
 * without writing the main repository's `.git`:
 *
 * - the snapshot is a separate shared clone under the real temporary directory,
 *   overlaid with the uncommitted files, where a delegate runs its tests and repros;
 * - the checkpoint keeps byte copies of the uncommitted files and the raw index
 *   bytes under the change's `.delegated/` directory, for the human to recover from.
 *
 * The checkpoint only preserves: nothing here writes the human's tree, the index,
 * HEAD or refs, and no function takes a path inside the main tree as a target.
 * Nothing here creates a symlink under `.prospec/` either: a link that dangles there
 * would break every recheck that walks the change directories.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CHECKPOINT_SUFFIX,
  DELEGATION_DIR,
  isNormalizedRelativePath,
  type Checkpoint,
  type CheckpointEntry,
} from '../types/delegation.js';
import { DelegationRefusedError } from '../types/errors.js';
import { gitProjectPrefix, workTreePaths } from './drift-sources.js';
import { atomicWrite } from './fs-utils.js';
import { SNAPSHOT_PREFIX, gitRead, gitReadRecords, gitSnapshot, snapshotRoot, withFixedGitEnv } from './git-read.js';
import { isContainedPath } from './knowledge-reader.js';
import { contentDigest, failureLine, isUnreadable, reportPaths, sha256 } from './repo-state.js';

export { SNAPSHOT_PREFIX, snapshotRoot };

const SNAPSHOT_MARKER = 'prospec-snapshot.json';
/** A push URL no git transport resolves, so a delegate cannot push from its snapshot. */
const DISABLED_PUSH_URL = 'prospec-snapshot-push-disabled';
const DEGRADE = "Take the station's Harness Degradation path (in-session) and disclose the round as not covered";

function refuseIssue(message: string, suggestion: string): DelegationRefusedError {
  return new DelegationRefusedError({ operation: 'issue', message, suggestion });
}

export function delegationDirOf(changeDir: string): string {
  return path.join(changeDir, DELEGATION_DIR);
}

export function checkpointDirOf(changeDir: string, stem: string): string {
  return path.join(delegationDirOf(changeDir), `${stem}${CHECKPOINT_SUFFIX}`);
}

/**
 * Create the change's `.delegated/` directory with a `.gitignore` of `*`, so copies
 * of uncommitted bytes are never committed where a project tracks `.prospec/changes/`.
 */
export async function ensureDelegationDir(changeDir: string): Promise<string> {
  const dir = delegationDirOf(changeDir);
  const ignore = path.join(dir, '.gitignore');
  if (!fs.existsSync(ignore)) await atomicWrite(ignore, '*\n');
  return dir;
}

function gitPathOf(cwd: string, name: string): string {
  return path.resolve(cwd, gitRead(cwd, 'rev-parse', ['--git-path', name]).trim());
}

// --- Checkpoint -------------------------------------------------------------

/**
 * Claim a stem by creating its checkpoint directory exclusively: a concurrent issue
 * of the same attempt stops here, before it touches the winner's copies.
 */
export function claimCheckpointDir(changeDir: string, stem: string): string {
  const dir = checkpointDirOf(changeDir, stem);
  fs.mkdirSync(delegationDirOf(changeDir), { recursive: true });
  try {
    fs.mkdirSync(dir);
  } catch (error) {
    const exists = (error as NodeJS.ErrnoException).code === 'EEXIST';
    throw new DelegationRefusedError({
      operation: 'issue',
      message: exists ? `Ticket ${stem} is being issued concurrently, or its checkpoint outlived it` : `Ticket ${stem} could not be issued: ${String(error)}`,
      suggestion: 'Issue the ticket again',
      ticket: stem,
    });
  }
  return dir;
}

/**
 * Copy every uncommitted file in the digest's scope (dirty, staged-added, untracked
 * non-ignored), record deleted paths and the raw index bytes, into the claimed
 * checkpoint directory. Returns the checkpoint recorded in the ticket.
 */
export async function writeCheckpoint(cwd: string, changeDir: string, stem: string): Promise<Checkpoint> {
  const dir = checkpointDirOf(changeDir, stem);
  const tree = withFixedGitEnv(() => workTreePaths(cwd));
  const reports = reportPaths(cwd);
  const changed = [...tree.changed, ...reports.changed];
  const deleted = new Set([...tree.deleted, ...reports.deleted]);
  const entries: CheckpointEntry[] = [];
  for (const file of changed) {
    if (!isNormalizedRelativePath(file)) throw refuseIssue(`Cannot checkpoint the path ${JSON.stringify(file)}`, 'Rename the file to a plain relative path, then issue again');
    const absolute = path.join(cwd, file);
    if (deleted.has(file) && !fs.existsSync(absolute)) {
      entries.push({ path: file, kind: 'deleted' });
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(absolute);
      entries.push({ path: file, kind: 'symlink', sha256: sha256(target), target });
    } else if (stat.isFile()) {
      const bytes = fs.readFileSync(absolute);
      const digest = sha256(bytes);
      await atomicWrite(path.join(dir, 'blobs', digest), bytes);
      entries.push({ path: file, kind: 'regular', mode: stat.mode & 0o777, sha256: digest });
    } else {
      throw refuseIssue(`Cannot checkpoint ${file}: not a regular file or symlink`, 'Remove or commit it, then issue again');
    }
  }
  const indexPath = gitPathOf(cwd, 'index');
  if (!fs.existsSync(indexPath)) {
    throw refuseIssue('The repository has no index yet (nothing was ever added or committed), so there is nothing to checkpoint or snapshot', 'Add or commit the project first, then issue again');
  }
  const indexBytes = fs.readFileSync(indexPath);
  await atomicWrite(path.join(dir, 'index'), indexBytes);
  return { entries, index_sha256: sha256(indexBytes) };
}

export function checkpointBlobPath(changeDir: string, stem: string, digest: string): string {
  return path.join(checkpointDirOf(changeDir, stem), 'blobs', digest);
}

export function checkpointIndexPath(changeDir: string, stem: string): string {
  return path.join(checkpointDirOf(changeDir, stem), 'index');
}

/**
 * Remove a checkpoint at the path derived from the change directory and stem —
 * never a ticket field — and only when it lies inside `.delegated/`. Returns whether
 * nothing of it remains; a failure is reported, never thrown.
 */
export function releaseCheckpoint(changeDir: string, stem: string): boolean {
  const dir = checkpointDirOf(changeDir, stem);
  try {
    fs.lstatSync(dir);
  } catch {
    return true;
  }
  const root = delegationDirOf(changeDir);
  if (path.resolve(dir) === path.resolve(root) || !isContainedPath(dir, root)) return false;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    return false;
  }
  return !fs.existsSync(dir);
}

// --- Snapshot ---------------------------------------------------------------

export interface SnapshotRef {
  path: string;
  nonce: string;
}

const failure = (error: unknown): string => failureLine(error instanceof Error ? error.message : String(error));

/** Shallow: a shared clone of a shallow repository gets no alternates. */
function shallowBlocker(cwd: string): string | null {
  let shallow: string;
  try {
    shallow = gitRead(cwd, 'rev-parse', ['--is-shallow-repository']).trim();
  } catch {
    return 'not a git repository';
  }
  return shallow === 'true' ? 'the repository is shallow, so a shared clone of it gets no alternates' : null;
}

/**
 * A split index (`core.splitIndex`) links the index to a `sharedindex.<hash>` file
 * that only the main repository holds, so a copy of the index alone cannot be read.
 * The link is live only while the index still carries that hash: after
 * `--no-split-index` git leaves the shared file behind but the index stands alone.
 */
function splitIndexBlocker(cwd: string): string | null {
  try {
    const indexPath = gitPathOf(cwd, 'index');
    const shared = fs.readdirSync(path.dirname(indexPath)).filter((name) => name.startsWith('sharedindex.'));
    if (shared.length === 0 || !fs.existsSync(indexPath)) return null;
    const index = fs.readFileSync(indexPath);
    const linked = shared.some((name) => {
      const hash = name.slice('sharedindex.'.length);
      return /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(hash) && index.includes(Buffer.from(hash, 'hex'));
    });
    return linked ? 'the repository uses a split index (core.splitIndex), whose shared index a snapshot cannot carry' : null;
  } catch (error) {
    return `the index cannot be inspected: ${failure(error)}`;
  }
}

/**
 * `git status` cannot list the changes of a file marked assume-unchanged (the
 * lowercase tag of `ls-files -v`), so the checkpoint would miss it and the snapshot
 * could not reproduce the tree. Listed over the whole index (`:/`), not the
 * project's subtree.
 */
function assumeUnchangedBlocker(cwd: string): string | null {
  let records: string[];
  try {
    records = gitReadRecords(cwd, 'ls-files', ['-v', '-z', '--full-name', '--', ':/']);
  } catch (error) {
    return `the index cannot be listed: ${failure(error)}`;
  }
  const assumed = records.filter((record) => /^[a-z] /.test(record)).map((record) => record.slice(2));
  if (assumed.length === 0) return null;
  return `a tracked file is marked assume-unchanged (${assumed.join(', ')}) — paths relative to the repository top — so its changes cannot be listed for the checkpoint; clear it with \`git -C "$(git rev-parse --show-toplevel)" update-index --no-assume-unchanged <path>\``;
}

/** Why a snapshot cannot be built here, or null. Each refusal carries a named reason. */
function snapshotBlocker(cwd: string): string | null {
  return shallowBlocker(cwd) ?? splitIndexBlocker(cwd) ?? assumeUnchangedBlocker(cwd);
}

async function overlay(root: string, entries: CheckpointEntry[], blob: (digest: string) => string): Promise<void> {
  for (const entry of entries) {
    const target = path.join(root, entry.path);
    if (entry.kind === 'deleted') {
      fs.rmSync(target, { force: true });
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { force: true });
    if (entry.kind === 'symlink') fs.symlinkSync(entry.target!, target);
    else await atomicWrite(target, fs.readFileSync(blob(entry.sha256!)), { mode: entry.mode });
  }
}

/**
 * Build the snapshot: a shared, non-checkout clone with hooks disabled and push
 * disabled, detached at the issue-time HEAD, overlaid with the checkpoint, carrying
 * a copy of the main index (staged additions stay staged — their objects are
 * reachable through the alternates) and a marker with the stem and a nonce. It is
 * kept only when its content digest at the project's path equals the pre-spawn one.
 */
export async function createSnapshot(options: {
  cwd: string;
  changeDir: string;
  stem: string;
  headCommit: string | null;
  checkpoint: Checkpoint;
  preSpawnContentDigest: string;
}): Promise<SnapshotRef> {
  const { cwd, changeDir, stem } = options;
  const blocker = snapshotBlocker(cwd);
  if (blocker !== null) throw refuseIssue(`Cannot build a delegation snapshot: ${blocker}`, DEGRADE);
  const top = gitRead(cwd, 'rev-parse', ['--show-toplevel']).trim();
  const prefix = withFixedGitEnv(() => gitProjectPrefix(cwd));
  const dir = fs.mkdtempSync(path.join(snapshotRoot(), `${SNAPSHOT_PREFIX}${stem}-`));
  const nonce = randomBytes(16).toString('hex');
  try {
    gitSnapshot(dir, 'clone', ['-q', '--shared', '--no-checkout', top, dir]);
    gitSnapshot(dir, 'config', ['core.hooksPath', '/dev/null']);
    gitSnapshot(dir, 'remote', ['set-url', '--push', 'origin', DISABLED_PUSH_URL]);
    const exclude = gitPathOf(cwd, 'info/exclude');
    if (fs.existsSync(exclude)) {
      // A clone made from an empty template directory has no `.git/info/`.
      fs.mkdirSync(path.join(dir, '.git', 'info'), { recursive: true });
      fs.copyFileSync(exclude, path.join(dir, '.git', 'info', 'exclude'));
    }
    if (options.headCommit !== null) gitSnapshot(dir, 'checkout', ['-q', '--detach', options.headCommit]);
    const projectRoot = path.join(dir, prefix);
    await overlay(projectRoot, options.checkpoint.entries, (digest) => checkpointBlobPath(changeDir, stem, digest));
    fs.copyFileSync(checkpointIndexPath(changeDir, stem), path.join(dir, '.git', 'index'));
    await atomicWrite(path.join(dir, '.git', SNAPSHOT_MARKER), JSON.stringify({ stem, nonce }));
    const content = contentDigest(projectRoot);
    if (isUnreadable(content)) {
      throw refuseIssue(`The delegation snapshot cannot be read back: ${content.unreadable}`, DEGRADE);
    }
    if (content.digest !== options.preSpawnContentDigest) {
      // The tree itself may have moved between the facet capture and the checkpoint's
      // copies: that is a retry, not a reason to degrade.
      const now = contentDigest(cwd);
      if (isUnreadable(now) || now.digest !== options.preSpawnContentDigest) {
        throw refuseIssue(`The repository changed while ticket ${stem} was being issued (content)`, 'Let the tree settle, then issue again');
      }
      throw refuseIssue(
        'The delegation snapshot does not reproduce the working tree (a clean/smudge filter, eol conversion or LFS makes its bytes differ)',
        DEGRADE,
      );
    }
    return { path: dir, nonce };
  } catch (error) {
    // `dir` is the mkdtemp result created above — never a path read from a ticket.
    fs.rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Delete a snapshot only when its real path lies directly under the real temporary
 * directory, its name carries the ticket's snapshot prefix, and its marker's nonce
 * equals the ticket's. Never runs a repository-wide `git worktree prune`. Returns
 * whether nothing of the snapshot remains.
 */
export function releaseSnapshot(snapshot: SnapshotRef, stem: string): boolean {
  let real: string;
  try {
    real = fs.realpathSync(snapshot.path);
  } catch {
    return !fs.existsSync(snapshot.path);
  }
  if (path.dirname(real) !== snapshotRoot()) return false;
  if (!path.basename(real).startsWith(`${SNAPSHOT_PREFIX}${stem}-`)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(path.join(real, '.git', SNAPSHOT_MARKER), 'utf8')) as { stem?: unknown; nonce?: unknown };
    if (marker.nonce !== snapshot.nonce || marker.stem !== stem) return false;
  } catch {
    return false;
  }
  fs.rmSync(real, { recursive: true, force: true });
  return !fs.existsSync(real);
}
