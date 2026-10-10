import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn, imageOf } from '../../helpers/git-fixture.js';
import { execute, executePaths } from '../../../src/services/history-import.service.js';
import { resolveHistoryPaths } from '../../../src/lib/history-paths.js';
import { transferBundle, inventoryTree } from '../../../src/lib/terminal-transfer.js';
import { sha256 } from '../../../src/lib/repo-state.js';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { HISTORY_POINTER } from '../../../src/types/history.js';

vi.mock('node:fs', async (original) => ({ ...await original<typeof fs>() }));
vi.setConfig({ testTimeout: 30_000 });
let root: string, main: string, linked: string;
const identity = '2026-10-10-old';
function put(dir: string, name: string, text: string): void {
  const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
}
function bundle(kind = 'archive', id = identity, project = linked): string {
  const dir = path.join(project, '.prospec', kind, id);
  put(dir, 'metadata.yaml', '# legacy bytes\nstatus: archived\n'); put(dir, 'summary.md', 'full summary'); return dir;
}
function abandoned(): string {
  const dir = bundle('abandoned');
  put(dir, 'metadata.yaml', stringifyYaml({ name: 'old', created_at: '2026-10-10', status: 'abandoned', abandonment: { reason: 'disproved', at: '2026-10-10', from_status: 'plan', escalation: null, overturned: [], premise_note: 'None', manifest: 'preservation/manifest.json' } }));
  put(dir, 'preservation/manifest.json', JSON.stringify({ version: 1, root: '/deleted-origin', git_prefix: '', head: 'a'.repeat(40), patches: { staged: sha256(''), unstaged: sha256('') }, entries: [] }));
  put(dir, 'preservation/staged.patch', ''); put(dir, 'preservation/unstaged.patch', ''); return dir;
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'history-import-'))); main = path.join(root, 'main');
  put(main, '.prospec.yaml', 'base_dir: prospec\n'); gitIn(main, 'init', '-qb', 'main'); gitIn(main, 'add', '.'); gitIn(main, 'commit', '-qm', 'fixture');
  linked = path.join(root, 'linked'); gitIn(main, 'worktree', 'add', '-qb', 'linked', linked);
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
describe('history import', () => {
  it('reports canonical paths and local-only history without writes', async () => {
    bundle(); const before = imageOf(root); const result = await executePaths({ cwd: linked });
    expect(result.paths.archiveRoot).toBe(path.join(main, '.prospec/archive')); expect(result.diagnostics).toHaveLength(1); expect(imageOf(root)).toEqual(before);
  });
  it.each(['main', 'linked'])('reports pending publication and claims from %s without requiring a final bundle or writing', async (origin) => {
    const source = path.join(origin === 'main' ? main : linked, '.prospec/changes/old');
    const paths = resolveHistoryPaths(linked);
    const operation = { version: 1, operationId: 'pending', kind: 'archive', identity, origin: { commonDir: paths.commonDir, worktree: origin === 'main' ? main : linked, projectPrefix: '', changeName: 'old' }, sourceDir: source, stagingDir: path.join(paths.operationsRoot, '.staging-pending'), finalDir: path.join(paths.archiveRoot, identity), phase: 'copying', original: [], prepared: [], cleanup: true };
    put(paths.operationsRoot, 'pending.json', JSON.stringify(operation));
    fs.mkdirSync(path.join(paths.operationsRoot, 'writer'));
    const before = imageOf(root);
    const result = await executePaths({ cwd: linked });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      { path: path.join(paths.operationsRoot, 'pending.json'), reason: expect.stringContaining('copying') },
      { path: path.join(paths.operationsRoot, 'writer'), reason: expect.stringMatching(/claim/i) },
    ]));
    const reason = result.diagnostics.find(entry => entry.path.endsWith('pending.json'))!.reason;
    for (const location of [operation.sourceDir, operation.stagingDir, operation.finalDir]) expect(reason).toContain(location);
    expect(fs.existsSync(operation.finalDir)).toBe(false); expect(imageOf(root)).toEqual(before);
  });
  it('accepts completed legacy abandon markers but refuses nonterminal metadata', async () => {
    const source = abandoned();
    put(source, 'abandon-operation.json', JSON.stringify({ version: 1, source: 'old', source_digest: sha256('old'), phase: 'publishing', moved: ['metadata.yaml'], pending: [] }));
    expect((await execute({ cwd: main, from: linked, dryRun: true })).entries[0]?.outcome).toBe('planned');
    const metadataPath = path.join(source, 'metadata.yaml');
    fs.writeFileSync(metadataPath, fs.readFileSync(metadataPath, 'utf8').replace('status: abandoned', 'status: plan'));
    expect((await execute({ cwd: main, from: linked, dryRun: true })).entries[0]).toMatchObject({ outcome: 'failed', reason: expect.stringContaining('Incomplete abandonment') });
  });
  it('copies legacy archive and abandoned bytes, preserves sources, and deduplicates reruns', async () => {
    const archive = bundle(), abandon = abandoned(); const originals = [inventoryTree(archive), inventoryTree(abandon)];
    const result = await execute({ cwd: main, from: linked }); expect(result.entries.map(e => e.outcome)).toEqual(['imported', 'imported']);
    for (const [index, entry] of result.entries.entries()) { expect(inventoryTree(entry.source)).toEqual(originals[index]); expect(inventoryTree(entry.destination)).toEqual(originals[index]); expect(fs.existsSync(path.join(entry.destination, HISTORY_POINTER))).toBe(false); }
    expect((await execute({ cwd: main, from: linked })).entries.map(e => e.outcome)).toEqual(['identical', 'identical']);
  });
  it.skipIf(process.platform === 'win32').each(['root', 'nested'])('imports readonly legacy %s with dry-run parity and exact modes', async location => {
    const source = bundle(); const readonly = location === 'root' ? source : path.join(source, 'nested');
    fs.mkdirSync(readonly, { recursive: true }); fs.writeFileSync(path.join(readonly, 'saved'), 'saved'); fs.chmodSync(readonly, 0o555);
    const target = path.join(main, '.prospec/archive', identity); const destinationReadonly = location === 'root' ? target : path.join(target, 'nested');
    try {
      const original = inventoryTree(source), before = imageOf(root);
      expect((await execute({ cwd: main, from: linked, dryRun: true })).entries[0]?.outcome).toBe('planned'); expect(imageOf(root)).toEqual(before);
      const result = await execute({ cwd: main, from: linked }); expect(result.entries[0]?.outcome).toBe('imported');
      expect(inventoryTree(source)).toEqual(original); expect(inventoryTree(target)).toEqual(original);
    } finally {
      fs.chmodSync(readonly, 0o755); if (fs.existsSync(destinationReadonly)) fs.chmodSync(destinationReadonly, 0o755);
    }
  });
  it('previews identical admissions without any writes', async () => {
    bundle(); abandoned(); const before = imageOf(root);
    expect((await execute({ cwd: main, from: linked, dryRun: true })).entries.map(e => e.outcome)).toEqual(['planned', 'planned']); expect(imageOf(root)).toEqual(before);
  });
  it('reports conflicts and incomplete entries while copying independent valid entries', async () => {
    bundle(); const target = bundle('archive', identity, main); put(target, 'summary.md', 'conflict');
    bundle('archive', '2026-10-10-good'); const bad = abandoned(); put(bad, 'preservation/staged.patch', 'corrupt');
    const before = inventoryTree(target); const result = await execute({ cwd: main, from: linked });
    expect(result.entries.map(e => e.outcome)).toEqual(['imported', 'conflicting', 'failed']); expect(inventoryTree(target)).toEqual(before);
  });
  it('reports transient pointer removal failure and retains both complete copies', async () => {
    const source = bundle(); const before = inventoryTree(source);
    const unlink = fs.unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      if (String(file).endsWith(HISTORY_POINTER)) throw new Error('injected pointer removal failure');
      unlink(file);
    });
    const result = await execute({ cwd: main, from: linked });
    expect(result.entries[0]).toMatchObject({ outcome: 'failed', reason: expect.stringContaining('pointer removal failure') });
    const paths = resolveHistoryPaths(linked);
    const operationPath = path.join(paths.operationsRoot, fs.readdirSync(paths.operationsRoot).find(file => file.endsWith('.json'))!);
    const operation = JSON.parse(fs.readFileSync(operationPath, 'utf8'));
    const details = { phase: operation.phase, sourceDir: operation.sourceDir, stagingDir: operation.stagingDir, finalDir: operation.finalDir, operationPath };
    expect(result.entries[0]).toMatchObject({ details });
    for (const location of [details.sourceDir, details.stagingDir, details.finalDir, details.operationPath]) expect(result.entries[0]?.reason).toContain(location);
    expect(JSON.parse(JSON.stringify(result)).entries[0]).toMatchObject({ details });

    expect(inventoryTree(source)).toEqual(before);
    const destination = result.entries[0]!.destination;
    expect(fs.readFileSync(path.join(destination, 'summary.md'), 'utf8')).toBe('full summary');
    expect(fs.existsSync(path.join(destination, HISTORY_POINTER))).toBe(true);
  });
  it('dry-run refuses an occupied writer claim without creating further files', async () => {
    bundle(); fs.mkdirSync(path.join(main, '.prospec/history-operations/writer'), { recursive: true });
    const before = imageOf(root);
    expect((await execute({ cwd: main, from: linked, dryRun: true })).entries[0]).toMatchObject({ outcome: 'failed', reason: expect.stringContaining('claim') });
    expect(imageOf(root)).toEqual(before);
  });
  it('refuses unrelated repositories and different project scopes', async () => {
    await expect(execute({ cwd: main, from: root })).rejects.toThrow();
    put(main, 'nested/.prospec.yaml', 'base_dir: prospec\n'); put(linked, 'nested/.prospec.yaml', 'base_dir: prospec\n');
    await expect(execute({ cwd: main, from: path.join(linked, 'nested') })).rejects.toThrow(/scope|project/i);
  });
  it('supports only self no-op for non-Git projects', async () => {
    const plain = path.join(root, 'plain'); fs.mkdirSync(plain); bundle('archive', identity, plain);
    expect((await execute({ cwd: plain, from: plain })).entries[0]?.outcome).toBe('identical');
    await expect(execute({ cwd: plain, from: linked })).rejects.toThrow();
  });
  it('validates modern canonical no-op and identical local copies against history-owned lineage', async () => {
    const source = path.join(linked, '.prospec/changes/old'); put(source, 'summary.md', 'modern');
    const op = await transferBundle({ paths: resolveHistoryPaths(linked), sourceDir: source, kind: 'archive', identity, changeName: 'old', cleanup: true });
    expect((await execute({ cwd: linked, from: main })).entries[0]?.outcome).toBe('identical');
    fs.cpSync(op.finalDir, path.join(linked, '.prospec/archive', identity), { recursive: true });
    expect((await execute({ cwd: main, from: linked })).entries[0]?.outcome).toBe('identical');
    fs.unlinkSync(path.join(main, '.prospec/history-operations', `${op.operationId}.json`));
    expect((await execute({ cwd: main, from: linked })).entries[0]?.outcome).toBe('failed');
  });
  it('refuses modern noncanonical relocation and malformed pointers', async () => {
    const source = bundle(); put(source, HISTORY_POINTER, JSON.stringify({ version: 1, operationId: 'missing', kind: 'archive', identity }));
    const before = imageOf(root); expect((await execute({ cwd: main, from: linked })).entries[0]?.outcome).toBe('failed'); expect(imageOf(root)).toEqual(before);
  });
  it('refuses abandoned envelopes and partial abandon markers in archive storage', async () => {
    const source = bundle(); put(source, 'abandon-operation.json', '{}');
    expect((await execute({ cwd: main, from: linked })).entries[0]?.outcome).toBe('failed');
  });
  it('refuses symlinked bundle roots without changing either tree', async () => {
    const source = bundle(); fs.renameSync(source, path.join(root, 'outside')); fs.symlinkSync(path.join(root, 'outside'), source);
    const before = imageOf(root); expect((await execute({ cwd: main, from: linked })).entries[0]?.outcome).toBe('failed'); expect(imageOf(root)).toEqual(before);
  });
});
