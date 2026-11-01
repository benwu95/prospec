import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIndexFileSource, inventoryFileSource, listProjectFiles } from '../../../src/lib/project-files-adapters.js';
import { probeGitWorkTree } from '../../../src/lib/git-prerequisite.js';
import { GIT_READ_TIMEOUT_MS, PATHSPEC_ENV } from '../../../src/lib/git-read.js';
import type { SourceInventory } from '../../../src/types/drift-report.js';

vi.setConfig({ testTimeout: 30_000 });
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});
vi.mock('../../../src/lib/git-prerequisite.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/git-prerequisite.js')>();
  return { ...actual, probeGitWorkTree: vi.fn(actual.probeGitWorkTree) };
});
const nativeChild = await vi.importActual<typeof import('node:child_process')>('node:child_process');
const nativeProbe = await vi.importActual<typeof import('../../../src/lib/git-prerequisite.js')>('../../../src/lib/git-prerequisite.js');
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-index-files-'));
  vi.mocked(execFileSync).mockImplementation(nativeChild.execFileSync);
  vi.mocked(probeGitWorkTree).mockImplementation(nativeProbe.probeGitWorkTree);
  vi.clearAllMocks();
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function git(cwd: string, ...args: string[]): string {
  return nativeChild.execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}
function write(cwd: string, name: string): void {
  fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true });
  fs.writeFileSync(path.join(cwd, name), 'export {};');
}
function init(): void { git(root, 'init', '-q'); }
function files(cwd: string, options: Parameters<typeof listProjectFiles>[1] = {}): string[] {
  const result = listProjectFiles(cwd, options);
  expect(result.available).toBe(true);
  if (!result.available) throw new Error(result.reason);
  return result.files;
}
function inventory(entries: Array<[string, string | null]>): SourceInventory {
  return { entries: new Map(entries.map(([name, mode]) => [name, { mode, oid: mode === null ? null : 'a'.repeat(40) }])), changed: new Set(), changedBookkeeping: new Set(), bookkeeping: new Set() };
}
const record = (file: string, mode = '100644', stage = '0') => `H ${mode} ${'a'.repeat(40)} ${stage}\t${file}\0`;

