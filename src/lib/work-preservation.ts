import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { PreservationGitlinksSchema, type PreservationEntry, type PreservationGitlinks, type PreservationManifest } from '../types/abandon.js';
import type { RepoState } from '../types/delegation.js';
import { gitRead, gitReadBuffer, gitReadRecords, PRESERVATION_DIFF_FLAGS, withFixedGitEnv } from './git-read.js';
import { gitProjectPrefix, readSubmoduleCheckout } from './drift-sources.js';
import { captureGitState, isUnreadable, sameRepoState, sha256 } from './repo-state.js';
import { resolveContainedTarget } from './knowledge-reader.js';
import { atomicWrite } from './fs-utils.js';

/** Refuse inputs Git can hide from an ordinary status/diff capture. Writes nothing. */
export function preflightWork(cwd: string, destination: string) {
  const root = fs.realpathSync(cwd);
  const target = resolveContainedTarget(path.join(destination, 'preservation', 'manifest.json'), root);
  if (!target.ok) throw new PrerequisiteError(`Unsafe preservation destination: ${destination}`, target.reason);
  try {
    gitRead(root, 'rev-parse', ['--verify', 'HEAD^{commit}']);
    const gitPrefix = withFixedGitEnv(() => gitProjectPrefix(root));
    const excluded = path.relative(root, destination).split(path.sep).join('/');
    // Project-relative gitlink path → the commit the index records.
    const gitlinks = new Map<string, string>();
    const records = gitReadRecords(root, 'ls-files', ['-z', '-t', '-v', '--stage', '--full-name', '--', ':/']);
    for (const record of records) {
      const match = /^([A-Za-z?]) (\d{6}) ([0-9a-f]+) (\d)\t([\s\S]+)$/.exec(record);
      if (!match) throw new Error('Unsupported Git index record');
      if (match[1] !== match[1]!.toUpperCase()) throw new Error('assume-unchanged input cannot be preserved completely');
      if (match[1] === 'S') throw new Error('sparse/skip-worktree input cannot be preserved completely');
      if (match[4] !== '0') throw new Error('conflicted/unmerged input cannot be preserved completely');
      const repoPath = match[5]!;
      if (match[2] !== '160000' || !repoPath.startsWith(gitPrefix)) continue;
      const name = repoPath.slice(gitPrefix.length);
      if (name !== excluded && !name.startsWith(`${excluded}/`)) gitlinks.set(name, match[3]!);
    }
    const state = captureGitState(root);
    for (const facet of ['head', 'index', 'refs', 'stash'] as const) {
      if (isUnreadable(state[facet])) throw new Error(`${facet}: unreadable Git input`);
    }
    return { root, gitPrefix, gitlinks, state };
  } catch (error) {
    throw new PrerequisiteError(`Cannot preserve work: ${error instanceof Error ? error.message : String(error)}`, 'Use a readable Git repository with HEAD and resolve unsupported inputs before abandoning');
  }
}

function readEntry(root: string, name: string, blobs: Map<string, Buffer>): PreservationEntry {
  const file = path.join(root, name);
  // Judge ancestors without following a leaf symlink: its target is data.
  const parent = resolveContainedTarget(path.join(path.dirname(file), '.prospec-path-probe'), root);
  if (!parent.ok) throw new Error(`Unsafe preservation input ${name}: ${parent.reason}`);
  let stat: fs.Stats;
  try { stat = fs.lstatSync(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path: name, kind: 'deleted' };
    throw error;
  }
  if (stat.isSymbolicLink()) {
    const raw = fs.readlinkSync(file, { encoding: 'buffer' });
    const target = raw.toString('utf8');
    if (!Buffer.from(target).equals(raw)) throw new Error(`Symlink target cannot be represented losslessly: ${name}`);
    return { path: name, kind: 'symlink', target };
  }
  if (!stat.isFile()) throw new Error(`Unsupported preservation input: ${name}`);
  const contained = resolveContainedTarget(file, root, { read: true });
  if (!contained.ok) throw new Error(`Unreadable preservation input ${name}: ${contained.reason}`);
  const bytes = fs.readFileSync(contained.path);
  const digest = sha256(bytes);
  const blob = `blobs/${blobs.size}`;
  blobs.set(blob, bytes);
  return { path: name, kind: 'regular', mode: stat.mode & 0o777, sha256: digest, blob };
}

/** Fingerprint ignored source artifacts too; symlink leaves are recorded, never followed. */
function artifactDigest(sourceDir: string, root: string): string {
  const entries: unknown[] = [];
  const walk = (dir: string): void => {
    const guard = resolveContainedTarget(path.join(dir, '.prospec-path-probe'), root);
    if (!guard.ok || fs.lstatSync(dir).isSymbolicLink()) throw new Error(`Unsafe source artifact directory: ${dir}`);
    for (const raw of fs.readdirSync(dir, { encoding: 'buffer' }).sort(Buffer.compare)) {
      const name = raw.toString('utf8');
      if (!Buffer.from(name).equals(raw)) throw new Error('Source artifact path cannot be represented losslessly');
      const file = path.join(dir, name);
      const relative = path.relative(root, file);
      if (fs.lstatSync(file).isDirectory()) { entries.push([relative, 'directory']); walk(file); }
      else entries.push(readEntry(root, relative, new Map()));
    }
  };
  walk(sourceDir);
  return sha256(JSON.stringify(entries));
}

