import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute as archive, executeFinalize } from '../../src/services/archive.service.js';
import { execute as abandon } from '../../src/services/change-abandon.service.js';
import { execute as story } from '../../src/services/change-story.service.js';
import { execute as status } from '../../src/services/status.service.js';
import { execute as importHistory } from '../../src/services/history-import.service.js';
import { abandonedFixture } from '../helpers/abandon.js';
import { executeYield } from '../../src/services/learn.service.js';
import { readPremiseAssessment } from '../../src/lib/premise.js';
import { readChangeMetadata } from '../../src/lib/change-metadata.js';
import { readAbandonedAttempt, readAbandonHistory } from '../../src/lib/abandon-history.js';
import { resolveHistoryPaths } from '../../src/lib/history-paths.js';
import { inventoryTree } from '../../src/lib/terminal-transfer.js';
import { premiseProposal, verifiedPremise } from '../helpers/premise.js';

// Current provenance assessment is injected; Git, storage, publication and all
// lifecycle service orchestration use real fixtures. Gate semantics have their
// own real-assessment suites in workflow-contracts and evidence-validity.
vi.mock('../../src/lib/drift-assessment.js', async original => ({
  ...await original<typeof import('../../src/lib/drift-assessment.js')>(),
  assessCurrentDrift: async (cwd: string) => ({
    report: { structural: { checks: ['metadata-completeness', 'task-completion', 'review-provenance', 'test-provenance', 'delta-spec-provenance'].map(id => ({ id, status: 'pass', subjects: fs.readdirSync(path.join(cwd, '.prospec/changes')) })), findings: [] } },
    snapshot: { digest: 'fixture', clean: true }, recheck: () => true,
  }),
}));
vi.setConfig({ testTimeout: 60_000 });
let root: string, main: string, linked: string, sibling: string;
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000 });
function write(cwd: string, relative: string, text: string | Buffer): string {
  const file = path.join(cwd, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}
function seed(cwd: string, name: string, status = 'verified'): string {
  const dir = path.join(cwd, '.prospec/changes', name);
  write(dir, 'metadata.yaml', `name: ${name}\ncreated_at: '2026-10-10'\nstatus: ${status}\nissue: '#366'\nrelated_modules: []\n`);
  write(dir, 'proposal.md', '# Authored proposal\n');
  write(dir, 'delta-spec.md', '# Delta Spec\n\n## ADDED\n');
  write(dir, 'tasks.md', '- [x] T1 Preserve full artifacts\n');
  write(dir, 'review.md', '<!-- prospec:review-metrics round="1" lenses="security" -->\n# Review Findings\n');
  write(dir, 'verify.md', '# Authored verification\n');
  write(dir, 'attachments/raw.bin', Buffer.from([0, 255, 1, 127]));
  fs.chmodSync(path.join(dir, 'attachments/raw.bin'), 0o751);
  fs.mkdirSync(path.join(dir, 'empty'), { mode: 0o711 });
  fs.symlinkSync('attachments/raw.bin', path.join(dir, 'artifact-link'));
  return dir;
}
function image(cwd: string) {
  return inventoryTree(cwd).filter(entry => !entry.path.split('/').includes('.git'));
}
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-history-')));
  main = path.join(root, 'main'); linked = path.join(root, 'linked'); sibling = path.join(root, 'sibling');
  fs.mkdirSync(main);
  git(main, 'init', '-q'); git(main, 'config', 'user.name', 'fixture'); git(main, 'config', 'user.email', 'fixture@example.test');
  write(main, '.prospec.yaml', 'version: "1.0"\nproject:\n  name: fixture\n');
  write(main, '.gitignore', '.prospec/\n');
  write(main, 'tracked.txt', 'baseline\n');
  write(main, 'prospec/specs/features/widget.md', '---\nfeature: widget\nstatus: active\nstory_count: 0\nreq_count: 0\n---\n\n# Widget\n');
  git(main, 'add', '.'); git(main, 'commit', '-qm', 'fixture');
  git(main, 'worktree', 'add', '-qb', 'feature', linked);
  git(main, 'worktree', 'add', '-qb', 'sibling', sibling);
});
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