describe.each(['.', 'pkg'])('listProjectFiles real git at %s', (project) => {
  it('lists staged index members including dot directories, deep paths and build, without untracked or ignored caches', () => {
    init();
    const cwd = path.join(root, project);
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n__pycache__/\n');
    const expected = ['src/a.ts', '.hidden/a.ts', 'build/output.js', `${'deep/'.repeat(12)}a.ts`];
    for (const name of expected) write(cwd, name);
    for (const name of ['.env', 'src/x.key', 'src/a-secret.ts']) write(cwd, name);
    git(root, 'add', '.');
    for (const name of ['untracked.ts', 'src/node_modules/cache.ts', 'src/__pycache__/cache.py']) write(cwd, name);
    expect(files(cwd)).toEqual([...expected, ...(project === '.' ? ['.gitignore'] : [])].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    git(cwd, 'add', 'untracked.ts');
    expect(files(cwd)).toContain('untracked.ts');
  });

  it('uses literal subtree and git glob rules with positive exclusion subtraction', () => {
    init(); const cwd = path.join(root, project); fs.mkdirSync(cwd, { recursive: true });
    for (const name of ['src/a.ts', 'src/nested/b.ts', 'src/cache/c.ts', 'x/seg', 'x/components/c.ts']) write(cwd, name);
    git(root, 'add', '.');
    expect(files(cwd, { modulePaths: ['src'], exclude: ['src/cache/'] })).toEqual(['src/a.ts', 'src/nested/b.ts']);
    expect(files(cwd, { modulePaths: ['src/**'], exclude: ['**/b.ts', ':bad', '../outside', 'src/{a,b}/*'] })).toEqual(['src/a.ts', 'src/cache/c.ts']);
    expect(files(cwd, { modulePaths: ['**/seg'] })).toEqual(['x/seg']);
    expect(files(cwd, { modulePaths: ['**/components/**'] })).toEqual(['x/components/c.ts']);
    expect(files(cwd, { exclude: ['.'] })).toEqual([]);
    expect(listProjectFiles(cwd, { modulePaths: ['absent'] })).toEqual({ available: true, files: [], coverage: 'no-members' });
    expect(listProjectFiles(cwd, { modulePaths: ['src'], exclude: ['src'] })).toEqual({ available: true, files: [], coverage: 'members' });
  });
});

describe('git index edge cases', () => {
  it('does not probe or spawn when every module path is refused', () => {
    expect(listProjectFiles(root, { modulePaths: [':bad', '../outside'] })).toEqual({ available: true, files: [], coverage: 'refused' });
    expect(execFileSync).not.toHaveBeenCalled(); expect(probeGitWorkTree).not.toHaveBeenCalled();
  });

  it('distinguishes a non-work-tree and a bare repository from an empty index', () => {
    expect(listProjectFiles(root)).toEqual({ available: false, reason: expect.stringContaining('not-work-tree') });
    git(root, 'init', '--bare', '-q');
    expect(listProjectFiles(root)).toEqual({ available: false, reason: expect.stringContaining('not-work-tree') });
  });

  it.skipIf(process.platform === 'win32')('preserves literal backslash, star, brackets and LF file names', () => {
    init();
    const names = ['back\\slash.ts', 'star*.ts', 'bracket[].ts', 'line\nfeed.ts'];
    for (const name of names) write(root, name);
    git(root, 'add', '.');
    expect(files(root)).toEqual(names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    expect(files(root, { modulePaths: ['bracket[].ts', 'back\\slash.ts', 'line\nfeed.ts'] })).toEqual(['back\\slash.ts', 'bracket[].ts', 'line\nfeed.ts']);
  });

  it.skipIf(process.platform === 'win32')('skips symlink leaves and symlink ancestors even when their targets are contained', () => {
    init(); write(root, 'dir/a.ts'); fs.symlinkSync('dir/a.ts', path.join(root, 'link.ts')); git(root, 'add', '.');
    fs.renameSync(path.join(root, 'dir'), path.join(root, 'real'));
    fs.symlinkSync('real', path.join(root, 'dir'));
    expect(files(root)).toEqual([]);
  });

  it('excludes gitlinks even if the checkout path is replaced by a regular file', () => {
    init(); write(root, 'ordinary.ts'); git(root, 'add', '.');
    const oid = git(root, 'hash-object', '-w', '--stdin').trim();
    git(root, 'update-index', '--add', '--cacheinfo', `160000,${oid},submodule`);
    write(root, 'submodule');
    expect(files(root)).toEqual(['ordinary.ts']);
  });

  it('deduplicates unmerged entries by path and accepts existing worktree bytes', () => {
    init(); write(root, 'conflict.ts');
    const oid = git(root, 'hash-object', '-w', 'conflict.ts').trim();
    nativeChild.execFileSync('git', ['update-index', '--index-info'], { cwd: root, input: `100644 ${oid} 1\tconflict.ts\n100644 ${oid} 2\tconflict.ts\n100644 ${oid} 3\tconflict.ts\n`, stdio: 'pipe' });
    expect(files(root)).toEqual(['conflict.ts']);
  });

  it('ignores PATHSPEC_ENV while preserving a caller-selected repository index', () => {
    init(); write(root, 'src/a.ts'); write(root, 'src/b.ts'); git(root, 'add', 'src/a.ts');
    const alternate = path.join(root, '.git', 'alternate-index');
    fs.copyFileSync(path.join(root, '.git', 'index'), alternate);
    vi.stubEnv('GIT_INDEX_FILE', alternate); git(root, 'add', 'src/b.ts');
    for (const name of PATHSPEC_ENV) vi.stubEnv(name, '1');
    expect(files(root, { modulePaths: ['src/**'] })).toEqual(['src/a.ts', 'src/b.ts']);
    vi.stubEnv('GIT_INDEX_FILE', path.join(root, '.git', 'index'));
    expect(files(root, { modulePaths: ['src/**'] })).toEqual(['src/a.ts']);
  });
});

describe('source adapter contracts', () => {
  it('is lazy, uses cached tagged stage records and bounds reads while retaining repository env', () => {
    vi.mocked(probeGitWorkTree).mockReturnValue({ state: 'work-tree' });
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(record('a.ts')));
    vi.stubEnv('GIT_INDEX_FILE', '/chosen/index');
    for (const name of PATHSPEC_ENV) vi.stubEnv(name, '1');
    const source = gitIndexFileSource(root);
    expect(execFileSync).not.toHaveBeenCalled(); expect(probeGitWorkTree).not.toHaveBeenCalled();
    expect(source.members()).toEqual({ available: true, files: ['a.ts'] });
    const [, args, options] = vi.mocked(execFileSync).mock.calls[0]!;
    expect(args).toEqual(['ls-files', '-z', '-t', '--stage', '--cached']);
    expect(options).toMatchObject({ cwd: root, timeout: GIT_READ_TIMEOUT_MS, env: { GIT_INDEX_FILE: '/chosen/index' } });
    const env = (options as { env: NodeJS.ProcessEnv }).env;
    for (const name of PATHSPEC_ENV) expect(env[name]).toBeUndefined();
  });

  it('projects only index entries from inventory without probing or capturing it', () => {
    const source = inventoryFileSource(root, inventory([['a.ts', '100644'], ['untracked.ts', null], ['sub', '160000']]));
    expect(source.members()).toEqual({ available: true, files: ['a.ts'] });
    expect(execFileSync).not.toHaveBeenCalled(); expect(probeGitWorkTree).not.toHaveBeenCalled();
    expect(source.listPathspecs([])).toEqual({ available: true, files: [] });
    expect(execFileSync).not.toHaveBeenCalled();
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(record('a.ts')));
    expect(source.listPathspecs([':(glob)**/*.ts'])).toEqual({ available: true, files: ['a.ts'] });
    expect(vi.mocked(execFileSync).mock.calls[0]![1]).toEqual(['ls-files', '-z', '-t', '--stage', '--cached', '--', ':(glob)**/*.ts']);
  });

  it('skips undecodable records individually, drops gitlinks, and deduplicates merge stages', () => {
    vi.mocked(probeGitWorkTree).mockReturnValue({ state: 'work-tree' });
    vi.mocked(execFileSync).mockReturnValue(Buffer.concat([Buffer.from(record('ok.ts')), Buffer.from(record('bad').slice(0, -1)), Buffer.from([0xff, 0]), Buffer.from(record('sub', '160000')), Buffer.from(record('conflict.ts', '100644', '1') + record('conflict.ts', '100644', '2'))]));
    expect(gitIndexFileSource(root).members()).toEqual({ available: true, files: ['ok.ts', 'conflict.ts'] });
  });

  it.each(['unterminated', 'bad-record\0'])('refuses incomplete NUL or malformed index capture: %s', (capture) => {
    vi.mocked(probeGitWorkTree).mockReturnValue({ state: 'work-tree' });
    vi.mocked(execFileSync).mockReturnValue(Buffer.from(capture));
    expect(gitIndexFileSource(root).members()).toEqual({ available: false, reason: expect.stringContaining('git index unavailable') });
  });

  it('preserves git failure reasons and exclusion-listing failure', () => {
    vi.mocked(probeGitWorkTree).mockReturnValue({ state: 'work-tree' });
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error('Command failed: git\nfatal: index corrupt\nextra'); });
    expect(gitIndexFileSource(root).members()).toEqual({ available: false, reason: 'git index unavailable: fatal: index corrupt' });
    write(root, 'a.ts');
    vi.mocked(execFileSync).mockReturnValueOnce(Buffer.from(record('a.ts')));
    expect(listProjectFiles(root)).toEqual({ available: false, reason: 'git index unavailable: fatal: index corrupt' });
  });

  it.each(['git-missing', 'git-failed'] as const)('retains probe refusal %s', (state) => {
    vi.mocked(probeGitWorkTree).mockReturnValue(state === 'git-missing' ? { state } : { state, detail: 'timed out' });
    expect(gitIndexFileSource(root).members()).toEqual({ available: false, reason: expect.stringContaining(state) });
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
