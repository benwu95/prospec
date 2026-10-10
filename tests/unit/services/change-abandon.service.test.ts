import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync) };
});
import os from 'node:os';
import path from 'node:path';
import { prepareAbandon, execute } from '../../../src/services/change-abandon.service.js';
import * as metadataOwner from '../../../src/lib/change-metadata.js';
import { readAbandonHistory } from '../../../src/lib/abandon-history.js';
vi.mock('../../../src/lib/change-metadata.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/change-metadata.js')>();
  return { ...actual, writeChangeMetadataDoc: vi.fn(actual.writeChangeMetadataDoc) };
});
import * as preservation from '../../../src/lib/work-preservation.js';
vi.mock('../../../src/lib/work-preservation.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/work-preservation.js')>();
  return { ...actual, persistWork: vi.fn(actual.persistWork) };
});
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { captureGitState } from '../../../src/lib/repo-state.js';
import { abandonDirFor } from '../../../src/lib/abandon-paths.js';
import { gitIn, imageOf } from '../../helpers/git-fixture.js';
import { premiseProposal } from '../../helpers/premise.js';
vi.setConfig({ testTimeout: 30_000 });
let root: string;
let dir: string;
const put = (name: string, text: string) => { const file = path.join(dir, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const metadata = (extra = {}) => put('metadata.yaml', stringifyYaml({ name: 'x', created_at: '2026-10-05', status: 'plan', issue: '#333', ...extra }));
const opts = () => ({ name: 'x', reason: 'Evidence disproved', cwd: root });
beforeEach(async () => {
  vi.mocked(fs.unlinkSync).mockImplementation((await vi.importActual<typeof fs>('node:fs')).unlinkSync);
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-service-'))); dir = path.join(root, '.prospec/changes/x');
  fs.writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: test\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.prospec/\n'); fs.writeFileSync(path.join(root, 'work'), 'base');
  gitIn(root, 'init', '-q', '-b', 'main'); gitIn(root, 'add', '.'); gitIn(root, 'commit', '-qm', 'base');
  metadata(); put('proposal.md', premiseProposal());
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
it('retains the complete abandoned bundle after normal linked worktree removal', async () => {
  const linked = `${root}-linked`;
  gitIn(root, 'worktree', 'add', '-qb', 'linked', linked);
  try {
    fs.mkdirSync(path.join(linked, '.prospec/changes'), { recursive: true });
    fs.cpSync(dir, path.join(linked, '.prospec/changes/x'), { recursive: true });
    fs.writeFileSync(path.join(linked, 'work'), 'linked edit');
    const result = await execute({ ...opts(), cwd: linked });
    expect(result.archiveDir.startsWith(path.join(root, '.prospec/abandoned'))).toBe(true);
    const before = imageOf(result.archiveDir);
    gitIn(linked, 'restore', 'work');
    gitIn(root, 'worktree', 'remove', linked);
    expect(imageOf(result.archiveDir)).toEqual(before);
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
    expect(fs.readFileSync(path.join(result.preservationDir, 'unstaged.patch'), 'utf8')).toContain('+linked edit');
  } finally { fs.rmSync(linked, { recursive: true, force: true }); }
});
describe('abandon admission', () => {
  it('retains explicit scalar premise values and does not infer omitted fields', async () => {
    const prepared = await prepareAbandon({ ...opts(), overturned: ['problem'] });
    expect(prepared.record.overturned).toEqual([{ field: 'problem', value: 'Source attribution is lost during story authoring.' }]);
    expect(prepared.record.escalation).toBeNull();
    expect((await prepareAbandon(opts())).record.overturned).toEqual([]);
  });
  it.each(['', ' ', '\n'])('refuses blank reason %# without writes', async (reason) => {
    const before = imageOf(dir); await expect(prepareAbandon({ ...opts(), reason })).rejects.toThrow(/reason/i); expect(imageOf(dir)).toEqual(before);
  });
  it.each(['evidence', 'unknown', '__proto__'])('refuses a nonexistent or nonscalar leaf %s', async (field) => {
    await expect(prepareAbandon({ ...opts(), overturned: [field] })).rejects.toThrow(/field|leaf/i);
  });
  it.each(['archived', 'abandoned'])('refuses terminal %s', async (status) => {
    metadata({ status }); await expect(prepareAbandon(opts())).rejects.toThrow(/terminal/i);
  });
  it('refuses unsafe names and reserved source names', async () => {
    await expect(prepareAbandon({ ...opts(), name: '../x' })).rejects.toThrow();
    put('preservation/file', 'original'); await expect(prepareAbandon(opts())).rejects.toThrow(/reserved/i);
  });
  it('publishes separately from a same-named successful archive with relocated trust zone', async () => {
    fs.writeFileSync(path.join(root, '.prospec.yaml'), 'project:\n  name: downstream\npaths:\n  base_dir: docs/spec\n');
    const successful = path.join(root, '.prospec/archive', `${new Date().toISOString().slice(0, 10)}-x`);
    fs.mkdirSync(successful, { recursive: true });
    fs.writeFileSync(path.join(successful, 'metadata.yaml'), 'status: archived\n');
    const before = imageOf(successful);
    const result = await execute(opts());
    expect(result.archiveDir).toBe(path.join(root, '.prospec/abandoned', path.basename(successful)));
    expect(imageOf(successful)).toEqual(before);
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
  });
  it('refuses linked metadata so publication cannot overwrite another file', async () => {
    const file = path.join(dir, 'metadata.yaml'); const outside = path.join(root, 'shared.yaml');
    fs.renameSync(file, outside); fs.symlinkSync(outside, file);
    await expect(prepareAbandon(opts())).rejects.toThrow(/metadata|symlink/i);
    expect(fs.existsSync(abandonDirFor(root, 'x'))).toBe(false);
  });
  it.each(['open', 'refused'])('refuses latest %s delegation without deleting it', async (state) => {
    const pre = { ...captureGitState(root), content: { digest: 'a'.repeat(64) } };
    const ticket = { version: 1, station: 'review', role: 'lens', round: 1, attempt: 1, state, issued_at_ms: 1000, pre_spawn: pre, payload_path: '.prospec/changes/x/.delegated/review-lens-1-1.json', snapshot: { path: '/tmp/s', nonce: 'c'.repeat(32) }, checkpoint: { entries: [], index_sha256: 'a'.repeat(64) } };
    put('.delegated/review-lens-1-1.ticket.json', JSON.stringify(ticket)); const before = imageOf(dir);
    await expect(prepareAbandon(opts())).rejects.toThrow(/delegation|ticket/i); expect(imageOf(dir)).toEqual(before);
  });
});

it('rechecks the metadata and proposal used to derive the abandonment record', async () => {
  const prepared = await prepareAbandon(opts()); metadata({ description: 'changed concurrently' });
  expect(prepared.recheck).toThrow(/changed/);
});
it('retains the last resolved escalation rather than only pending events', async () => {
  metadata({ quality_log: [
    { skill: 'prospec-escalation', date: '2026-10-05', result: 'FAIL', escalation: { kind: 'trigger', event_id: 'old', station: 'prospec-plan', trigger: 'station_retry_limit_exceeded' } },
    { skill: 'prospec-escalation', date: '2026-10-05', result: 'PASS', escalation: { kind: 'resolve', event_id: 'old', station: 'prospec-plan' } },
  ] });
  expect((await prepareAbandon(opts())).record.escalation).toEqual({ trigger: 'station_retry_limit_exceeded', ordinal: 1 });
});

describe('verified preservation publication', () => {
  it('saves work while retaining originals until terminal preparation completes', async () => {
    fs.writeFileSync(path.join(root, 'work'), 'dirty');
    const before = imageOf(dir); const git = captureGitState(root);
    const actual = await vi.importActual<typeof preservation>('../../../src/lib/work-preservation.js');
    vi.mocked(preservation.persistWork).mockImplementationOnce(async (input) => {
      await actual.persistWork(input);
      expect(imageOf(dir)).toEqual(before); expect(captureGitState(root)).toEqual(git);
      expect(fs.readFileSync(path.join(input.destination, 'preservation/unstaged.patch'), 'utf8')).toContain('+dirty');
    });
    await execute(opts());
  });
  it('reports preservation failure with paths and leaves source untouched', async () => {
    const before = imageOf(dir);
    vi.mocked(preservation.persistWork).mockRejectedValueOnce(new Error('disk full'));
    await expect(execute(opts())).rejects.toMatchObject({ code: 'ABANDON_INCOMPLETE',
      details: { sourceDir: dir, transferPhase: 'copying', moved: [], sourceEntries: ['metadata.yaml', 'proposal.md'], stagingDir: expect.any(String), operationPath: expect.any(String) } });
    expect(imageOf(dir)).toEqual(before);
    expect(readAbandonHistory(root).errors.some((error) => error.source === 'x')).toBe(true);
  });
  it('retains concurrent input changes after saving', async () => {
    const actual = await vi.importActual<typeof preservation>('../../../src/lib/work-preservation.js');
    vi.mocked(preservation.persistWork).mockImplementationOnce(async (input) => { await actual.persistWork(input); put('proposal.md', 'concurrent edit'); });
    await expect(execute(opts())).rejects.toMatchObject({ code: 'ABANDON_INCOMPLETE' });
    expect(fs.readFileSync(path.join(dir, 'proposal.md'), 'utf8')).toBe('concurrent edit');
    expect(fs.existsSync(path.join(dir, 'metadata.yaml'))).toBe(true);
  });
  it('reports marker-write failure before deleting any source artifact', async () => {
    const rename = fs.promises.rename.bind(fs.promises); const before = imageOf(dir);
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (from, to) => {
      if (String(to).endsWith('abandon-operation.json')) throw new Error('marker denied');
      return rename(from, to);
    });
    await expect(execute(opts())).rejects.toMatchObject({ details: { phase: 'preserving', moved: [], sourceEntries: ['metadata.yaml', 'proposal.md'], archiveEntries: null } });
    expect(imageOf(dir)).toEqual(before);
  });
  it('publishes original artifacts without touching work or trust zone', async () => {
    put('notes.bin', Buffer.from([0, 255]).toString('binary'));
    fs.mkdirSync(path.join(root, 'prospec')); fs.writeFileSync(path.join(root, 'prospec/spec.md'), 'trusted');
    const trust = imageOf(path.join(root, 'prospec')); const git = captureGitState(root);
    const proposal = fs.readFileSync(path.join(dir, 'proposal.md'));
    const result = await execute(opts());
    expect(fs.existsSync(dir)).toBe(false); expect(imageOf(path.join(root, 'prospec'))).toEqual(trust);
    expect(captureGitState(root)).toEqual(git); expect(fs.readFileSync(path.join(root, 'work'), 'utf8')).toBe('base');
    expect(fs.readFileSync(path.join(result.archiveDir, 'proposal.md'))).toEqual(proposal);
    expect(metadataOwner.readChangeMetadata(path.join(result.archiveDir, 'metadata.yaml'), 'x').metadata).toMatchObject({ status: 'abandoned', abandonment: { reason: 'Evidence disproved', from_status: 'plan' } });
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
  });
  it('retains the complete source if terminal metadata preparation fails', async () => {
    const before = imageOf(dir);
    vi.mocked(metadataOwner.writeChangeMetadataDoc).mockRejectedValueOnce(new Error('metadata disk full'));
    await expect(execute(opts())).rejects.toMatchObject({ details: { phase: 'publishing', transferPhase: 'copying', moved: [], sourceEntries: ['metadata.yaml', 'proposal.md'] } });
    expect(imageOf(dir)).toEqual(before); expect(readAbandonHistory(root).attempts).toEqual([]);
  });
  it('leaves a readable final copy and pending source when cleanup fails', async () => {
    const actual = (await vi.importActual<typeof fs>('node:fs')).unlinkSync;
    vi.spyOn(fs, 'unlinkSync').mockImplementation((file) => {
      if (String(file) === path.join(dir, 'proposal.md')) throw new Error('unlink denied');
      actual(file);
    });
    await expect(execute(opts())).rejects.toMatchObject({ code: 'ABANDON_INCOMPLETE', details: { transferPhase: 'published', sourceEntries: expect.any(Array) } });
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
    expect(readAbandonHistory(root).errors.some((error) => error.source === 'x')).toBe(true);
  });
});

it('refuses retrying a failed preparation across UTC days without another suffix', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-10-04T23:59:00.000Z'));
    vi.mocked(metadataOwner.writeChangeMetadataDoc).mockRejectedValueOnce(new Error('metadata denied'));
    await expect(execute(opts())).rejects.toMatchObject({ code: 'ABANDON_INCOMPLETE' });
    const sourceBefore = imageOf(dir); const historyBefore = imageOf(path.join(root, '.prospec/history-operations'));
    vi.setSystemTime(new Date('2026-10-05T00:01:00.000Z'));
    await expect(execute(opts())).rejects.toThrow(/pending|incomplete|inspect/i);
    expect(imageOf(dir)).toEqual(sourceBefore);
    expect(imageOf(path.join(root, '.prospec/history-operations'))).toEqual(historyBefore);
  } finally { vi.useRealTimers(); }
});

// #352: a repository with a clean submodule abandons, recording its pins beside the manifest.
it('abandons in a repository with a clean submodule and records its pins', async () => {
  const upstream = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'abandon-sub-')));
  try {
    gitIn(upstream, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(upstream, 'shared.md'), 'v1');
    gitIn(upstream, 'add', '.'); gitIn(upstream, 'commit', '-qm', 'v1');
    gitIn(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', upstream, 'module');
    gitIn(root, 'commit', '-qm', 'add submodule');
    const pinned = gitIn(root, 'rev-parse', 'HEAD:module');
    metadata({ status: 'implemented' });
    const result = await execute(opts());
    const { GitlinkPinsSchema } = await import('../../../src/types/abandon.js');
    const pins = GitlinkPinsSchema.parse(JSON.parse(fs.readFileSync(path.join(result.archiveDir, 'preservation/gitlinks.json'), 'utf8')));
    expect(result.preservedFileCount).toBe(0);
    expect(pins.gitlinks).toEqual([{ path: 'module', head_commit: pinned, index_commit: pinned, checkout_commit: pinned }]);
    expect(readAbandonHistory(root).attempts).toHaveLength(1);
  } finally { fs.rmSync(upstream, { recursive: true, force: true }); }
});

