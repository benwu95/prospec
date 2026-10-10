import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import { GitlinkPinsSchema, type GitlinkPin, type PreservationEntry, type PreservationManifest } from '../types/abandon.js';
import type { RepoState } from '../types/delegation.js';
import { gitRead, gitReadBuffer, gitReadOptional, gitReadRecords, hiddenIndexShape, parseIndexRecord, PRESERVATION_DIFF_FLAGS, withFixedGitEnv } from './git-read.js';
import { gitlinkCheckoutState, gitProjectPrefix } from './drift-sources.js';
import { captureGitState, isUnreadable, sameRepoState, sha256 } from './repo-state.js';
import { resolveContainedTarget } from './knowledge-reader.js';
import { atomicWrite } from './fs-utils.js';

/** A gitlink's checkout must hold only committed work: preservation records its pins,
 *  never its files, so anything no commit holds would be lost (#352). The status read
 *  fixes the untracked and submodule modes so no configuration hides work. */
function assertCleanSubmodule(dir: string, label: string): void {
  for (const record of gitReadRecords(dir, 'ls-files', ['-z', '-t', '-v', '--stage'])) {
    const entry = parseIndexRecord(record);
    if (hiddenIndexShape(entry) !== null) throw new Error(`gitlink ${label} holds hidden, sparse or unmerged work: ${entry.file}`);
    if (entry.mode === '160000') judgeGitlink(dir, entry.file, `${label}/${entry.file}`);
  }
  if (gitReadRecords(dir, 'status', ['--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=none']).length > 0) {
    throw new Error(`gitlink ${label} holds uncommitted or untracked work`);
  }
}

/** The commit a gitlink path has checked out, or null when nothing there is its checkout
 *  (absent, uninitialized, or an ordinary input such as a file, a symlink or a path behind
 *  a symlinked ancestor, where Git never runs); judged by the fingerprint's own rule,
 *  `gitlinkCheckoutState`. */
function judgeGitlink(repository: string, file: string, label: string): string | null {
  const state = gitlinkCheckoutState(repository, file);
  if (state === 'stray') throw new Error(`gitlink ${label} is not its own checkout (stray files or an invalid .git)`);
  if (state !== 'checkout') return null;
  const dir = path.join(repository, file);
  const commit = gitReadOptional(dir, 'rev-parse', ['--verify', '-q', 'HEAD^{commit}']);
  if (!commit) throw new Error(`gitlink ${label} has no checked-out commit`);
  assertCleanSubmodule(dir, label);
  return commit;
}

/** Project paths (relative to the Git prefix) a gitlink judgment applies to: inside the
 *  project, outside this operation's own destination. */
function projectScope(gitPrefix: string, excluded: string[]): (repoPath: string) => string | null {
  return (repoPath) => {
    if (!repoPath.startsWith(gitPrefix)) return null;
    const name = repoPath.slice(gitPrefix.length);
    return excluded.some((entry) => name === entry || name.startsWith(`${entry}/`)) ? null : name;
  };
}

const HIDDEN_INPUT_REFUSALS = {
  'assume-unchanged': 'assume-unchanged input cannot be preserved completely',
  'skip-worktree': 'sparse/skip-worktree input cannot be preserved completely',
  unmerged: 'conflicted/unmerged input cannot be preserved completely',
} as const;

/** Refuse inputs Git can hide from an ordinary status/diff capture. Writes nothing. */
export interface WorkStorageOptions {
  storageRoot?: string;
  excludedPaths?: string[];
}