describe('terminal history survives normal Git worktree removal', () => {
  it('reports missing corresponding project history and blocks story creation without hiding active work', async () => {
    const source = path.join(linked, 'packages/tool');
    write(source, '.prospec.yaml', 'project:\n  name: tool\n');
    seed(source, 'active', 'story');
    const before = image(root);
    const history = readAbandonHistory(source);
    expect(history.errors).toHaveLength(1);
    expect(history.errors[0]?.error).toMatch(/ENOENT|main|history/i);
    const report = await status({ cwd: source });
    expect(report.clean).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
    expect(report.changes.map(change => change.name)).toContain('active');
    await expect(story({ cwd: source, name: 'retry', issue: '#366', scale: 'quick' })).rejects.toThrow(/history/i);
    expect(image(root)).toEqual(before);
  });
  it('archives full artifacts, finalizes only source specs, and preserves canonical inventory for sibling learn', async () => {
    const sourceDir = seed(linked, 'finished');
    const sourceInventory = inventoryTree(sourceDir).filter(entry => entry.path !== 'metadata.yaml');
    const siblingDir = seed(sibling, 'finished', 'story');
    const siblingBefore = inventoryTree(siblingDir);
    const mainSpec = image(path.join(main, 'prospec'));
    const dryBefore = image(root);
    const dry = await archive({ cwd: linked, names: ['finished'], dryRun: true });
    expect(dry.refused).toEqual([]);
    expect(image(root)).toEqual(dryBefore);
    const result = await archive({ cwd: linked, names: ['finished'] });
    expect(result.refused).toEqual([]); expect(result.skipped).toEqual([]); expect(result.archived).toHaveLength(1);
    const entry = result.archived[0]!;
    expect(entry.archivePath).toBe(path.join(main, '.prospec/archive', entry.archiveIdentity!));
    expect(inventoryTree(entry.archivePath).filter(item => !['metadata.yaml', 'summary.md', '.prospec-transfer.json'].includes(item.path))).toEqual(sourceInventory);
    expect(fs.existsSync(sourceDir)).toBe(false);
    const summary = '# Finished\n\n## Review & Verify\n\nGrade A. Full artifact preservation verified.\n';
    write(entry.archivePath, 'summary.md', summary);
    await executeFinalize({ cwd: linked, name: 'finished', bundle: entry.archiveIdentity });
    expect(fs.readFileSync(path.join(linked, 'prospec/specs/_archived-history', `${entry.archiveIdentity}.md`), 'utf8')).toBe(summary);
    expect(image(path.join(main, 'prospec'))).toEqual(mainSpec);
    expect(inventoryTree(siblingDir)).toEqual(siblingBefore);
    await expect(executeFinalize({ cwd: sibling, name: 'finished', bundle: entry.archiveIdentity })).rejects.toThrow(/origin|source/i);
    const savedInventory = inventoryTree(entry.archivePath);
    git(linked, 'add', 'prospec'); git(linked, 'commit', '-qm', 'finalize fixture');
    git(main, 'worktree', 'remove', linked);
    expect(fs.existsSync(linked)).toBe(false);
    expect(inventoryTree(entry.archivePath)).toEqual(savedInventory);
    expect((await executeYield({ cwd: sibling })).total_changes_analyzed).toBe(1);
    expect(resolveHistoryPaths(sibling).archiveRoot).toBe(path.join(main, '.prospec/archive'));
  });

  it('preserves abandoned work, retry links and Premise causal roots after the source worktree is removed', async () => {
    const sourceDir = seed(linked, 'rejected', 'plan');
    const sourceInventory = inventoryTree(sourceDir).filter(entry => entry.path !== 'metadata.yaml');
    write(linked, 'tracked.txt', 'staged\n'); git(linked, 'add', 'tracked.txt'); write(linked, 'tracked.txt', 'unstaged\n');
    const indexBefore = git(linked, 'diff', '--cached', '--binary');
    const workBefore = git(linked, 'diff', '--binary');
    const result = await abandon({ cwd: linked, name: 'rejected', reason: 'Premise disproved' });
    const bundle = path.isAbsolute(result.archiveDir) ? result.archiveDir : path.resolve(linked, result.archiveDir);
    expect(bundle.startsWith(path.join(main, '.prospec/abandoned') + path.sep)).toBe(true);
    expect(inventoryTree(bundle).filter(entry => !['metadata.yaml', '.prospec-transfer.json', 'abandon-operation.json'].includes(entry.path) && !entry.path.startsWith('preservation'))).toEqual(sourceInventory);
    expect(git(linked, 'diff', '--cached', '--binary')).toBe(indexBefore);
    expect(git(linked, 'diff', '--binary')).toBe(workBefore);
    expect(fs.readFileSync(path.join(bundle, 'preservation/staged.patch'), 'utf8')).toContain('+staged');
    expect(fs.readFileSync(path.join(bundle, 'preservation/unstaged.patch'), 'utf8')).toContain('+unstaged');
    const savedInventory = inventoryTree(bundle);
    git(linked, 'restore', '--staged', '--worktree', 'tracked.txt');
    git(main, 'worktree', 'remove', linked);
    expect(inventoryTree(bundle)).toEqual(savedInventory);
    const archived = readAbandonedAttempt(sibling, path.basename(bundle));
    expect(archived.reason).toBe('Premise disproved');
    const retry = await story({ cwd: sibling, name: 'retry', issue: '#366', scale: 'full', proposalBody: premiseProposal({ ...verifiedPremise, source: 'user-observation', retry_difference: 'This attempt preserves full bundles in canonical history before removing the source worktree.' }) });
    expect(retry.priorAttempts).toHaveLength(1);
    const metadata = readChangeMetadata(path.join(retry.changeDir, 'metadata.yaml'), 'retry').metadata;
    expect(metadata.retry_of).toEqual([{archive:path.basename(bundle),digest:archived.digest}]);
    const captured = readPremiseAssessment(retry.changeDir, sibling);
    expect(captured.assessment.state, JSON.stringify(captured.assessment.findings)).toBe('ready');
    expect(() => captured.recheck()).not.toThrow();
    fs.appendFileSync(path.join(bundle, 'metadata.yaml'), '\n# changed linked history\n');
    expect(() => captured.recheck()).toThrow(/changed/i);
    expect((await executeYield({cwd:sibling})).total_changes_analyzed).toBe(0);
  });
  it('refuses same-day collisions and selects the caller origin across dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    seed(linked, 'same');
    const siblingChange = seed(sibling, 'same');
    const siblingBefore = inventoryTree(siblingChange);
    const first = (await archive({ cwd: linked, names: ['same'] })).archived[0]!;
    expect(first).toBeDefined();
    const saved = inventoryTree(first.archivePath);
    const collision = await archive({ cwd: sibling, names: ['same'] });
    expect(collision.skippedReasons.same).toMatch(/already exists/i);
    expect(inventoryTree(first.archivePath)).toEqual(saved);
    expect(inventoryTree(siblingChange)).toEqual(siblingBefore);
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
    const second = (await archive({ cwd: sibling, names: ['same'] })).archived[0]!;
    expect(second.archiveIdentity).not.toBe(first.archiveIdentity);
    write(first.archivePath, 'summary.md', '# First origin\n\n## Review & Verify\nValidated first.\n');
    write(second.archivePath, 'summary.md', '# Second origin\n\n## Review & Verify\nValidated second.\n');
    const secondBefore = inventoryTree(second.archivePath);
    await executeFinalize({ cwd: linked, name: 'same' });
    expect(fs.readFileSync(path.join(linked, 'prospec/specs/_archived-history', `${first.archiveIdentity}.md`), 'utf8')).toContain('First origin');
    expect(inventoryTree(second.archivePath)).toEqual(secondBefore);
    await expect(executeFinalize({ cwd: linked, name: 'same', bundle: second.archiveIdentity, dryRun: true })).rejects.toThrow(/origin|source/i);
  });

  it('refuses a missing main project before archive or abandon mutations', async () => {
    const active = seed(linked, 'unsafe');
    fs.unlinkSync(path.join(main, '.prospec.yaml'));
    const before = inventoryTree(active);
    const result = await archive({ cwd: linked, names: ['unsafe'], dryRun: true });
    expect(result.archived).toEqual([]);
    expect([...result.refused.map(item => item.reason), ...Object.values(result.skippedReasons)].join(' ')).toMatch(/config|main|history/i);
    await expect(abandon({ cwd: linked, name: 'unsafe', reason: 'Cannot publish' })).rejects.toThrow();
    expect(inventoryTree(active)).toEqual(before);
    expect(fs.existsSync(path.join(main, '.prospec'))).toBe(false);
  });

  it('imports legacy history copy-only with unchanged identities and survives removal of the old local copies', async () => {
    const old = seed(linked, 'legacy');
    const localArchive = path.join(linked, '.prospec/archive/2026-10-01-legacy');
    fs.mkdirSync(path.dirname(localArchive), { recursive: true });
    fs.renameSync(old, localArchive);
    const legacyAbandoned = abandonedFixture(linked, '#366');
    const archiveBefore = inventoryTree(localArchive), abandonedBefore = inventoryTree(legacyAbandoned.dir);
    const metadataBytes = fs.readFileSync(path.join(legacyAbandoned.dir, 'metadata.yaml'));
    await expect(executeYield({ cwd: linked })).rejects.toThrow(/import/i);
    const allBefore = image(root);
    const preview = await importHistory({ cwd: sibling, from: linked, dryRun: true });
    expect(preview.entries.map(entry => entry.outcome)).toEqual(['planned', 'planned']);
    expect(image(root)).toEqual(allBefore);
    const imported = await importHistory({ cwd: sibling, from: linked });
    expect(imported.entries.map(entry => entry.outcome)).toEqual(['imported', 'imported']);
    expect(inventoryTree(localArchive)).toEqual(archiveBefore);
    expect(inventoryTree(legacyAbandoned.dir)).toEqual(abandonedBefore);
    const canonicalArchive = path.join(main, '.prospec/archive', path.basename(localArchive));
    const canonicalAbandoned = path.join(main, '.prospec/abandoned', legacyAbandoned.archive);
    expect(inventoryTree(canonicalArchive)).toEqual(archiveBefore);
    expect(inventoryTree(canonicalAbandoned)).toEqual(abandonedBefore);
    expect(fs.readFileSync(path.join(canonicalAbandoned, 'metadata.yaml'))).toEqual(metadataBytes);
    expect((await importHistory({ cwd: sibling, from: linked })).entries.map(entry => entry.outcome)).toEqual(['identical', 'identical']);
    write(localArchive, 'proposal.md', 'conflicting local version');
    expect((await importHistory({ cwd: sibling, from: linked })).entries[0]?.outcome).toBe('conflicting');
    expect(inventoryTree(canonicalArchive)).toEqual(archiveBefore);
    git(main, 'worktree', 'remove', linked);
    expect(readAbandonedAttempt(sibling, legacyAbandoned.archive).reason).toBe('Premise disproved');
    expect(inventoryTree(canonicalAbandoned)).toEqual(abandonedBefore);
    expect((await executeYield({ cwd: sibling })).total_changes_analyzed).toBe(1);
  });

});
