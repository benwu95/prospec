import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn, imageOf } from '../../helpers/git-fixture.js';
import { execute, executeFinalize } from '../../../src/services/archive.service.js';
import { transferBundle } from '../../../src/lib/terminal-transfer.js';
import { resolveHistoryPaths } from '../../../src/lib/history-paths.js';

vi.mock('../../../src/lib/drift-assessment.js', () => ({
  assessCurrentDrift: vi.fn(async () => ({ report: { structural: { checks: ['metadata-completeness', 'task-completion', 'review-provenance', 'test-provenance', 'delta-spec-provenance'].map(id => ({ id, status: 'pass', subjects: ['same'] })), findings: [] } }, snapshot: { digest: 'fixture', clean: true }, recheck: () => true })),
}));
vi.setConfig({ testTimeout: 30_000 });
let root: string;
let main: string;
let first: string;
let second: string;
function write(file: string, value: string): void { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, value); }
const summary = '# Same\n\n## Review & Verify\n\nVerified.\n';
function active(source: string): string {
  const dir = path.join(source, '.prospec/changes/same');
  write(path.join(dir, 'metadata.yaml'), 'name: same\nstatus: verified\ncreated_at: 2026-01-01T00:00:00.000Z\nscale: standard\n');
  write(path.join(dir, 'proposal.md'), '# Proposal\n');
  write(path.join(dir, 'summary.md'), summary);
  return dir;
}
async function terminal(source: string, identity: string): Promise<string> {
  const paths = resolveHistoryPaths(source);
  await transferBundle({ paths, identity, kind: 'archive', changeName: 'same', sourceDir: active(source), cleanup: true });
  return path.join(paths.archiveRoot, identity);
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-worktree-')));
  main = path.join(root, 'primary');
  write(path.join(main, '.prospec.yaml'), 'project:\n  name: fixture\npaths:\n  base_dir: prospec\n');
  write(path.join(main, '.gitignore'), '.prospec/\n');
  write(path.join(main, 'prospec/specs/features/fixture.md'), '# Primary spec\n');
  gitIn(main, 'init', '-qb', 'trunk'); gitIn(main, 'add', '.'); gitIn(main, 'commit', '-qm', 'fixture');
  first = path.join(root, 'first'); second = path.join(root, 'second');
  gitIn(main, 'worktree', 'add', '-qb', 'first', first); gitIn(main, 'worktree', 'add', '-qb', 'second', second);
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe('archive canonical worktree flow', () => {
  it.each([false, true])('refuses conflicting local legacy history for either selector (dry-run %s)', async (dryRun) => {
    const identity = '2026-01-01-same';
    write(path.join(main, '.prospec/archive', identity, 'summary.md'), `${summary}Primary`);
    write(path.join(first, '.prospec/archive', identity, 'summary.md'), `${summary}Linked`);
    const before = imageOf(root);
    for (const bundle of [undefined, identity]) {
      await expect(executeFinalize({ cwd: first, name: 'same', bundle, dryRun })).rejects.toThrow(/conflict|import/i);
      expect(imageOf(root)).toEqual(before);
    }
  });
  it('rechecks local history before finalize writes after asynchronous config loading', async () => {
    const identity = '2026-01-01-same';
    write(path.join(main, '.prospec/archive', identity, 'summary.md'), summary);
    const originalRead = fs.promises.readFile.bind(fs.promises);
    vi.spyOn(fs.promises, 'readFile').mockImplementation(async (...args) => {
      const result = await originalRead(...args);
      if (String(args[0]) === path.join(first, '.prospec.yaml')) {
        write(path.join(first, '.prospec/archive', identity, 'summary.md'), `${summary}Concurrent conflict`);
      }
      return result;
    });
    await expect(executeFinalize({ cwd: first, name: 'same', bundle: identity })).rejects.toThrow(/conflict|import/i);
    expect(fs.existsSync(path.join(first, 'prospec/specs/_archived-history'))).toBe(false);
  });
  it.each(['pointer', 'fifo'])('shares read-only source admission between preview and execution: %s', async (kind) => {
    const dir = active(first);
    if (kind === 'pointer') write(path.join(dir, '.prospec-transfer.json'), '{}');
    else {
      const { execFileSync } = await import('node:child_process');
      execFileSync('mkfifo', [path.join(dir, 'pipe')]);
    }
    const dry = await execute({ cwd: first, names: ['same'], dryRun: true });
    expect(dry.archived).toEqual([]);
    expect(dry.skippedReasons.same).toMatch(/Reserved history pointer|Unsupported history node/);
    expect(fs.existsSync(path.join(main, '.prospec'))).toBe(false);
    const real = await execute({ cwd: first, names: ['same'] });
    expect(real.archived).toEqual(dry.archived);
    expect(real.skippedReasons).toEqual(dry.skippedReasons);
    expect(fs.readFileSync(path.join(dir, 'metadata.yaml'), 'utf8')).toContain('status: verified');
  });
  it('publishes full artifacts in main while archive/finalize write only source specs', async () => {
    const dir = active(first);
    write(path.join(dir, 'delta-spec.md'), '# Delta Spec\n\n## ADDED\n\n### REQ-LIB-001: Helper\n\n**Feature:** helper\n**Story:** US-1\n\n**Description:**\nHelper behavior.\n');
    write(path.join(dir, 'tasks.md'), '- [x] T1 implemented\n');
    write(path.join(dir, 'notes/deep.txt'), 'retained detail');
    const primaryBefore = imageOf(path.join(main, 'prospec'));
    const siblingBefore = imageOf(path.join(second, 'prospec'));
    const before = imageOf(root);
    const dry = await execute({ cwd: first, names: ['same'], dryRun: true });
    expect(imageOf(root)).toEqual(before);
    const result = await execute({ cwd: first, names: ['same'] });
    expect(result.skippedReasons).toEqual({});
    expect(result.archived).toHaveLength(1);
    const archived = result.archived[0]!;
    expect(archived.archivePath).toBe(dry.archived[0]!.archivePath);
    expect(archived.archiveIdentity).toBe(path.basename(archived.archivePath));
    expect(archived.archivePath.startsWith(path.join(main, '.prospec/archive'))).toBe(true);
    expect(fs.readFileSync(path.join(archived.archivePath, 'notes/deep.txt'), 'utf8')).toBe('retained detail');
    expect(fs.readFileSync(path.join(archived.archivePath, 'metadata.yaml'), 'utf8')).toContain('status: archived');
    expect(fs.existsSync(dir)).toBe(false);
    write(path.join(archived.archivePath, 'summary.md'), summary);
    await executeFinalize({ cwd: first, name: 'same', bundle: archived.archiveIdentity });
    expect(fs.readFileSync(path.join(first, 'prospec/specs/_archived-history', `${archived.archiveIdentity}.md`), 'utf8')).toBe(summary);
    expect(imageOf(path.join(main, 'prospec'))).toEqual(primaryBefore);
    expect(imageOf(path.join(second, 'prospec'))).toEqual(siblingBefore);
  });
  it('retains the complete source on summary publication failure and reports partial diagnostics', async () => {
    const dir = active(first);
    const before = imageOf(dir);
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('/summary.md')) throw new Error('summary disk full');
      return rename(from, to);
    });
    const result = await execute({ cwd: first, names: ['same'] });
    expect(result.archived).toEqual([]);
    expect(result.skippedReasons.same).toMatch(/summary disk full/);
    expect(result.skippedReasons.same).toContain('staging');
    const paths = resolveHistoryPaths(first);
    const operationPath = path.join(paths.operationsRoot, fs.readdirSync(paths.operationsRoot).find(file => file.endsWith('.json'))!);
    const operation = JSON.parse(fs.readFileSync(operationPath, 'utf8'));
    const details = { phase: operation.phase, sourceDir: operation.sourceDir, stagingDir: operation.stagingDir, finalDir: operation.finalDir, operationPath };
    expect(result).toMatchObject({ skippedDetails: { same: details } });
    for (const location of [details.sourceDir, details.stagingDir, details.finalDir, details.operationPath]) expect(result.skippedReasons.same).toContain(location);
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ skippedDetails: { same: details } });

    expect(imageOf(dir)).toEqual(before);
  });
  it('discloses partial source spec writes while preserving original change artifacts', async () => {
    const dir = active(first);
    write(path.join(dir, 'delta-spec.md'), '# Delta Spec\n\n## ADDED\n\n### REQ-LIB-001: One\n\n**Feature:** first\n**Story:** US-1\n\n**Description:**\nFirst.\n\n---\n\n### REQ-LIB-002: Two\n\n**Feature:** second\n**Story:** US-1\n\n**Description:**\nSecond.\n');
    const before = imageOf(dir);
    const rename = fs.promises.rename.bind(fs.promises);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to) === path.join(first, 'prospec/specs/features/second.md')) throw new Error('spec disk full');
      return rename(from, to);
    });
    const result = await execute({ cwd: first, names: ['same'] });
    expect(result.archived).toEqual([]);
    expect(result.skippedReasons.same).toMatch(/spec disk full/);
    expect(fs.readFileSync(path.join(first, 'prospec/specs/features/first.md'), 'utf8')).toContain('REQ-LIB-001');
    expect(imageOf(dir)).toEqual(before);
    expect(fs.existsSync(path.join(main, 'prospec/specs/features/first.md'))).toBe(false);
  });
  it('selects own origin across interleaved dates and refuses ambiguous own dates', async () => {
    const own = await terminal(first, '2026-01-01-same');
    const foreign = await terminal(second, '2026-03-01-same');
    const foreignBefore = imageOf(foreign);
    expect((await executeFinalize({ cwd: first, name: 'same' })).archiveDir).toContain('2026-01-01-same');
    await expect(executeFinalize({ cwd: first, name: 'same', bundle: '2026-03-01-same' })).rejects.toThrow(/another source/);
    await terminal(first, '2026-02-01-same');
    const ownBefore = imageOf(own);
    await expect(executeFinalize({ cwd: first, name: 'same' })).rejects.toThrow(/Ambiguous/);
    const before = imageOf(root);
    await executeFinalize({ cwd: first, name: 'same', bundle: '2026-02-01-same', dryRun: true });
    expect(imageOf(root)).toEqual(before);
    await executeFinalize({ cwd: first, name: 'same', bundle: '2026-02-01-same' });
    expect(imageOf(own)).toEqual(ownBefore);
    expect(imageOf(foreign)).toEqual(foreignBefore);
  });
  it('refuses published cleanup-pending finalize and occupied writer claims in dry-run', async () => {
    const own = await terminal(first, '2026-01-01-same');
    const pointer = JSON.parse(fs.readFileSync(path.join(own, '.prospec-transfer.json'), 'utf8')) as { operationId: string };
    const operationFile = path.join(main, '.prospec/history-operations', `${pointer.operationId}.json`);
    const operation = JSON.parse(fs.readFileSync(operationFile, 'utf8')) as { phase: string };
    operation.phase = 'published'; fs.writeFileSync(operationFile, JSON.stringify(operation));
    await expect(executeFinalize({ cwd: first, name: 'same', bundle: '2026-01-01-same' })).rejects.toThrow(/cleanup is pending/);
    operation.phase = 'complete'; fs.writeFileSync(operationFile, JSON.stringify(operation));
    fs.mkdirSync(path.join(main, '.prospec/history-operations/writer'));
    const before = imageOf(root);
    await expect(executeFinalize({ cwd: first, name: 'same', dryRun: true })).rejects.toThrow(/claim unavailable/);
    expect(imageOf(root)).toEqual(before);
  });
  it('requires explicit import of linked-local legacy history before archiving', async () => {
    active(first);
    write(path.join(first, '.prospec/archive/2025-01-01-previous/summary.md'), summary);
    const before = imageOf(root);
    const result = await execute({ cwd: first, names: ['same'], dryRun: true });
    expect(result.archived).toEqual([]);
    expect(result.skippedReasons.same ?? result.refused[0]?.reason).toMatch(/history import/);
    expect(imageOf(root)).toEqual(before);
  });
  it('rejects a sole foreign origin and marked publication with missing lineage', async () => {
    const foreign = await terminal(second, '2026-03-01-same');
    await expect(executeFinalize({ cwd: first, name: 'same' })).rejects.toThrow(/foreign-origin/);
    const pointer = JSON.parse(fs.readFileSync(path.join(foreign, '.prospec-transfer.json'), 'utf8')) as { operationId: string };
    fs.unlinkSync(path.join(main, '.prospec/history-operations', `${pointer.operationId}.json`));
    await expect(executeFinalize({ cwd: second, name: 'same', bundle: '2026-03-01-same' })).rejects.toThrow();
  });
});