it('writes no pin record when the repository holds no gitlink', async () => {
  const result = await execute(opts());
  expect(result.preservedFileCount).toBe(0);
  expect(fs.existsSync(path.join(result.archiveDir, 'preservation/gitlinks.json'))).toBe(false);
});


it('retains three same-day attempts without changing earlier history', async () => {
  const base = abandonDirFor(root, 'x');
  const snapshots = new Map<string, ReturnType<typeof imageOf>>();
  for (let attempt = 1; attempt <= 3; attempt++) {
    metadata(); put('proposal.md', premiseProposal());
    fs.writeFileSync(path.join(root, 'work'), `attempt ${attempt}`);
    const result = await execute(opts());
    expect(result.archiveDir).toBe(attempt === 1 ? base : `${base}-${attempt}`);
    const manifest = JSON.parse(fs.readFileSync(path.join(result.preservationDir, 'manifest.json'), 'utf8'));
    expect(result.preservedFileCount).toBe(manifest.entries.length);
    expect(result.preservedFileCount).toBe(1);
    for (const [destination, before] of snapshots) expect(imageOf(destination)).toEqual(before);
    snapshots.set(result.archiveDir, imageOf(result.archiveDir));
    expect(readAbandonHistory(root).attempts).toHaveLength(attempt);
  }
});

