import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryError } from '../../../src/types/errors.js';
import type { HistoryPaths } from '../../../src/types/history.js';
import { HISTORY_POINTER } from '../../../src/types/history.js';
import { inventoryTree, transferBundle, withHistoryClaim, readHistoryOperation, assertNoPendingHistory, assertHistoryFinalizable, historyClaimPath, diagnoseLocalHistory } from '../../../src/lib/terminal-transfer.js';
import { preflightTransferSource } from '../../../src/lib/terminal-transfer.js';
vi.mock('../../../src/lib/history-paths.js', () => ({
  recheckHistoryPaths: () => { },
  historyOrigin: (p: HistoryPaths, changeName: string) => ({ commonDir: p.commonDir, worktree: p.worktree, projectPrefix: p.projectPrefix, changeName }),
}));
vi.mock('node:fs', async (importOriginal) => ({ ...await importOriginal<typeof import('node:fs')>() }));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) {
  writableFixture(root); fs.rmSync(root, { recursive: true, force: true }); } });
function writableFixture(root: string): void {
  if (!fs.lstatSync(root).isDirectory()) return;
  fs.chmodSync(root, 0o755);
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) if (entry.isDirectory()) writableFixture(path.join(root, entry.name));
}
function fixture() {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'terminal-'));
  roots.push(root);
  const source = path.join(root, 'source'), main = path.join(root, 'main');
  fs.mkdirSync(source);
  fs.mkdirSync(main);
  const paths: HistoryPaths = { sourceProjectRoot: source, historyProjectRoot: main, archiveRoot: path.join(main, '.prospec/archive'), abandonedRoot: path.join(main, '.prospec/abandoned'), operationsRoot: path.join(main, '.prospec/history-operations'), commonDir: null, worktree: source, projectPrefix: '' };
  const sourceDir = path.join(source, '.prospec/changes/example');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'proposal.md'), 'original');
  return { paths, sourceDir, kind: 'archive' as const, identity: '2026-10-10-example', changeName: 'example', cleanup: true };
}
describe('terminal transfer', () => {
  it.skipIf(process.platform === 'win32').each(['root', 'nested'])('imports readable readonly %s directories without changing source or final modes', async (location) => {
    const f = fixture();
    const readonly = location === 'root' ? f.sourceDir : path.join(f.sourceDir, 'nested');
    fs.mkdirSync(readonly, { recursive: true });
    fs.writeFileSync(path.join(readonly, 'retained'), 'saved'); fs.chmodSync(readonly, 0o555);
    try {
      const original = inventoryTree(f.sourceDir);
      const op = await transferBundle({ ...f, cleanup: false, legacy: true });
      expect(inventoryTree(f.sourceDir)).toEqual(original); expect(inventoryTree(op.finalDir)).toEqual(original);
      expect(fs.existsSync(op.stagingDir)).toBe(false);
    } finally { fs.chmodSync(readonly, 0o755); }
  });
  it.skipIf(process.platform === 'win32')('prepares private readonly directories and retains explicitly changed final modes', async () => {
    const f = fixture(); const nested = path.join(f.sourceDir, 'nested'); fs.mkdirSync(nested); fs.chmodSync(nested, 0o555);
    try {
      const op = await transferBundle({ ...f, cleanup: false, prepare: async stage => {
        fs.writeFileSync(path.join(stage, 'nested/new'), 'prepared'); fs.chmodSync(stage, 0o555);
      } });
      expect(fs.statSync(op.finalDir).mode & 0o777).toBe(0o555);
      expect(fs.statSync(path.join(op.finalDir, 'nested')).mode & 0o777).toBe(0o555);
      expect(fs.readFileSync(path.join(op.finalDir, 'nested/new'), 'utf8')).toBe('prepared');
      expect(fs.statSync(nested).mode & 0o777).toBe(0o555);
      fs.chmodSync(op.finalDir, 0o755); fs.chmodSync(path.join(op.finalDir, 'nested'), 0o755);
    } finally { fs.chmodSync(nested, 0o755); }
  });
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('refuses native source cleanup without widening readonly source permissions', async () => {
    const f = fixture(); fs.chmodSync(f.sourceDir, 0o555);
    try {
      const error = await transferBundle(f).catch(cause => cause);
      expect(error).toBeInstanceOf(HistoryError); expect(error.details.phase).toBe('published');
      expect(fs.statSync(f.sourceDir).mode & 0o777).toBe(0o555);
      expect(fs.readFileSync(path.join(error.details.finalDir, 'proposal.md'), 'utf8')).toBe('original');
      fs.chmodSync(error.details.finalDir, 0o755); fs.chmodSync(error.details.stagingDir, 0o755);
    } finally { fs.chmodSync(f.sourceDir, 0o755); }
  });

  it.skipIf(process.platform === 'win32')('restores readonly private modes when staging removal fails and reports retained copies', async () => {
    const f = fixture(), nested = path.join(f.sourceDir, 'nested'); fs.mkdirSync(nested); fs.writeFileSync(path.join(nested, 'saved'), 'bytes'); fs.chmodSync(nested, 0o555);
    const original = inventoryTree(f.sourceDir), rm = fs.rmSync;
    vi.spyOn(fs, 'rmSync').mockImplementation((file, options) => {
      if (path.basename(String(file)).startsWith('.staging-')) throw new Error('staging cleanup denied');
      rm(file, options);
    });
    const error = await transferBundle({ ...f, legacy: true, cleanup: false }).catch(cause => cause);
    expect(error).toBeInstanceOf(HistoryError); expect(error.details.phase).toBe('complete');
    expect(error.message).toContain('staging cleanup denied');
    expect(inventoryTree(f.sourceDir)).toEqual(original); expect(inventoryTree(error.details.finalDir)).toEqual(original);
    expect(fs.statSync(path.join(error.details.stagingDir, 'nested')).mode & 0o777).toBe(0o555);
  });
  it.skipIf(process.platform === 'win32')('retains permission restoration failures in the transfer error envelope', async () => {
    const f = fixture(); fs.chmodSync(f.sourceDir, 0o555);
    const chmod = fs.chmodSync; let restorations = 0;
    vi.spyOn(fs, 'chmodSync').mockImplementation((file, mode) => {
      if (path.basename(String(file)).startsWith('.staging-') && mode === 0o555 && ++restorations === 2) throw new Error('restore mode denied');
      chmod(file, mode);
    });
    const error = await transferBundle({ ...f, legacy: true, cleanup: false }).catch(cause => cause);
    expect(error).toBeInstanceOf(HistoryError); expect(error.details.phase).toBe('copying'); expect(error.message).toContain('restore mode denied');
    expect(fs.statSync(f.sourceDir).mode & 0o777).toBe(0o555);
    expect(fs.readFileSync(path.join(error.details.stagingDir, 'proposal.md'), 'utf8')).toBe('original');
  });
  it.skipIf(process.platform === 'win32')('preserves both preparation and permission restoration errors', async () => {
    const f = fixture(); fs.chmodSync(f.sourceDir, 0o555);
    const chmod = fs.chmodSync; let restorations = 0;
    vi.spyOn(fs, 'chmodSync').mockImplementation((file, mode) => {
      if (path.basename(String(file)).startsWith('.staging-') && mode === 0o555 && ++restorations === 2) throw new Error('restore mode denied');
      chmod(file, mode);
    });
    const error = await transferBundle({ ...f, cleanup: false, prepare: async () => { throw new Error('prepare denied'); } }).catch(cause => cause);
    expect(error).toBeInstanceOf(HistoryError); expect(error.details.phase).toBe('copying'); expect(error.cause).toBeInstanceOf(AggregateError);
    expect(error.cause.errors).toHaveLength(2); expect(error.message).toContain('prepare denied'); expect(error.message).toContain('restore mode denied');
    expect(fs.statSync(f.sourceDir).mode & 0o777).toBe(0o555);
  });
  it.each(['unlink', 'rmdir'] as const)('retains complete transfer details when claim release %s fails', async (method) => {
    const f = fixture();
    const claim = historyClaimPath(f.paths);
    const unlink = fs.unlinkSync, rmdir = fs.rmdirSync;
    if (method === 'unlink') vi.spyOn(fs, 'unlinkSync').mockImplementation(file => {
      if (String(file) === path.join(claim, 'owner')) throw new Error('release unlink fault');
      unlink(file);
    });
    else vi.spyOn(fs, 'rmdirSync').mockImplementation(file => {
      if (String(file) === claim) throw new Error('release rmdir fault');
      rmdir(file);
    });
    const error = await transferBundle(f).catch(cause => cause);
    expect(error).toBeInstanceOf(HistoryError);
    const operationPath = path.join(f.paths.operationsRoot, fs.readdirSync(f.paths.operationsRoot).find(file => file.endsWith('.json'))!);
    const operation = JSON.parse(fs.readFileSync(operationPath, 'utf8'));
    expect(error.details).toEqual({ phase: 'complete', sourceDir: f.sourceDir, stagingDir: operation.stagingDir, finalDir: operation.finalDir, operationPath });
    expect(error.message).toContain(`release ${method} fault`);
    expect(error.message).toContain(claim);
    expect(fs.existsSync(f.sourceDir)).toBe(false);
    expect(fs.readFileSync(path.join(operation.finalDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(fs.existsSync(claim)).toBe(true);
  });
  it.each(['prepare', 'staging cleanup'] as const)('retains primary %s failure together with failed claim release', async (phase) => {
    const f = fixture();
    const claim = historyClaimPath(f.paths), unlink = fs.unlinkSync, rm = fs.rmSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation(file => {
      if (String(file) === path.join(claim, 'owner')) throw new Error('release fault');
      unlink(file);
    });
    if (phase === 'staging cleanup') vi.spyOn(fs, 'rmSync').mockImplementation((file, options) => {
      if (path.basename(String(file)).startsWith('.staging-')) throw new Error('primary cleanup fault');
      rm(file, options);
    });
    const error = await transferBundle({ ...f, prepare: async () => { if (phase === 'prepare') throw new Error('primary prepare fault'); } }).catch(cause => cause);
    expect(error).toBeInstanceOf(HistoryError);
    expect(error.message).toContain(phase === 'prepare' ? 'primary prepare fault' : 'primary cleanup fault');
    expect(error.message).toContain('release fault');
    expect(error.details.phase).toBe(phase === 'prepare' ? 'copying' : 'complete');
    expect(error.cause).toBeInstanceOf(AggregateError);
    expect(error.cause.errors).toHaveLength(2);
    expect(fs.existsSync(claim)).toBe(true);
    const retained = phase === 'prepare' ? f.sourceDir : error.details.finalDir;
    expect(fs.readFileSync(path.join(retained, 'proposal.md'), 'utf8')).toBe('original');
  });

  it('preflights contained source inventory without creating history state', () => {
    const f = fixture();
    expect(preflightTransferSource(f.paths, f.sourceDir)).toEqual(inventoryTree(f.sourceDir));
    expect(fs.existsSync(path.join(f.paths.historyProjectRoot, '.prospec'))).toBe(false);
    expect(() => preflightTransferSource(f.paths, f.paths.historyProjectRoot)).toThrow(/escapes/);
    fs.renameSync(f.sourceDir, `${f.sourceDir}-actual`);
    fs.symlinkSync(`${f.sourceDir}-actual`, f.sourceDir);
    expect(() => preflightTransferSource(f.paths, f.sourceDir)).toThrow(/Unsafe history path/);
    expect(fs.existsSync(path.join(f.paths.historyProjectRoot, '.prospec'))).toBe(false);
  });
  it('copies bytes, modes, empty directories and literal symlink targets before cleaning source', async () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.sourceDir, 'empty'), { mode: 0o711 });
    fs.writeFileSync(path.join(f.sourceDir, 'binary'), Buffer.from([0, 255, 17]), { mode: 0o751 });
    fs.symlinkSync('../missing', path.join(f.sourceDir, 'link'));
    const original = inventoryTree(f.sourceDir);
    const op = await transferBundle(f);
    expect(op.phase).toBe('complete');
    expect(fs.existsSync(f.sourceDir)).toBe(false);
    expect(inventoryTree(op.finalDir).filter(e => e.path !== HISTORY_POINTER)).toEqual(original);
    expect(readHistoryOperation(f.paths, f.kind, f.identity)).toEqual(op);
  });
  it('keeps original and prepared inventories separate and allows completed summary edits', async () => {
    const f = fixture();
    const op = await transferBundle({ ...f, prepare: async (dir) => { fs.writeFileSync(path.join(dir, 'proposal.md'), 'terminal'); } });
    expect(op.original).not.toEqual(op.prepared);
    fs.writeFileSync(path.join(op.finalDir, 'summary.md'), 'authored');
    expect(assertHistoryFinalizable(f.paths, f.kind, f.identity)?.phase).toBe('complete');
  });
  it('refuses reserved pointer and retains the source', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.sourceDir, HISTORY_POINTER), '{}');
    await expect(transferBundle(f)).rejects.toThrow(/reserved/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
  });
  it('refuses occupied and crash claims without reclaiming them', async () => {
    const f = fixture();
    await withHistoryClaim(f.paths, async () => { await expect(withHistoryClaim(f.paths, async () => { })).rejects.toThrow(/claim/i); });
    fs.mkdirSync(historyClaimPath(f.paths));
    await expect(transferBundle(f)).rejects.toThrow(/claim/i);
    expect(fs.existsSync(historyClaimPath(f.paths))).toBe(true);
  });
  it('keeps original bytes when preparation fails, blocks this origin but not siblings', async () => {
    const f = fixture();
    await expect(transferBundle({ ...f, prepare: async () => { throw Error('failed preparation'); } })).rejects.toThrow('failed preparation');
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(() => assertNoPendingHistory(f.paths, 'example')).toThrow(/pending/i);
    expect(() => assertNoPendingHistory({ ...f.paths, worktree: '/other' }, 'example')).not.toThrow();
    await expect(transferBundle({ ...f, identity: '2026-10-11-example' })).rejects.toThrow(/pending/i);
  });
  it('keeps changed source and published readable history while refusing finalize', async () => {
    const f = fixture();
    await expect(transferBundle({ ...f, prepare: async () => { fs.writeFileSync(path.join(f.sourceDir, 'new'), 'user'); } })).rejects.toThrow(/changed/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'new'), 'utf8')).toBe('user');
    expect(readHistoryOperation(f.paths, f.kind, f.identity)?.phase).toBe('published');
    expect(() => assertHistoryFinalizable(f.paths, f.kind, f.identity)).toThrow(/cleanup|complete/i);
  });
  it('imports legacy copy-only preserving exact inventory and metadata bytes', async () => {
    const f = fixture();
    const before = inventoryTree(f.sourceDir);
    const op = await transferBundle({ ...f, cleanup: false, legacy: true });
    expect(inventoryTree(op.finalDir)).toEqual(before);
    expect(inventoryTree(f.sourceDir)).toEqual(before);
    expect(readHistoryOperation(f.paths, f.kind, f.identity)).toBeNull();
  });
  it('never overwrites an existing destination', async () => {
    const f = fixture();
    const dest = path.join(f.paths.archiveRoot, f.identity);
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'existing'), 'keep');
    await expect(transferBundle(f)).rejects.toThrow();
    expect(fs.readFileSync(path.join(dest, 'existing'), 'utf8')).toBe('keep');
    expect(fs.existsSync(f.sourceDir)).toBe(true);
  });
  it('does not downgrade missing or corrupt marked lineage to legacy', async () => {
    const f = fixture();
    const op = await transferBundle(f);
    fs.unlinkSync(path.join(f.paths.operationsRoot, `${op.operationId}.json`));
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow();
  });
  it('retains a new source file arriving during cleanup instead of recursively deleting it', async () => {
    const f = fixture();
    const unlink = fs.unlinkSync;
    let injected = false;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => { if (String(file).startsWith(f.sourceDir) && !injected) {
      injected = true;
      fs.writeFileSync(path.join(f.sourceDir, 'arrived'), 'keep');
    } return unlink(file); });
    await expect(transferBundle(f)).rejects.toThrow();
    expect(fs.readFileSync(path.join(f.sourceDir, 'arrived'), 'utf8')).toBe('keep');
    expect(readHistoryOperation(f.paths, f.kind, f.identity)?.phase).toBe('published');
  });
  it('rejects native history whose pointer disappeared after completion', async () => {
    const f = fixture();
    const op = await transferBundle(f);
    fs.unlinkSync(path.join(op.finalDir, HISTORY_POINTER));
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow(/pointer/i);
  });
  it('publishes pointer before any artifact and refuses partially copied history', async () => {
    const f = fixture();
    const copy = fs.copyFileSync;
    let observed = false;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((from, to, flags) => { if (String(to).startsWith(f.paths.archiveRoot)) {
      observed = fs.existsSync(path.join(path.dirname(String(to)), HISTORY_POINTER));
      throw Error('publish fault');
    } return copy(from, to, flags); });
    await expect(transferBundle(f)).rejects.toThrow('publish fault');
    expect(observed).toBe(true);
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow(/incomplete/i);
    expect(fs.existsSync(f.sourceDir)).toBe(true);
  });
  it('does not follow symlinked bundle or history ancestors', async () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.paths.historyProjectRoot, '.prospec'));
    fs.symlinkSync(f.paths.sourceProjectRoot, f.paths.archiveRoot);
    await expect(transferBundle(f)).rejects.toThrow(/unsafe/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
  });
  it('detects source changes during staging copy', async () => {
    const f = fixture();
    const copy = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((from, to, flags) => { const result = copy(from, to, flags); fs.writeFileSync(path.join(f.sourceDir, 'proposal.md'), 'changed'); return result; });
    await expect(transferBundle(f)).rejects.toThrow(/changed/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('changed');
    expect(fs.existsSync(path.join(f.paths.archiveRoot, f.identity))).toBe(false);
  });
  it('reports pointer removal failure without losing either legacy copy', async () => {
    const f = fixture();
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation(file => { if (String(file) === path.join(f.paths.archiveRoot, f.identity, HISTORY_POINTER))
      throw Error('pointer removal fault'); return unlink(file); });
    await expect(transferBundle({ ...f, cleanup: false, legacy: true })).rejects.toThrow('pointer removal fault');
    expect(fs.existsSync(f.sourceDir)).toBe(true);
    expect(readHistoryOperation(f.paths, f.kind, f.identity)?.phase).toBe('complete');
  });
  it('rejects unsupported FIFO nodes without deleting source', async () => {
    const f = fixture();
    execFileSync('mkfifo', [path.join(f.sourceDir, 'pipe')]);
    await expect(transferBundle(f)).rejects.toThrow(/unsupported/i);
    expect(fs.existsSync(path.join(f.sourceDir, 'proposal.md'))).toBe(true);
  });
  it('refuses non-roundtrippable names before copying', async () => {
    const f = fixture();
    vi.spyOn(fs, 'readdirSync').mockReturnValueOnce([Buffer.from([255])] as never);
    expect(() => inventoryTree(f.sourceDir)).toThrow(/UTF-8|lossless/i);
    expect(fs.existsSync(f.sourceDir)).toBe(true);
  });
  it('preserves POSIX backslash filenames', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.sourceDir, 'literal\\name'), 'literal');
    const op = await transferBundle(f);
    expect(fs.readFileSync(path.join(op.finalDir, 'literal\\name'), 'utf8')).toBe('literal');
  });
  it('retains original bytes and releases its claim on initial journal failure', async () => {
    const f = fixture();
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(Error('journal fault'));
    await expect(transferBundle(f)).rejects.toThrow('journal fault');
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(fs.existsSync(historyClaimPath(f.paths))).toBe(false);
  });
  it('retains complete final and remaining source after partial cleanup failure', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.sourceDir, 'z'), 'second');
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation(file => { if (String(file) === path.join(f.sourceDir, 'proposal.md'))
      throw Error('cleanup fault'); return unlink(file); });
    await expect(transferBundle(f)).rejects.toThrow('cleanup fault');
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(fs.readFileSync(path.join(f.paths.archiveRoot, f.identity, 'z'), 'utf8')).toBe('second');
    expect(readHistoryOperation(f.paths, f.kind, f.identity)?.phase).toBe('published');
  });
  it('does not release a claim replaced by a different owner', async () => {
    const f = fixture();
    await withHistoryClaim(f.paths, async () => { fs.writeFileSync(path.join(historyClaimPath(f.paths), 'owner'), 'another'); });
    expect(fs.readFileSync(path.join(historyClaimPath(f.paths), 'owner'), 'utf8')).toBe('another');
  });
  it('rechecks each remaining source entry during cleanup', async () => {
    const f = fixture();
    fs.writeFileSync(path.join(f.sourceDir, 'z'), 'second');
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation(file => { if (String(file) === path.join(f.sourceDir, 'z'))
      fs.writeFileSync(path.join(f.sourceDir, 'proposal.md'), 'changed during cleanup'); return unlink(file); });
    await expect(transferBundle(f)).rejects.toThrow(/changed/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('changed during cleanup');
  });
  it('refuses read-back mismatches before publication and retains source', async () => {
    const f = fixture();
    const copy = fs.copyFileSync;
    vi.spyOn(fs, 'copyFileSync').mockImplementation((from, to, flags) => {
      copy(from, to, flags);
      if (String(to).startsWith(f.paths.archiveRoot)) fs.writeFileSync(to, 'corrupt copy');
    });
    await expect(transferBundle(f)).rejects.toThrow(/changed/i);
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow(/incomplete/i);
  });
  it('does not clean source when publication journal write fails', async () => {
    const f = fixture();
    const rename = fs.promises.rename;
    let calls = 0;
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (++calls === 3) throw Error('publication journal fault');
      return rename(from, to);
    });
    await expect(transferBundle(f)).rejects.toThrow('publication journal fault');
    expect(fs.readFileSync(path.join(f.sourceDir, 'proposal.md'), 'utf8')).toBe('original');
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow(/incomplete/i);
  });
  it('verifies published pending bytes while allowing completed authored edits', async () => {
    const f = fixture();
    await expect(transferBundle({ ...f, prepare: async () => {
      fs.writeFileSync(path.join(f.sourceDir, 'arrived'), 'new');
    } })).rejects.toThrow();
    fs.writeFileSync(path.join(f.paths.archiveRoot, f.identity, 'proposal.md'), 'corrupt');
    expect(() => readHistoryOperation(f.paths, f.kind, f.identity)).toThrow(/changed/i);
  });
  it('reports local-only and conflicting legacy history', () => {
    const f = fixture();
    const local = path.join(f.paths.sourceProjectRoot, '.prospec/archive', f.identity);
    fs.mkdirSync(local, { recursive: true });
    fs.writeFileSync(path.join(local, 'summary.md'), 'local');
    expect(diagnoseLocalHistory(f.paths)[0]?.reason).toMatch(/import/i);
  });
});
