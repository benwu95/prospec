import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vol } from 'memfs';
import * as fs from 'node:fs';
import { readPremiseAssessment, requirePremise } from '../../../src/lib/premise.js';
import { premiseProposal } from '../../helpers/premise.js';
vi.mock('node:fs', async () => {
  const { fs } = await import('memfs');
  return { ...fs, default: fs };
});
const dir = '/project/.prospec/changes/change';
beforeEach(() => {
  vol.reset();
  vol.fromJSON({ [`${dir}/metadata.yaml`]: 'name: change\ncreated_at: today\nstatus: story\npremise_version: 1\n', [`${dir}/proposal.md`]: premiseProposal() });
});
describe('captured premise admission', () => {
  it('reads ready inputs and rechecks the same bytes', () => {
    const capture = requirePremise(dir, '/project');
    expect(capture.assessment.state).toBe('ready');
    expect(() => capture.recheck()).not.toThrow();
    fs.writeFileSync(`${dir}/proposal.md`, 'changed');
    expect(() => capture.recheck()).toThrow(/changed/i);
  });
  it('detects metadata changes', () => {
    const capture = requirePremise(dir, '/project');
    fs.appendFileSync(`${dir}/metadata.yaml`, 'scale: quick\n');
    expect(() => capture.recheck()).toThrow(/changed/i);
  });
  it('refuses pending, missing metadata and unknown versions', () => {
    fs.writeFileSync(`${dir}/proposal.md`, '# Missing');
    expect(() => requirePremise(dir, '/project')).toThrow(/Premise/);
    fs.unlinkSync(`${dir}/metadata.yaml`);
    expect(readPremiseAssessment(dir, '/project').assessment.state).toBe('blocked');
    fs.writeFileSync(`${dir}/metadata.yaml`, 'name: change\ncreated_at: today\nstatus: story\npremise_version: 2\n');
    expect(readPremiseAssessment(dir, '/project').assessment.state).toBe('blocked');
  });
  it('discloses legacy and evaluates the target scale', () => {
    fs.writeFileSync(`${dir}/metadata.yaml`, 'name: change\ncreated_at: today\nstatus: tasks\nscale: quick\npremise_version: 1\n');
    fs.writeFileSync(`${dir}/proposal.md`, '# Missing');
    expect(requirePremise(dir, '/project').assessment.state).toBe('exempt');
    expect(() => requirePremise(dir, '/project', 'standard')).toThrow();
    fs.writeFileSync(`${dir}/metadata.yaml`, 'name: change\ncreated_at: today\nstatus: tasks\n');
    expect(requirePremise(dir, '/project').assessment.state).toBe('legacy');
  });
  it('refuses unreadable input and escaping symlinks', () => {
    fs.unlinkSync(`${dir}/proposal.md`);
    fs.mkdirSync(`${dir}/proposal.md`);
    expect(readPremiseAssessment(dir, '/project').assessment).toMatchObject({ state: 'blocked', findings: [expect.stringContaining('proposal.md')] });
    fs.rmdirSync(`${dir}/proposal.md`);
    fs.writeFileSync('/outside.md', premiseProposal());
    fs.symlinkSync('/outside.md', `${dir}/proposal.md`);
    expect(() => requirePremise(dir, '/project')).toThrow(/escaped/);
  });
});
