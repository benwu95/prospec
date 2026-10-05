import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assessPremise, readPremiseAssessment } from '../../../src/lib/premise.js';
import { stringifyYaml } from '../../../src/lib/yaml-utils.js';
import { premiseProposal, verifiedPremise } from '../../helpers/premise.js';
import { sha256 } from '../../../src/lib/repo-state.js';
const link = { archive: '2026-10-05-old', digest: 'a'.repeat(64) };
let root: string | undefined;
afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true }); root = undefined; });
describe('retry admission', () => {
  it.each(['quick', 'backfill', 'standard', 'full'])('requires a substantive difference for new %s retry', (scale) => {
    const metadata = { scale, premise_version: 1, retry_of: [link] };
    expect(assessPremise(metadata, premiseProposal()).state).toBe('blocked');
    expect(assessPremise(metadata, premiseProposal({ ...verifiedPremise, retry_difference: 'TODO' })).state).toBe('blocked');
    const result = assessPremise(metadata, premiseProposal({ ...verifiedPremise, retry_difference: 'Use separate patches after the previous staged content loss.' }));
    expect(result.state).toBe(scale === 'quick' || scale === 'backfill' ? 'exempt' : 'ready');
  });
  it('accepts difference-only light Premise while preserving legacy/no-history behavior', () => {
    expect(assessPremise({ scale: 'quick', retry_of: [link] }, '## Premise\n```yaml\nretry_difference: Different evidence and smaller scope\n```').state).toBe('exempt');
    expect(assessPremise({ scale: 'quick', retry_of: [] }, null).state).toBe('exempt');
    expect(assessPremise({}, null).state).toBe('legacy');
    expect(assessPremise({ retry_of: null }, null).state).toBe('blocked');
  });
  it('checks linked record identity and includes it in the pre-write fence', () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-')));
    const dir = path.join(root, '.prospec/changes/new'); const old = path.join(root, '.prospec/abandoned', link.archive);
    fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(old, 'preservation'), { recursive: true });
    const archived = stringifyYaml({ name: 'old', created_at: '2026-10-05', status: 'abandoned', issue: '#333', abandonment: { reason: 'Old evidence failed', at: '2026-10-05', from_status: 'plan', escalation: null, overturned: [], premise_note: '', manifest: 'preservation/manifest.json' } });
    fs.writeFileSync(path.join(old, 'metadata.yaml'), archived);
    fs.writeFileSync(path.join(old, 'preservation/manifest.json'), JSON.stringify({ version: 1, root, git_prefix: '', head: 'a', patches: { staged: sha256(''), unstaged: sha256('') }, entries: [] }));
    fs.writeFileSync(path.join(dir, 'metadata.yaml'), stringifyYaml({ name: 'new', status: 'story', created_at: '2026-10-05', scale: 'quick', issue: '#333', retry_of: [{ ...link, digest: sha256(archived) }] }));
    fs.writeFileSync(path.join(dir, 'proposal.md'), premiseProposal({ ...verifiedPremise, retry_difference: 'The earlier invalid assumption has a new reproduction.' }));
    const captured = readPremiseAssessment(dir, root);
    expect(captured.assessment.state).toBe('exempt'); expect(captured.recheck).not.toThrow();
    fs.appendFileSync(path.join(old, 'metadata.yaml'), '\n# changed');
    expect(captured.recheck).toThrow(/changed/);
    expect(readPremiseAssessment(dir, root).assessment.state).toBe('blocked');
  });
});

it('blocks partial publication of this source, including newly appearing operations before a write', () => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'retry-partial-')));
  const dir = path.join(root, '.prospec/changes/new'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'metadata.yaml'), stringifyYaml({ name: 'new', created_at: '2026-10-05', status: 'story', scale: 'quick' }));
  const captured = readPremiseAssessment(dir, root);
  expect(captured.assessment.state).toBe('exempt');
  const partial = path.join(root, '.prospec/abandoned/2026-10-05-new'); fs.mkdirSync(partial, { recursive: true });
  fs.writeFileSync(path.join(partial, 'abandon-operation.json'), JSON.stringify({ version: 1, source: 'new', source_digest: sha256('original'), phase: 'moving', moved: [], pending: ['metadata.yaml'] }));
  expect(captured.recheck).toThrow();
  expect(readPremiseAssessment(dir, root).assessment).toMatchObject({ state: 'blocked' });
});
