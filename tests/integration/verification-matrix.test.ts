import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { execute as check } from '../../src/services/check.service.js';
import { execute as verifyRecord } from '../../src/services/verify-record.service.js';
import { execute as verifyContext } from '../../src/services/verify-context.service.js';
import { execute as changeAcceptance } from '../../src/services/change-acceptance.service.js';
import { execute as changeStatus } from '../../src/services/change-status.service.js';
import { computeAcceptanceDigest } from '../../src/lib/acceptance-baseline.js';
import * as driftAssessment from '../../src/lib/drift-assessment.js';
import { PrerequisiteError } from '../../src/types/errors.js';

vi.setConfig({ testTimeout: 60_000 });

describe('Verification Matrix: Real-Git Refusals and Grade Chaining (REQ-TESTS-123, REQ-SERVICES-115)', () => {
  let root: string;
  const changeName = 'vm-change';

  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });

  function write(relPath: string, content: string) {
    const fullPath = path.join(root, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  function read(relPath: string): string {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
  }

  function fileExists(relPath: string): boolean {
    return fs.existsSync(path.join(root, relPath));
  }

  function snapshotBytes() {
    const metaPath = path.join(root, '.prospec', 'changes', changeName, 'metadata.yaml');
    const verifyPath = path.join(root, '.prospec', 'changes', changeName, 'verify.md');
    return {
      metadata: fs.existsSync(metaPath) ? fs.readFileSync(metaPath) : null,
      verify: fs.existsSync(verifyPath) ? fs.readFileSync(verifyPath) : null,
    };
  }

  function assertZeroWriteAndNoRollback(
    before: { metadata: Buffer | null; verify: Buffer | null },
    mutatedRelPath: string,
    expectedContent: string,
  ) {
    const after = snapshotBytes();
    // Zero-write assertion on metadata and verify
    if (mutatedRelPath.endsWith('metadata.yaml')) {
      expect(after.metadata).not.toBeNull();
      expect(after.metadata!.toString('utf8')).toBe(expectedContent);
    } else if (before.metadata === null) {
      expect(after.metadata).toBeNull();
    } else {
      expect(after.metadata).not.toBeNull();
      expect(Buffer.compare(after.metadata!, before.metadata)).toBe(0);
    }

    if (before.verify === null) {
      expect(after.verify).toBeNull();
    } else {
      expect(after.verify).not.toBeNull();
      expect(Buffer.compare(after.verify!, before.verify)).toBe(0);
    }

    // No-rollback assertion on external mutation
    expect(read(mutatedRelPath)).toBe(expectedContent);
  }

  const sampleProposal = `# Proposal: VM Change
## User Stories
### US-1: Core Feature
**Acceptance Scenarios:**
- WHEN action triggered, THEN result expected.
`;

  const sampleDelta = `# Delta Spec: VM Change
## ADDED
### REQ-VM-001: First Capability
**Feature:** vm
**Story:** US-1
**Description:** First VM capability description
**Spec:**
Spec text for VM capability.
`;

  const sampleTasks = `- [x] T1 Implement VM capability
`;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-vmatrix-'));
    git('init', '-q');
    git('config', 'user.name', 'test');
    git('config', 'user.email', 'test@example.com');

    write('.prospec.yaml', `version: "1.0"\nproject:\n  name: vm-project\ntech_stack:\n  language: typescript\n  package_manager: pnpm\n  test_command: node -e "process.exit(0)"\n`);
    write('prospec/CONSTITUTION.md', '# Constitution\n\n## Principles\n\n### [MUST] Tests Pass\n**Description**: Always keep tests green.\n');

    write(`.prospec/changes/${changeName}/proposal.md`, sampleProposal);
    write(`.prospec/changes/${changeName}/delta-spec.md`, sampleDelta);
    write(`.prospec/changes/${changeName}/tasks.md`, sampleTasks);
    write('src/index.ts', 'export const init = 1;\n');

    const scenarios = [
      { id: 'US-1.1', story_id: 'US-1', text: 'WHEN action triggered, THEN result expected.', source: 'proposal.md:5' },
    ];
    const digest = computeAcceptanceDigest(scenarios);

    const initialMetadata = `name: ${changeName}
created_at: '2026-09-20T00:00:00.000Z'
status: implemented
scale: standard
acceptance:
  version: 1
  current_revision: 1
  revisions:
    - revision: 1
      digest: ${digest}
      captured_at: '2026-09-20T00:00:00.000Z'
      captured_status: story
      origin: story
      reason: initial freeze
      scenarios:
        - id: US-1.1
          story_id: US-1
          text: 'WHEN action triggered, THEN result expected.'
          source: proposal.md:5
`;
    write(`.prospec/changes/${changeName}/metadata.yaml`, initialMetadata);

    git('add', '.');
    git('commit', '-qm', 'initial fixture setup');

    await check({ cwd: root, change: changeName, recordReview: true });
    await check({ cwd: root, change: changeName, recordTests: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('6-way input mutation refusal and zero-write at grader → record point', () => {
    async function setupGradedSubmission() {
      const prep = await verifyContext({ cwd: root, change: changeName, quiet: true });
      const dimsPath = path.join(os.tmpdir(), `dims-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      const dims = [
        {
          name: 'delta-spec-compliance',
          result: 'PASS',
          graded_by: 'fresh-subagent',
          context_id: prep.contextId,
          items: [
            {
              req_id: 'REQ-VM-001',
              result: 'PASS',
              evidence_kind: 'document',
              evidence: 'specification satisfied with tests',
            },
          ],
        },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ];
      fs.writeFileSync(dimsPath, JSON.stringify(dims, null, 2));
      return { dimsPath, contextId: prep.contextId };
    }

    it('refuses on baseline mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 1: Baseline in metadata.yaml (valid metadata, but changed baseline revision digest)
      const metaRel = `.prospec/changes/${changeName}/metadata.yaml`;
      const originalMeta = read(metaRel);
      const newScenarios = [
        { id: 'US-1.1', story_id: 'US-1', text: 'WHEN action triggered, THEN mutated output.', source: 'proposal.md:5' },
      ];
      const newDigest = computeAcceptanceDigest(newScenarios);
      const mutatedMeta = originalMeta
        .replace(/'WHEN action triggered, THEN result expected\.'/, "'WHEN action triggered, THEN mutated output.'")
        .replace(/(revisions:\n\s+- revision: 1\n\s+digest: )[a-f0-9]+/, `$1${newDigest}`);
      write(metaRel, mutatedMeta);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, metaRel, mutatedMeta);
    });

    it('refuses on spec mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 2: delta-spec.md
      const specRel = `.prospec/changes/${changeName}/delta-spec.md`;
      const mutatedSpec = read(specRel) + '\n### REQ-VM-002: Second\n**Feature:** vm\n**Story:** US-1\n**Description:** Second\n**Spec:** text\n';
      write(specRel, mutatedSpec);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, specRel, mutatedSpec);
    });

    it('refuses on proposal mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 3: proposal.md
      const propRel = `.prospec/changes/${changeName}/proposal.md`;
      const mutatedProp = read(propRel) + '\n### US-2: Added Story\n**Acceptance Scenarios:**\n- WHEN new, THEN new.\n';
      write(propRel, mutatedProp);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, propRel, mutatedProp);
    });

    it('refuses on saved context mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 4: verify-context.json
      const contextRel = `.prospec/changes/${changeName}/verify-context.json`;
      const originalContext = JSON.parse(read(contextRel));
      originalContext.context_id = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const mutatedContent = JSON.stringify(originalContext, null, 2) + '\n';
      write(contextRel, mutatedContent);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, contextRel, mutatedContent);
    });

    it('refuses on test_attempt mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 5: test_attempt in metadata.yaml (mutate attempt id so test_attempt facts differ)
      const metaRel = `.prospec/changes/${changeName}/metadata.yaml`;
      const originalMeta = read(metaRel);
      const mutatedMeta = originalMeta.replace(/(test_attempt:\n\s+id: )[^\n]+/, '$1attempt-changed-after-grading');
      write(metaRel, mutatedMeta);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, metaRel, mutatedMeta);
    });

    it('refuses on code mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupGradedSubmission();

      // Mutate 6: code in src/index.ts
      const codeRel = 'src/index.ts';
      const mutatedCode = 'export const init = 2;\nexport const extra = true;\n';
      write(codeRel, mutatedCode);

      const before = snapshotBytes();
      await expect(
        verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
      ).rejects.toThrow(PrerequisiteError);

      assertZeroWriteAndNoRollback(before, codeRel, mutatedCode);
    });
  });

  describe('Record prewrite stability refusal and zero-write', () => {
    async function setupPrewriteSubmission() {
      const prep = await verifyContext({ cwd: root, change: changeName, quiet: true });
      const dimsPath = path.join(os.tmpdir(), `dims-prewrite-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: prep.contextId,
            items: [{ req_id: 'REQ-VM-001', result: 'PASS', evidence_kind: 'document', evidence: 'ok' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );
      return { dimsPath, contextId: prep.contextId };
    }

    it('refuses during prewrite on baseline mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const metaRel = `.prospec/changes/${changeName}/metadata.yaml`;
      const originalMeta = read(metaRel);
      const newScenarios = [
        { id: 'US-1.1', story_id: 'US-1', text: 'WHEN action triggered, THEN mutated output.', source: 'proposal.md:5' },
      ];
      const newDigest = computeAcceptanceDigest(newScenarios);
      const mutatedMeta = originalMeta
        .replace(/'WHEN action triggered, THEN result expected\.'/, "'WHEN action triggered, THEN mutated output.'")
        .replace(/(revisions:\n\s+- revision: 1\n\s+digest: )[a-f0-9]+/, `$1${newDigest}`);

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(metaRel, mutatedMeta);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, metaRel, mutatedMeta);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses during prewrite on spec mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const specRel = `.prospec/changes/${changeName}/delta-spec.md`;
      const mutatedSpec = read(specRel) + '\n### REQ-VM-002: Second\n**Feature:** vm\n**Story:** US-1\n**Description:** Second\n**Spec:** text\n';

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(specRel, mutatedSpec);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, specRel, mutatedSpec);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses during prewrite on proposal mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const propRel = `.prospec/changes/${changeName}/proposal.md`;
      const mutatedProp = read(propRel) + '\n### US-2: Added Story\n**Acceptance Scenarios:**\n- WHEN new, THEN new.\n';

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(propRel, mutatedProp);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, propRel, mutatedProp);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses during prewrite on saved context mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const contextRel = `.prospec/changes/${changeName}/verify-context.json`;
      const originalContext = JSON.parse(read(contextRel));
      originalContext.context_id = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const mutatedContent = JSON.stringify(originalContext, null, 2) + '\n';

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(contextRel, mutatedContent);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, contextRel, mutatedContent);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses during prewrite on test_attempt mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const metaRel = `.prospec/changes/${changeName}/metadata.yaml`;
      const originalMeta = read(metaRel);
      const mutatedMeta = originalMeta.replace(/(test_attempt:\n\s+id: )[^\n]+/, '$1attempt-changed-prewrite');

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(metaRel, mutatedMeta);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, metaRel, mutatedMeta);
      } finally {
        spy.mockRestore();
      }
    });

    it('refuses during prewrite on code mutation: zero writes, external change intact', async () => {
      const { dimsPath } = await setupPrewriteSubmission();
      const codeRel = 'src/index.ts';
      const mutatedCode = 'export const changedDuringPrewrite = true;\n';

      const before = snapshotBytes();
      const originalAssess = driftAssessment.assessCurrentDrift;
      const spy = vi.spyOn(driftAssessment, 'assessCurrentDrift').mockImplementation(async (cwd) => {
        const assessment = await originalAssess(cwd);
        write(codeRel, mutatedCode);
        return assessment;
      });

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(PrerequisiteError);

        assertZeroWriteAndNoRollback(before, codeRel, mutatedCode);
      } finally {
        spy.mockRestore();
      }
    });

    it('does not write verify.md when the authoritative metadata.yaml write fails on real filesystem', async () => {
      const prep = await verifyContext({ cwd: root, change: changeName, quiet: true });
      const dimsPath = path.join(os.tmpdir(), `dims-ro-${Date.now()}.json`);
      fs.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: prep.contextId,
            items: [{ req_id: 'REQ-VM-001', result: 'PASS', evidence_kind: 'document', evidence: 'ok' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const metaPath = path.join(root, '.prospec', 'changes', changeName, 'metadata.yaml');
      const metaDir = path.dirname(metaPath);
      const verifyRel = `.prospec/changes/${changeName}/verify.md`;
      expect(fileExists(verifyRel)).toBe(false);

      // Make directory read-only (chmod 0555) so atomic write (temp file creation or rename) fails
      fs.chmodSync(metaDir, 0o555);

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow();

        // verify.md MUST NOT be written
        expect(fileExists(verifyRel)).toBe(false);
      } finally {
        fs.chmodSync(metaDir, 0o755);
      }
    });

    it('honestly reports partial failure when metadata write succeeds but verify.md write fails on real filesystem', async () => {
      const prep = await verifyContext({ cwd: root, change: changeName, quiet: true });
      const dimsPath = path.join(os.tmpdir(), `dims-partial-${Date.now()}.json`);
      fs.writeFileSync(
        dimsPath,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: prep.contextId,
            items: [{ req_id: 'REQ-VM-001', result: 'PASS', evidence_kind: 'document', evidence: 'ok' }],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const verifyPath = path.join(root, '.prospec', 'changes', changeName, 'verify.md');
      // Create verify.md as a directory so atomicWrite fails when attempting to write/rename a file onto it
      fs.mkdirSync(verifyPath);

      try {
        await expect(
          verifyRecord({ cwd: root, change: changeName, dimensionsPath: dimsPath, warnings: [], quiet: true }),
        ).rejects.toThrow(/metadata\.yaml was updated with grade .*, but writing verify\.md failed/);

        // Confirm metadata.yaml WAS updated (authoritative write succeeded)
        const metaContent = read(`.prospec/changes/${changeName}/metadata.yaml`);
        expect(metaContent).toContain('quality_log:');
      } finally {
        fs.rmSync(verifyPath, { recursive: true, force: true });
      }
    });
  });

  describe('Chained story freeze → implemented amend → prepare → record lifecycle', () => {
    async function setupChainedChange(chainName: string) {
      write(`.prospec/changes/${chainName}/proposal.md`, sampleProposal);
      write(`.prospec/changes/${chainName}/delta-spec.md`, sampleDelta);
      write(`.prospec/changes/${chainName}/tasks.md`, sampleTasks);
      write(`.prospec/changes/${chainName}/metadata.yaml`, `name: ${chainName}\ncreated_at: '2026-09-20'\nstatus: story\nscale: standard\n`);

      git('add', '.');
      git('commit', '-qm', `setup ${chainName}`);

      // Freeze in story -> rev 1
      const freezeRes = await changeAcceptance({
        cwd: root,
        change: chainName,
        mode: 'freeze',
      });
      expect(freezeRes.revision).toBe(1);
      expect(freezeRes.origin).toBe('story');

      // Record tests and advance to implemented
      await check({ cwd: root, change: chainName, recordTests: true });
      await changeStatus({ cwd: root, change: chainName, to: 'implemented', quiet: true });

      // Amend proposal and freeze amend in implemented -> rev 2
      const propRel = `.prospec/changes/${chainName}/proposal.md`;
      write(propRel, sampleProposal + '- WHEN amended scenario, THEN verified.\n');
      git('add', propRel);
      git('commit', '-qm', 'amend proposal in implemented');

      const amendRes = await changeAcceptance({
        cwd: root,
        change: chainName,
        mode: 'amend',
        reason: 'Amending acceptance scenarios during implementation',
        expectedDigest: freezeRes.digest,
      });
      expect(amendRes.revision).toBe(2);
      expect(amendRes.origin).toBe('late-capture');
      expect(amendRes.capturedStatus).toBe('implemented');

      // Record review & fresh tests
      await check({ cwd: root, change: chainName, recordReview: true });
      await check({ cwd: root, change: chainName, recordTests: true });

      const prep = await verifyContext({ cwd: root, change: chainName, quiet: true });
      const contextContent = JSON.parse(read(`.prospec/changes/${chainName}/verify-context.json`));
      expect(contextContent.baseline.status).toBe('frozen');
      expect(contextContent.baseline.revision).toBe(2);

      return { prep };
    }

    it('enforces current late-capture revision and caps all-PASS grade at A', async () => {
      const chainName = 'chain-pass';
      const { prep } = await setupChainedChange(chainName);

      const dimsPathAllPass = path.join(os.tmpdir(), `dims-pass-${Date.now()}.json`);
      fs.writeFileSync(
        dimsPathAllPass,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            graded_by: 'fresh-subagent',
            context_id: prep.contextId,
            items: [
              { req_id: 'REQ-VM-001', result: 'PASS', evidence_kind: 'document', evidence: 'all criteria satisfied' },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const recPass = await verifyRecord({
        cwd: root,
        change: chainName,
        dimensionsPath: dimsPathAllPass,
        warnings: [],
        quiet: true,
      });

      // Late-capture produces gap warning that makes Grade S unreachable, capping at Grade A
      expect(recPass.grade).not.toBe('S');
      expect(recPass.grade).toBe('A');
      expect(recPass.warnings.some((w) => w.includes('late-capture'))).toBe(true);
    });

    it('preserves real FAIL under late-capture without masking by gap', async () => {
      const chainName = 'chain-fail';
      const { prep } = await setupChainedChange(chainName);

      const dimsPathWithFail = path.join(os.tmpdir(), `dims-fail-${Date.now()}.json`);
      fs.writeFileSync(
        dimsPathWithFail,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'FAIL',
            graded_by: 'fresh-subagent',
            context_id: prep.contextId,
            items: [
              { req_id: 'REQ-VM-001', result: 'FAIL', evidence_kind: 'document', evidence: 'boundary condition failed', repro: 'repro cmd' },
            ],
          },
          { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
          { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
        ]),
      );

      const recFail = await verifyRecord({
        cwd: root,
        change: chainName,
        dimensionsPath: dimsPathWithFail,
        warnings: [],
        quiet: true,
      });

      // Must be FAIL / C grade (not masked to PASS or not-adjudicated)
      expect(recFail.grade).toBe('C');
      expect(recFail.result).toBe('FAIL');
      expect(recFail.dimensions.find((d) => d.name === 'delta-spec-compliance')?.result).toBe('FAIL');
    });
  });
});
