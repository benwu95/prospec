import { beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { vol } from 'memfs';
import { execute as status } from '../../../src/services/status.service.js';
import { execute as transition } from '../../../src/services/change-status.service.js';
import { execute as plan } from '../../../src/services/change-plan.service.js';
import { execute as tasks } from '../../../src/services/change-tasks.service.js';
import { execute as scale } from '../../../src/services/change-scale.service.js';
import { execute as story } from '../../../src/services/change-story.service.js';
import { execute as verify } from '../../../src/services/verify-record.service.js';
import { execute as archive, executeFinalize } from '../../../src/services/archive.service.js';
import { scanArchivedReviews } from '../../../src/services/learn.service.js';
import { abandonedFixture } from '../../helpers/abandon.js';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { premiseProposal } from '../../helpers/premise.js';
vi.mock('node:fs', async () => { const { fs } = await import('memfs'); return { ...fs, default: fs }; });
vi.mock('../../../src/lib/template.js', () => ({ renderTemplate: () => '# Scaffold\n' }));
beforeEach(() => { vol.reset(); vol.fromJSON({ '/p/.prospec.yaml': 'project:\n  name: test\nworkflow:\n  pause_at: []\n' }); });
const partial = (source: string, dir: string) => fs.writeFileSync(`${dir}/abandon-operation.json`, JSON.stringify({ version: 1, source, source_digest: 'a'.repeat(64), phase: 'moving', moved: [], pending: ['metadata.yaml'] }));
it('reports archive-only history as clean without an active route', async () => {
  abandonedFixture('/p'); const result = await status({ cwd: '/p' });
  expect(result).toMatchObject({ clean: true, changes: [], errors: [], abandoned: [{ name: 'old', reason: 'Premise disproved' }] });
});
it('blocks a partially moved active source and exposes the archive error', async () => {
  const { dir } = abandonedFixture('/p'); fs.unlinkSync(`${dir}/metadata.yaml`); partial('old', dir);
  vol.fromJSON({ '/p/.prospec/changes/old/metadata.yaml': stringifyYaml({ name: 'old', status: 'plan', created_at: '2026-10-05' }) });
  const result = await status({ cwd: '/p' });
  expect(result.clean).toBe(false); expect(result.changes).toEqual([]);
  expect(result.errors.some((e) => /Incomplete abandonment/.test(e.error))).toBe(true);
  await expect(tasks({ change: 'old', cwd: '/p', quiet: true })).rejects.toThrow(/abandon/i);
});
it('reports misplaced abandoned metadata and refuses generic minting and revival', async () => {
  const { dir } = abandonedFixture('/p');
  vol.fromJSON({ '/p/.prospec/changes/old/metadata.yaml': fs.readFileSync(`${dir}/metadata.yaml`, 'utf8') });
  const before = vol.toJSON();
  expect(await status({ cwd: '/p' })).toMatchObject({ clean: false, changes: [],
    errors: [{ name: 'old', error: expect.stringMatching(/abandoned.*active|incomplete.location/i) }] });
  await expect(transition({ change: 'old', cwd: '/p', to: 'abandoned' })).rejects.toMatchObject({ suggestion: expect.stringContaining('change abandon') });
  await expect(transition({ change: 'old', cwd: '/p', to: 'story' })).rejects.toThrow();
  expect(vol.toJSON()).toEqual(before);
});
it.each(['full', 'quick', 'backfill'] as const)('blocks retry forward writers at %s scale until difference is authored', async (selectedScale) => {
  abandonedFixture('/p'); await story({ name: 'retry', issue: '#333', scale: selectedScale, cwd: '/p', proposalBody: premiseProposal() });
  const before = vol.toJSON();
  await expect(plan({ change: 'retry', cwd: '/p', quiet: true })).rejects.toThrow(/retry_difference/);
  await expect(tasks({ change: 'retry', cwd: '/p', quiet: true })).rejects.toThrow(/retry_difference/);
  await expect(transition({ change: 'retry', cwd: '/p', to: 'plan' })).rejects.toThrow(/retry_difference/);
  await expect(verify({ change: 'retry', cwd: '/p', warnings: [] })).rejects.toThrow(/retry_difference/);
  expect((await archive({ names: ['retry'], status: 'story', cwd: '/p', allowIncomplete: true })).refused[0]?.reason).toMatch(/retry_difference/);
  expect(vol.toJSON()).toEqual(before);
  expect((await status({ cwd: '/p' })).changes[0]).toMatchObject({ next: 'explore' });
});
it.each(['abandoned', 'partial'])('excludes %s from finalize and both review corpus modes', async (kind) => {
  const { dir } = abandonedFixture('/p');
  fs.writeFileSync(`${dir}/review.md`, '# Review\n'); fs.writeFileSync(`${dir}/summary.md`, '## Review & Verify\n');
  if (kind === 'partial') { fs.unlinkSync(`${dir}/metadata.yaml`); partial('old', dir); }
  const successfulRoot = '/p/.prospec/archive';
  fs.mkdirSync(successfulRoot, { recursive: true });
  vol.fromJSON(Object.fromEntries(Object.entries(vol.toJSON()).filter(([file]) => file.startsWith(`${dir}/`))
    .map(([file, value]) => [file.replace(dir, `${successfulRoot}/2026-10-05-old`), value])));
  const before = vol.toJSON();
  await expect(executeFinalize({ name: 'old', cwd: '/p' })).rejects.toThrow(/abandon|incomplete/i);
  expect(await scanArchivedReviews('/p/.prospec/archive', [], '/p')).toEqual([]);
  expect(await scanArchivedReviews('/absent', ['/p/.prospec/abandoned'], '/p')).toEqual([]);
  expect(vol.toJSON()).toEqual(before);
});
it('retains legacy corpus entries without modern metadata', async () => {
  vol.fromJSON({ '/external/2026-01-01-legacy/review.md': '# Review\n' });
  expect(await scanArchivedReviews('/absent', ['/external'], '/p')).toMatchObject([{ changeName: 'legacy' }]);
});
it('cannot turn an abandoned active copy into a successful archive using an explicit status', async () => {
  const { dir } = abandonedFixture('/p');
  vol.fromJSON({ '/p/.prospec/changes/old/metadata.yaml': fs.readFileSync(`${dir}/metadata.yaml`, 'utf8') });
  const result = await archive({ names: ['old'], status: 'abandoned', cwd: '/p', allowIncomplete: true });
  expect(result.archived).toEqual([]); expect(result.refused[0]?.reason).toMatch(/terminal|abandon/i);
});
it('scale changes past story use the same retry admission', async () => {
  abandonedFixture('/p'); await story({ name: 'retry', issue: '#333', cwd: '/p', proposalBody: premiseProposal() });
  const file = '/p/.prospec/changes/retry/metadata.yaml'; fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('status: story', 'status: plan'));
  await expect(scale({ change: 'retry', scale: 'quick', cwd: '/p' })).rejects.toThrow(/retry_difference/);
});
