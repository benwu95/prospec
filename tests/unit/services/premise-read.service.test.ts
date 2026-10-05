import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';
import * as fs from 'node:fs';
import { execute as validate } from '../../../src/services/validate.service.js';
import { execute as status } from '../../../src/services/status.service.js';
import { premiseProposal } from '../../helpers/premise.js';
vi.mock('node:fs', async () => { const { fs } = await import('memfs'); return { ...fs, default: fs }; });
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  const { withoutSpawns } = await import('../../helpers/no-child-process.js');
  return withoutSpawns(actual);
});
const cwd = '/project';
const dir = `${cwd}/.prospec/changes/example`;
beforeEach(() => {
  vol.reset();
  vol.fromJSON({
    [`${cwd}/.prospec.yaml`]: 'project:\n  name: test\nagents: [codex]\n',
    [`${dir}/metadata.yaml`]: 'name: example\ncreated_at: today\nstatus: story\npremise_version: 1\n',
    [`${dir}/proposal.md`]: '# Missing premise',
  });
});
describe('shared read-only premise assessment', () => {
  it('reports the same blocked facts and preserves all bytes', async () => {
    const before = vol.toJSON();
    const verdict = await validate({ cwd, kind: 'proposal', target: 'example' });
    const report = await status({ cwd });
    expect(verdict.ok).toBe(false);
    expect(report.changes[0]).toMatchObject({ next: 'explore', nextSkill: 'prospec-explore', code: 'PREMISE_INCOMPLETE' });
    expect(verdict.facts).toEqual(report.changes[0]?.premise);
    expect(vol.toJSON()).toEqual(before);
  });
  it('accepts ready and explicitly discloses legacy', async () => {
    fs.writeFileSync(`${dir}/proposal.md`, premiseProposal());
    expect((await validate({ cwd, kind: 'proposal', change: 'example' })).ok).toBe(true);
    expect((await status({ cwd })).changes[0]?.next).toBe('plan');
    fs.writeFileSync(`${dir}/metadata.yaml`, 'name: example\ncreated_at: today\nstatus: story\n');
    const legacy = await validate({ cwd, kind: 'proposal', target: 'example' });
    expect(legacy).toMatchObject({ ok: true, facts: { state: 'legacy' } });
    expect(legacy.findings.map((f) => f.message).join(' ')).toContain('legacy');
    expect((await status({ cwd })).changes[0]?.premise?.state).toBe('legacy');
  });
  it('refuses an arbitrary proposal path and reports malformed versions', async () => {
    await expect(validate({ cwd, kind: 'proposal', target: '../example' })).rejects.toThrow();
    fs.appendFileSync(`${dir}/metadata.yaml`, 'premise_version: 2\n');
    expect((await validate({ cwd, kind: 'proposal', target: 'example' })).ok).toBe(false);
  });
});