export function preflightWork(cwd: string, destination: string, options: WorkStorageOptions = {}) {
  const root = fs.realpathSync(cwd);
  const storageRoot = fs.realpathSync(options.storageRoot ?? root);
  const target = resolveContainedTarget(path.join(destination, 'preservation', 'manifest.json'), storageRoot);
  if (!target.ok) throw new PrerequisiteError(`Unsafe preservation destination: ${destination}`, target.reason);
  try {
    gitRead(root, 'rev-parse', ['--verify', 'HEAD^{commit}']);
    const gitPrefix = withFixedGitEnv(() => gitProjectPrefix(root));
    const excluded = [destination, ...(options.excludedPaths ?? [])].map((dir) => path.relative(root, dir))
      .filter((name) => name !== '' && name !== '..' && !name.startsWith(`..${path.sep}`) && !path.isAbsolute(name))
      .map((name) => name.split(path.sep).join('/'));
    const inScope = projectScope(gitPrefix, excluded);
    const gitlinks = new Map<string, { index: string; checkout: string | null }>();
    const records = gitReadRecords(root, 'ls-files', ['-z', '-t', '-v', '--stage', '--full-name', '--', ':/']);
    for (const record of records) {
      const entry = parseIndexRecord(record);
      const hidden = hiddenIndexShape(entry);
      if (hidden !== null) throw new Error(HIDDEN_INPUT_REFUSALS[hidden]);
      if (entry.mode !== '160000') continue;
      const name = inScope(entry.file);
      if (name !== null) gitlinks.set(name, { index: entry.oid, checkout: judgeGitlink(root, name, name) });
    }
    const state = captureGitState(root);
    for (const facet of ['head', 'index', 'refs', 'stash'] as const) {
      if (isUnreadable(state[facet])) throw new Error(`${facet}: unreadable Git input`);
    }
    return { root, storageRoot, excluded, gitPrefix, state, gitlinks, inScope };
  } catch (error) {
    throw new PrerequisiteError(`Cannot preserve work: ${error instanceof Error ? error.message : String(error)}`, 'Use a readable Git repository with HEAD, commit or remove work inside submodules, and resolve unsupported inputs before abandoning');
  }
}

/** HEAD's side of every changed project path, from status v2: its HEAD mode and object.
 *  A path status does not list is unchanged, so HEAD holds what the index holds. */
function headRecords(root: string, inScope: (repoPath: string) => string | null): Map<string, { mode: string; index: string; oid: string }> {
  const found = new Map<string, { mode: string; index: string; oid: string }>();
  for (const record of gitReadRecords(root, 'status', ['--porcelain=v2', '-z', '--untracked-files=no', '--no-renames', '--ignore-submodules=none'])) {
    if (!record.startsWith('1 ')) continue;
    const fields = record.split(' ');
    const [, , , modeHead, modeIndex, , headOid] = fields;
    const name = inScope(fields.slice(8).join(' '));
    if (name !== null) found.set(name, { mode: modeHead!, index: modeIndex!, oid: headOid! });
  }
  return found;
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
  storageRoot: string;
  excludedPaths: string[];
  destination: string;
  sourceDir: string;
  sourceDigest: string;
  manifest: PreservationManifest;
  /** Project-scoped gitlinks, recorded by their pins in `gitlinks.json` beside the manifest. */
  gitlinks: GitlinkPin[];
  staged: Buffer;
  unstaged: Buffer;
  blobs: Map<string, Buffer>;
  state: RepoState;
}

