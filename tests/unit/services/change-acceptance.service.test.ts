import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execute as executeAcceptance } from '../../../src/services/change-acceptance.service.js';
import { readChangeMetadata } from '../../../src/lib/change-metadata.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

describe('change-acceptance.service (REQ-SERVICES-114, REQ-TYPES-103)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-acc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleProposal = `# Test Change
## User Stories
### US-1: First story [P1]
As a user...
**Acceptance Scenarios:**
- WHEN action occurs, THEN result is produced.
`;

  function setupChange(
    name: string = 'test-change',
    options: { status?: string; scale?: string } = {},
  ) {
    const changeDir = path.join(tmpDir, '.prospec', 'changes', name);
    fs.mkdirSync(changeDir, { recursive: true });

    fs.writeFileSync(path.join(changeDir, 'proposal.md'), sampleProposal);
    const metaContent = `name: ${name}
created_at: '2026-09-20T00:00:00Z'
status: ${options.status ?? 'story'}
scale: ${options.scale ?? 'standard'}
acceptance:
  version: 1
  revisions: []
`;
    fs.writeFileSync(path.join(changeDir, 'metadata.yaml'), metaContent);
  }

  describe.each(['freeze', 'amend'] as const)('R277-14 %s rejects partially parsed scenario sections', (mode) => {
    it.each([
      ['- WHEN valid, THEN accepted.', '+ WHEN blocked, THEN denied.'],
      ['1. WHEN valid, THEN accepted.', '2) WHEN blocked, THEN denied.'],
      ['- WHEN valid, THEN accepted.', 'WHEN blocked, THEN denied.'],
    ])('refuses unsupported content after %s without mutating metadata', async (valid, unsupported) => {
      setupChange('partial');
      const frozen = mode === 'amend'
        ? await executeAcceptance({ name: 'partial', mode: 'freeze', cwd: tmpDir })
        : undefined;
      const dir = path.join(tmpDir, '.prospec/changes/partial');
      const metadataBefore = fs.readFileSync(path.join(dir, 'metadata.yaml'));
      const proposal = sampleProposal.replace('- WHEN action occurs, THEN result is produced.', `${valid}\n${unsupported}`);
      fs.writeFileSync(path.join(dir, 'proposal.md'), proposal);
      await expect(executeAcceptance({ name: 'partial', mode, cwd: tmpDir, reason: 'update scenarios', expectedDigest: frozen?.digest })).rejects.toThrow(/unsupported acceptance scenario content.*proposal\.md:7/);
      expect(fs.readFileSync(path.join(dir, 'metadata.yaml'))).toEqual(metadataBefore);
      expect(fs.readFileSync(path.join(dir, 'proposal.md'), 'utf8')).toBe(proposal);
    });
  });

  it('freezes scenarios on story status with origin "story" and appends quality_log', async () => {
    setupChange('c-freeze-story', { status: 'story' });
    const result = await executeAcceptance({
      name: 'c-freeze-story',
      mode: 'freeze',
      cwd: tmpDir,
    });

    expect(result.noop).toBe(false);
    expect(result.revision).toBe(1);
    expect(result.origin).toBe('story');
    expect(result.capturedStatus).toBe('story');

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'c-freeze-story', 'metadata.yaml');
    const { metadata } = readChangeMetadata(metaPath, 'c-freeze-story');
    expect(metadata.status).toBe('story');
    expect(metadata.acceptance?.current_revision).toBe(1);
    expect(metadata.acceptance?.revisions).toHaveLength(1);
    expect(metadata.acceptance?.revisions[0]?.origin).toBe('story');

    expect(metadata.quality_log).toBeDefined();
    expect(metadata.quality_log).toHaveLength(1);
    expect(metadata.quality_log![0]!.baseline_revision).toBe(1);
    expect(metadata.quality_log![0]!.skill).toBe('prospec-new-story');
  });

  it.each(['freeze', 'amend'] as const)('R277-9 refuses traversal before %s can read or mutate a sibling directory', async (mode) => {
    setupChange('victim');
    const frozen = await executeAcceptance({ name: 'victim', mode: 'freeze', cwd: tmpDir });
    const outside = path.join(tmpDir, 'outside-changes');
    fs.renameSync(path.join(tmpDir, '.prospec/changes/victim'), outside);
    fs.writeFileSync(path.join(outside, 'proposal.md'), sampleProposal.replace('produced', 'changed'));
    const before = fs.readFileSync(path.join(outside, 'metadata.yaml'));
    await expect(executeAcceptance({ name: '../../outside-changes', mode, cwd: tmpDir, reason: 'update', expectedDigest: frozen.digest })).rejects.toThrow(/not a valid change name/);
    expect(fs.readFileSync(path.join(outside, 'metadata.yaml'))).toEqual(before);
  });

  it('freezes scenarios on implemented status with origin "late-capture"', async () => {
    setupChange('c-freeze-impl', { status: 'implemented' });
    const result = await executeAcceptance({
      name: 'c-freeze-impl',
      mode: 'freeze',
      cwd: tmpDir,
    });

    expect(result.revision).toBe(1);
    expect(result.origin).toBe('late-capture');
    expect(result.capturedStatus).toBe('implemented');

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'c-freeze-impl', 'metadata.yaml');
    const { metadata } = readChangeMetadata(metaPath, 'c-freeze-impl');
    expect(metadata.status).toBe('implemented');
    expect(metadata.acceptance?.revisions[0]?.origin).toBe('late-capture');
  });

  it('returns no-op and does not write when re-freezing identical content', async () => {
    setupChange('c-noop', { status: 'story' });
    await executeAcceptance({ name: 'c-noop', mode: 'freeze', cwd: tmpDir });

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'c-noop', 'metadata.yaml');
    const bytesBefore = fs.readFileSync(metaPath);

    const r2 = await executeAcceptance({ name: 'c-noop', mode: 'freeze', cwd: tmpDir });
    expect(r2.noop).toBe(true);

    const bytesAfter = fs.readFileSync(metaPath);
    expect(bytesBefore.equals(bytesAfter)).toBe(true);
  });

  it('amends scenarios with valid reason and expectedDigest', async () => {
    setupChange('c-amend', { status: 'story' });
    const f1 = await executeAcceptance({ name: 'c-amend', mode: 'freeze', cwd: tmpDir });

    const proposalPath = path.join(tmpDir, '.prospec', 'changes', 'c-amend', 'proposal.md');
    fs.writeFileSync(
      proposalPath,
      sampleProposal.replace('result is produced', 'result is produced and logged'),
    );

    const rAmend = await executeAcceptance({
      name: 'c-amend',
      mode: 'amend',
      reason: 'added logging',
      expectedDigest: f1.digest,
      cwd: tmpDir,
    });

    expect(rAmend.noop).toBe(false);
    expect(rAmend.revision).toBe(2);

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'c-amend', 'metadata.yaml');
    const { metadata } = readChangeMetadata(metaPath, 'c-amend');
    expect(metadata.acceptance?.current_revision).toBe(2);
    expect(metadata.acceptance?.revisions).toHaveLength(2);
    expect(metadata.acceptance?.revisions[1]?.previous_digest).toBe(f1.digest);
    expect(metadata.acceptance?.revisions[1]?.reason).toBe('added logging');

    expect(metadata.quality_log).toHaveLength(2);
    expect(metadata.quality_log![1]!.baseline_revision).toBe(2);
  });

  it('refuses amend with stale expectedDigest without modifying metadata', async () => {
    setupChange('c-stale', { status: 'story' });
    await executeAcceptance({ name: 'c-stale', mode: 'freeze', cwd: tmpDir });

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'c-stale', 'metadata.yaml');
    const bytesBefore = fs.readFileSync(metaPath);

    await expect(
      executeAcceptance({
        name: 'c-stale',
        mode: 'amend',
        reason: 'update',
        expectedDigest: 'wrong-digest',
        cwd: tmpDir,
      }),
    ).rejects.toThrow(PrerequisiteError);

    const bytesAfter = fs.readFileSync(metaPath);
    expect(bytesBefore.equals(bytesAfter)).toBe(true);
  });

  it('refuses freeze and amend on verified or archived status', async () => {
    setupChange('c-verified', { status: 'verified' });

    await expect(
      executeAcceptance({ name: 'c-verified', mode: 'freeze', cwd: tmpDir }),
    ).rejects.toThrow(PrerequisiteError);

    await expect(
      executeAcceptance({
        name: 'c-verified',
        mode: 'amend',
        reason: 'update',
        expectedDigest: 'd',
        cwd: tmpDir,
      }),
    ).rejects.toThrow(PrerequisiteError);
  });
});
