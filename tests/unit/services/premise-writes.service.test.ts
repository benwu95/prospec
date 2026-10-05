import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';
import * as fs from 'node:fs';
import { execute as plan } from '../../../src/services/change-plan.service.js';
import { execute as tasks } from '../../../src/services/change-tasks.service.js';
import { execute as status } from '../../../src/services/change-status.service.js';
import { execute as scale } from '../../../src/services/change-scale.service.js';
import { execute as verify } from '../../../src/services/verify-record.service.js';
import { execute as archive } from '../../../src/services/archive.service.js';
import { renderTemplate } from '../../../src/lib/template.js';
import { premiseProposal } from '../../helpers/premise.js';
vi.mock('node:fs', async () => { const { fs } = await import('memfs'); return { ...fs, default: fs }; });
vi.mock('../../../src/lib/template.js', () => ({ renderTemplate: vi.fn(() => '# Generated') }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  const { withoutSpawns } = await import('../../helpers/no-child-process.js');
  return withoutSpawns(actual);
});
const cwd = '/project';
const dir = `${cwd}/.prospec/changes/example`;
const base = { cwd, change: 'example', warnings: [] };
function metadata(status = 'story', scale = 'standard', version = 1) {
  fs.writeFileSync(`${dir}/metadata.yaml`, `name: example\ncreated_at: today\nstatus: ${status}\nscale: ${scale}\npremise_version: ${version}\n`);
}
beforeEach(() => {
  vi.mocked(renderTemplate).mockReset().mockReturnValue('# Generated');
  vol.reset();
  vol.fromJSON({ [`${cwd}/.prospec.yaml`]: 'project:\n  name: test\n', [`${dir}/proposal.md`]: '# Missing premise' });
  metadata();
});
describe('premise lifecycle write admission', () => {
  it.each([
    ['plan', () => plan(base)], ['tasks', () => tasks(base)],
    ['status', () => status({ ...base, to: 'plan' })],
    ['verify', () => verify(base)],
  ] as const)('refuses %s before any write', async (_name, execute) => {
    fs.writeFileSync(`${dir}/plan.md`, '# Existing plan');
    const before = vol.toJSON();
    await expect(execute()).rejects.toThrow(/Premise/);
    expect(vol.toJSON()).toEqual(before);
  });
  it.each([false, true])('refuses archive including dryRun=%s before writes', async (dryRun) => {
    metadata('verified');
    const before = vol.toJSON();
    const result = await archive({ cwd, names: ['example'], dryRun });
    expect(result.refused).toEqual([expect.objectContaining({ reason: expect.stringContaining('Premise') })]);
    expect(vol.toJSON()).toEqual(before);
  });
  it('allows equal status and scale no-ops even while pending', async () => {
    const before = vol.toJSON();
    expect((await status({ ...base, to: 'story' })).changed).toBe(false);
    expect((await scale({ ...base, scale: 'standard' })).changed).toBe(false);
    expect(vol.toJSON()).toEqual(before);
  });
  it('gates target scale after story, while allowing story to author its premise', async () => {
    metadata('tasks', 'quick');
    const before = vol.toJSON();
    await expect(scale({ ...base, scale: 'full' })).rejects.toThrow(/Premise/);
    expect(vol.toJSON()).toEqual(before);
    metadata('story', 'quick');
    expect((await scale({ ...base, scale: 'full' })).changed).toBe(true);
  });
  it('allows complete premise to advance through plan/tasks/status', async () => {
    fs.writeFileSync(`${dir}/proposal.md`, premiseProposal());
    expect((await plan(base)).createdFiles).toHaveLength(2);
    expect((await tasks(base)).createdFiles).toHaveLength(1);
    expect((await status({ ...base, to: 'tasks' })).changed).toBe(false);
  });
  it('keeps legacy and quick paths admitted', async () => {
    metadata('story', 'quick');
    expect((await tasks(base)).createdFiles).toHaveLength(1);
    fs.unlinkSync(`${dir}/tasks.md`);
    fs.writeFileSync(`${dir}/metadata.yaml`, 'name: example\ncreated_at: today\nstatus: story\n');
    expect((await plan(base)).createdFiles).toHaveLength(2);
  });
});

describe('premise write fence', () => {
  it.each([['plan', plan], ['tasks', tasks]] as const)('rechecks %s after rendering and before the first write', async (name, execute) => {
    fs.writeFileSync(`${dir}/proposal.md`, premiseProposal());
    if (name === 'tasks') fs.writeFileSync(`${dir}/plan.md`, '# Existing');
    const metadataBefore = fs.readFileSync(`${dir}/metadata.yaml`, 'utf8');
    vi.mocked(renderTemplate).mockImplementationOnce(() => {
      fs.writeFileSync(`${dir}/proposal.md`, '# Concurrent edit');
      return '# Rendered';
    });
    await expect(execute(base)).rejects.toThrow(/Premise inputs changed/);
    expect(fs.readFileSync(`${dir}/metadata.yaml`, 'utf8')).toBe(metadataBefore);
    expect(fs.existsSync(`${dir}/${name}.md`)).toBe(false);
    expect(fs.readFileSync(`${dir}/proposal.md`, 'utf8')).toBe('# Concurrent edit');
  });
  it.each([['plan', plan], ['tasks', tasks], ['verify', verify]] as const)('refuses unknown version at %s without writes', async (_name, execute) => {
    metadata('story', 'standard', 2);
    const before = vol.toJSON();
    await expect(execute(base)).rejects.toThrow(/Premise/);
    expect(vol.toJSON()).toEqual(before);
  });
});