/** Complete in-memory capture before creating any preservation output. */
export function captureWork(cwd: string, destination: string, sourceDir: string, options: WorkStorageOptions = {}): WorkCapture {
  const context = preflightWork(cwd, destination, options);
  const { root, storageRoot, excluded, gitPrefix, inScope } = context;
  const gitlinks: GitlinkPin[] = [];
  try {
    const heads = headRecords(root, inScope);
    for (const [name, pins] of context.gitlinks) {
      const head = heads.get(name);
      // HEAD records a commit only under mode 160000; a file or tree there is no pin.
      const headCommit = head === undefined ? pins.index : head.mode === '160000' ? head.oid : null;
      gitlinks.push({ path: name, head_commit: headCommit, index_commit: pins.index, checkout_commit: pins.checkout });
    }
    for (const [name, head] of heads) {
      // Removed from the index only (mode 000000); a gitlink the index now holds as a file
      // or link is a typechange, preserved as that file.
      if (context.gitlinks.has(name) || head.mode !== '160000' || head.index !== '000000') continue;
      gitlinks.push({ path: name, head_commit: head.oid, index_commit: null, checkout_commit: judgeGitlink(root, name, name) });
    }
  } catch (error) {
    throw new PrerequisiteError(`Cannot preserve work: ${error instanceof Error ? error.message : String(error)}`, 'Commit or remove work inside submodules before abandoning');
  }
  gitlinks.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  // Only an absent path or a directory is the gitlink itself; a file or symlink now at
  // the path is an ordinary input the manifest preserves.
  const gitlinkPaths = new Set(gitlinks.map((pin) => pin.path)
    .filter((name) => gitlinkCheckoutState(root, name) !== 'other'));
  const paths = new Set<string>();
  for (const record of gitReadRecords(root, 'status', ['--porcelain=v1', '-z', '--untracked-files=all', '--no-renames', '--ignore-submodules=none'])) {
    if (record.length < 4) throw new Error('Incomplete Git status record');
    // A nested repository is listed as an untracked directory with a trailing slash.
    const name = inScope(record.slice(3).replace(/\/$/, ''));
    if (name === null || gitlinkPaths.has(name)) continue;
    paths.add(name);
  }
  const blobs = new Map<string, Buffer>();
  const entries = [...paths].sort().map((name) => readEntry(root, name, blobs));
  const pathspec = ['--', '.', ...excluded.map((entry) => `:(exclude,literal)${entry}`)];
  const staged = gitReadBuffer(root, 'diff', [...PRESERVATION_DIFF_FLAGS, '--cached', 'HEAD', ...pathspec]);
  const unstaged = gitReadBuffer(root, 'diff', [...PRESERVATION_DIFF_FLAGS, ...pathspec]);
  const head = context.state.head;
  if (isUnreadable(head) || head.commit === null) throw new Error('HEAD unavailable during capture');
  const manifest: PreservationManifest = { version: 1, root, git_prefix: gitPrefix, head: head.commit,
    patches: { staged: sha256(staged), unstaged: sha256(unstaged) }, entries };
  const sourceDigest = artifactDigest(sourceDir, root);
  const state: RepoState = { ...context.state, content: { digest: sha256(JSON.stringify([manifest, gitlinks, sourceDigest])) } };
  return { root, storageRoot, excludedPaths: options.excludedPaths ?? [], destination, sourceDir, sourceDigest, manifest, gitlinks, staged, unstaged, blobs, state };
}

/** Output goes only inside the exclusively claimed abandoned entry. */
export async function persistWork(input: WorkCapture): Promise<void> {
  const dir = path.join(input.destination, 'preservation');
  const outputs = new Map<string, Buffer>(input.blobs);
  outputs.set('staged.patch', input.staged);
  outputs.set('unstaged.patch', input.unstaged);
  outputs.set('manifest.json', Buffer.from(JSON.stringify(input.manifest, null, 2) + '\n'));
  if (input.gitlinks.length > 0) {
    const pins = GitlinkPinsSchema.parse({ version: 1, gitlinks: input.gitlinks });
    outputs.set('gitlinks.json', Buffer.from(JSON.stringify(pins, null, 2) + '\n'));
  }
  for (const [name, bytes] of outputs) {
    const file = path.join(dir, name);
    const target = resolveContainedTarget(file, input.storageRoot);
    if (!target.ok) throw new Error(`Unsafe preservation output ${file}: ${target.reason}`);
    await atomicWrite(target.path, bytes, { mode: 0o600 });
  }
  for (const [name, bytes] of outputs) {
    const target = resolveContainedTarget(path.join(dir, name), input.storageRoot, { read: true });
    if (!target.ok || sha256(fs.readFileSync(target.path)) !== sha256(bytes)) {
      throw new Error(`Preservation read-back failed: ${name}`);
    }
  }
}

/** Compare through the existing facet owner, with our full project/source content scope. */
export function recheckWork(input: WorkCapture): void {
  const current = captureWork(input.root, input.destination, input.sourceDir, { storageRoot: input.storageRoot, excludedPaths: input.excludedPaths });
  if (!sameRepoState(input.state, current.state)) {
    throw new PrerequisiteError('Preservation inputs changed before publication', 'Inspect the preserved copy and re-run against stable inputs');
  }
}