export interface WorkCapture {
  root: string;
  destination: string;
  sourceDir: string;
  sourceDigest: string;
  manifest: PreservationManifest;
  staged: Buffer;
  unstaged: Buffer;
  blobs: Map<string, Buffer>;
  gitlinks: PreservationGitlinks['entries'];
  state: RepoState;
}

/** Each gitlink's pin and checked-out commit; a submodule whose commit does not determine its content refuses. */
function captureGitlinks(root: string, gitlinks: Map<string, string>): PreservationGitlinks['entries'] {
  return [...gitlinks].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, index]) => {
    let checkout: string | null;
    try {
      checkout = readSubmoduleCheckout(path.join(root, name), name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new PrerequisiteError(`Cannot preserve work: ${error instanceof Error ? error.message : String(error)}`, 'Commit or clean the submodule, then abandon again');
      }
      checkout = null;
    }
    return { path: name, index, checkout };
  });
}

/** Complete in-memory capture before creating any preservation output. */
export function captureWork(cwd: string, destination: string, sourceDir: string): WorkCapture {
  const context = preflightWork(cwd, destination);
  const { root, gitPrefix } = context;
  const gitlinks = captureGitlinks(root, context.gitlinks);
  const excluded = path.relative(root, destination).split(path.sep).join('/');
  const paths = new Set<string>();
  for (const record of gitReadRecords(root, 'status', ['--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'])) {
    if (record.length < 4) throw new Error('Incomplete Git status record');
    const repoPath = record.slice(3);
    if (!repoPath.startsWith(gitPrefix)) continue;
    const name = repoPath.slice(gitPrefix.length);
    if (name === excluded || name.startsWith(`${excluded}/`) || context.gitlinks.has(name)) continue;
    paths.add(name);
  }
  const blobs = new Map<string, Buffer>();
  const entries = [...paths].sort().map((name) => readEntry(root, name, blobs));
  const pathspec = ['--', '.', `:(exclude,literal)${excluded}`];
  const staged = gitReadBuffer(root, 'diff', [...PRESERVATION_DIFF_FLAGS, '--cached', 'HEAD', ...pathspec]);
  const unstaged = gitReadBuffer(root, 'diff', [...PRESERVATION_DIFF_FLAGS, ...pathspec]);
  const head = context.state.head;
  if (isUnreadable(head) || head.commit === null) throw new Error('HEAD unavailable during capture');
  const manifest: PreservationManifest = { version: 1, root, git_prefix: gitPrefix, head: head.commit,
    patches: { staged: sha256(staged), unstaged: sha256(unstaged) }, entries };
  const sourceDigest = artifactDigest(sourceDir, root);
  const state: RepoState = { ...context.state, content: { digest: sha256(JSON.stringify([manifest, sourceDigest, gitlinks])) } };
  return { root, destination, sourceDir, sourceDigest, manifest, staged, unstaged, blobs, gitlinks, state };
}

/** Output goes only inside the exclusively claimed abandoned entry. */
export async function persistWork(input: WorkCapture): Promise<void> {
  const dir = path.join(input.destination, 'preservation');
  const outputs = new Map<string, Buffer>(input.blobs);
  outputs.set('staged.patch', input.staged);
  outputs.set('unstaged.patch', input.unstaged);
  outputs.set('manifest.json', Buffer.from(JSON.stringify(input.manifest, null, 2) + '\n'));
  if (input.gitlinks.length > 0) {
    const record = PreservationGitlinksSchema.parse({ version: 1, entries: input.gitlinks });
    outputs.set('gitlinks.json', Buffer.from(JSON.stringify(record, null, 2) + '\n'));
  }
  for (const [name, bytes] of outputs) {
    const file = path.join(dir, name);
    const target = resolveContainedTarget(file, input.root);
    if (!target.ok) throw new Error(`Unsafe preservation output ${file}: ${target.reason}`);
    await atomicWrite(target.path, bytes, { mode: 0o600 });
  }
  for (const [name, bytes] of outputs) {
    const target = resolveContainedTarget(path.join(dir, name), input.root, { read: true });
    if (!target.ok || sha256(fs.readFileSync(target.path)) !== sha256(bytes)) {
      throw new Error(`Preservation read-back failed: ${name}`);
    }
  }
}

/** Compare through the existing facet owner, with our full project/source content scope. */
export function recheckWork(input: WorkCapture): void {
  const current = captureWork(input.root, input.destination, input.sourceDir);
  if (!sameRepoState(input.state, current.state)) {
    throw new PrerequisiteError('Preservation inputs changed before publication', 'Inspect the preserved copy and re-run against stable inputs');
  }
}