it('refuses a competing destination after admission without allocating another suffix', async () => {
  const destination = abandonDirFor(root, 'x'); const sourceBefore = imageOf(dir);
  const actual = await vi.importActual<typeof preservation>('../../../src/lib/work-preservation.js');
  vi.mocked(preservation.persistWork).mockImplementationOnce(async (input) => {
    await actual.persistWork(input);
    fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, 'competitor'), 'retained');
  });
  await expect(execute(opts())).rejects.toMatchObject({ code: 'ABANDON_INCOMPLETE' });
  expect(imageOf(dir)).toEqual(sourceBefore);
  expect(fs.readFileSync(path.join(destination, 'competitor'), 'utf8')).toBe('retained');
  expect(fs.existsSync(`${destination}-2`)).toBe(false);
});

it('counts deletions, symlinks and nonignored source artifacts from the captured manifest', async () => {
  fs.writeFileSync(path.join(root, '.gitignore'), '');
  fs.unlinkSync(path.join(root, 'work'));
  fs.symlinkSync('work', path.join(root, 'link'));
  const result = await execute(opts());
  const manifest = JSON.parse(fs.readFileSync(path.join(result.preservationDir, 'manifest.json'), 'utf8'));
  expect(manifest.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'work', kind: 'deleted' }),
    expect.objectContaining({ path: 'link', kind: 'symlink' }),
    expect.objectContaining({ path: '.prospec/changes/x/metadata.yaml', kind: 'regular' }),
    expect.objectContaining({ path: '.prospec/changes/x/proposal.md', kind: 'regular' }),
  ]));
  expect(result.preservedFileCount).toBe(manifest.entries.length);
  expect(result.preservedFileCount).toBe(5);
  expect(fs.existsSync(dir)).toBe(false);
});
