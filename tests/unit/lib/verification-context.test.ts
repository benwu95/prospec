import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { assessVerificationContext } from '../../../src/lib/verification-context.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
import { computeAcceptanceDigest } from '../../../src/lib/acceptance-baseline.js';

describe('verification-context (REQ-SERVICES-115, REQ-TESTS-123)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-vc-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupRepo() {
    execFileSync('git', ['init', '-q', tmpDir], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'config', 'user.name', 'Test'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'config', 'user.email', 'test@example.com'], { stdio: 'ignore' });

    fs.writeFileSync(
      path.join(tmpDir, '.prospec.yaml'),
      'project:\n  name: test\nbase_dir: prospec\nartifact_language: en\ntech_stack:\n  language: typescript\n  package_manager: pnpm\n  test_command: pnpm test\n',
    );
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const a = 1;\n');

    execFileSync('git', ['-C', tmpDir, 'add', '-A'], { stdio: 'ignore' });
    execFileSync('git', ['-C', tmpDir, 'commit', '-qm', 'init'], { stdio: 'ignore' });
  }

  const sampleProposal = `# Proposal
## User Stories
### US-1: Test Story
**Acceptance Scenarios:**
- WHEN input, THEN output.
`;

  const sampleDelta = `# Delta
## ADDED
### REQ-CORE-001: First req
**Feature:** core
**Story:** US-1
**Description:** First
**Spec:**
Spec text.
- WHEN a, THEN b
`;

  function setupChange(
    changeName: string = 'test-change',
    options: {
      scale?: string;
      status?: string;
      frozenBaseline?: boolean;
      testAttempt?: Record<string, unknown>;
      testProvenance?: Record<string, unknown>;
    } = {},
  ) {
    const changeDir = path.join(tmpDir, '.prospec', 'changes', changeName);
    fs.mkdirSync(changeDir, { recursive: true });

    fs.writeFileSync(path.join(changeDir, 'proposal.md'), sampleProposal);
    fs.writeFileSync(path.join(changeDir, 'delta-spec.md'), sampleDelta);

    const scenarios = [
      { id: 'US-1.1', story_id: 'US-1', text: 'WHEN input, THEN output.', source: 'proposal.md:5' },
    ];
    const digest = computeAcceptanceDigest(scenarios);

    const metadata: Record<string, unknown> = {
      name: changeName,
      created_at: '2026-09-20T00:00:00Z',
      status: options.status ?? 'implemented',
      scale: options.scale ?? 'standard',
    };

    if (options.frozenBaseline !== false) {
      metadata.acceptance = {
        version: 1,
        current_revision: 1,
        revisions: [
          {
            revision: 1,
            digest,
            captured_at: '2026-09-20T00:00:00Z',
            captured_status: 'story',
            origin: 'story',
            reason: 'initial',
            scenarios,
          },
        ],
      };
    }

    if (options.testAttempt) {
      metadata.test_attempt = options.testAttempt;
    }
    if (options.testProvenance) {
      metadata.test_provenance = options.testProvenance;
    }

    const yamlLines = Object.entries(metadata).map(([k, v]) => {
      if (typeof v === 'object' && v !== null) {
        return `${k}:\n${JSON.stringify(v, null, 2).split('\n').map((l) => '  ' + l).join('\n')}`;
      }
      return `${k}: ${v}`;
    });
    fs.writeFileSync(path.join(changeDir, 'metadata.yaml'), yamlLines.join('\n') + '\n');
  }

  it('computes deterministic context_id and binds all inputs', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');
    const a2 = assessVerificationContext(tmpDir, 'test-change');

    expect(a1.context.context_id).toBe(a2.context.context_id);
    expect(a1.context.version).toBe(1);
    expect(a1.context.change_name).toBe('test-change');
    expect(a1.context.spec.req_ids).toEqual(['REQ-CORE-001']);
    expect(a1.context.baseline.status).toBe('frozen');
    expect(a1.context.baseline.revision).toBe(1);
    expect(a1.context.baseline.proposal_mismatch).toBe(false);
    expect(a1.recheck()).toBe(true);
  });

  it('produces different context_id when code changes', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');

    // Modify source code in git tree
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'export const a = 2;\n');

    const a2 = assessVerificationContext(tmpDir, 'test-change');
    expect(a1.context.context_id).not.toBe(a2.context.context_id);
    expect(a1.context.snapshot.digest).not.toBe(a2.context.snapshot.digest);
    expect(a1.recheck()).toBe(false);
  });

  it('produces different context_id when delta-spec changes', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');

    fs.appendFileSync(
      path.join(tmpDir, '.prospec', 'changes', 'test-change', 'delta-spec.md'),
      '\n### REQ-CORE-002: Added\n**Feature:** core\n**Story:** US-1\n**Description:** d\n**Spec:**\ns\n',
    );

    const a2 = assessVerificationContext(tmpDir, 'test-change');
    expect(a1.context.context_id).not.toBe(a2.context.context_id);
    expect(a1.context.spec.digest).not.toBe(a2.context.spec.digest);
    expect(a1.recheck()).toBe(false);
  });

  it('produces different context_id and recheck false when proposal changes', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');

    fs.appendFileSync(
      path.join(tmpDir, '.prospec', 'changes', 'test-change', 'proposal.md'),
      '\n### US-2: Second Story\n**Acceptance Scenarios:**\n- WHEN click, THEN do.\n',
    );

    const a2 = assessVerificationContext(tmpDir, 'test-change');
    expect(a1.context.context_id).not.toBe(a2.context.context_id);
    expect(a1.context.proposal.digest).not.toBe(a2.context.proposal.digest);
    expect(a1.recheck()).toBe(false);
  });

  it('produces different context_id and recheck false when baseline acceptance changes', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'test-change', 'metadata.yaml');
    const metaContent = fs.readFileSync(metaPath, 'utf8');
    const newScenarios = [
      { id: 'US-1.1', story_id: 'US-1', text: 'WHEN different input, THEN output.', source: 'proposal.md:5' },
    ];
    const newDigest = computeAcceptanceDigest(newScenarios);
    const newMetaContent = metaContent
      .replace('WHEN input, THEN output.', 'WHEN different input, THEN output.')
      .replace(/"digest":\s*"[^"]+"/, `"digest": "${newDigest}"`)
      .replace(/digest:\s*[a-f0-9]+/, `digest: ${newDigest}`);
    fs.writeFileSync(metaPath, newMetaContent);

    const a2 = assessVerificationContext(tmpDir, 'test-change');
    expect(a1.context.context_id).not.toBe(a2.context.context_id);
    expect(a1.context.baseline.digest).not.toBe(a2.context.baseline.digest);
    expect(a1.recheck()).toBe(false);
  });

  it('produces different context_id and recheck false when test_attempt in metadata changes', () => {
    setupRepo();
    setupChange('test-change');

    const a1 = assessVerificationContext(tmpDir, 'test-change');

    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'test-change', 'metadata.yaml');
    fs.appendFileSync(
      metaPath,
      'test_attempt:\n  id: attempt-99\n  outcome: failed\n  exit_code: 1\n  command: pnpm test\n',
    );

    const a2 = assessVerificationContext(tmpDir, 'test-change');
    expect(a1.context.context_id).not.toBe(a2.context.context_id);
    expect(a1.recheck()).toBe(false);
  });

  it('preserves test attempt states (missing, running, failed, passed, stale)', () => {
    setupRepo();

    // 1. Missing test attempt
    setupChange('c-missing');
    const aMissing = assessVerificationContext(tmpDir, 'c-missing');
    expect(aMissing.context.test_attempt.status).toBe('missing');

    // 2. Running test attempt
    setupChange('c-running', {
      testAttempt: {
        id: 'att-1',
        outcome: 'running',
        command: 'pnpm test',
      },
    });
    const aRunning = assessVerificationContext(tmpDir, 'c-running');
    expect(aRunning.context.test_attempt.status).toBe('running');

    // 3. Failed test attempt
    setupChange('c-failed', {
      testAttempt: {
        id: 'att-2',
        outcome: 'failed',
        command: 'pnpm test',
        exit_code: 1,
      },
    });
    const aFailed = assessVerificationContext(tmpDir, 'c-failed');
    expect(aFailed.context.test_attempt.status).toBe('failed');
    expect(aFailed.context.test_attempt.exit_code).toBe(1);

    // 4. Stale test attempt (recorded against older snapshot)
    setupChange('c-stale', {
      testAttempt: {
        id: 'att-3',
        outcome: 'passed',
        command: 'pnpm test',
        exit_code: 0,
        before_digest: 'older-digest',
        after_digest: 'older-digest',
      },
      testProvenance: {
        date: '2026-09-20T00:00:00Z',
        digest: 'older-digest',
        exit_code: 0,
        command: 'pnpm test',
        attempt_id: 'att-3',
        fingerprint_version: 'snapshot-v2',
        scope: 'repository-inputs-v2',
      },
    });
    const aStale = assessVerificationContext(tmpDir, 'c-stale');
    expect(aStale.context.test_attempt.status).toBe('stale');
  });

  it('reports no-command when test_command is not configured', () => {
    setupRepo();
    fs.writeFileSync(
      path.join(tmpDir, '.prospec.yaml'),
      'project:\n  name: test\nbase_dir: prospec\nartifact_language: en\ntech_stack:\n  language: typescript\n  package_manager: pnpm\n',
    );
    setupChange('c-no-cmd');
    const a = assessVerificationContext(tmpDir, 'c-no-cmd');
    expect(a.context.test_attempt.status).toBe('no-command');
  });

  it.each(['failed', 'running', 'unavailable', 'none'])('R277-11 preserves known failure before no-command or newer %s attempt', (outcome) => {
    setupRepo();
    fs.writeFileSync(path.join(tmpDir, '.prospec.yaml'), 'project:\n  name: test\n');
    setupChange('retained-failure', {
      testAttempt: outcome === 'none' ? undefined : { id: 'latest', outcome, command: 'node --test', ...(outcome === 'failed' ? { exit_code: 7 } : {}) },
      testProvenance: outcome === 'failed' ? undefined : { date: '2026-09-20', digest: 'old', exit_code: 9, command: 'old-test', attempt_id: 'older-failure' },
    });
    const attempt = assessVerificationContext(tmpDir, 'retained-failure').context.test_attempt;
    expect(attempt.status).toBe('failed');
    expect(attempt.attempt_id).toBe(outcome === 'failed' ? 'latest' : 'older-failure');
    expect(attempt.exit_code).toBe(outcome === 'failed' ? 7 : 9);
    expect(attempt.command).toBe(outcome === 'failed' ? 'node --test' : 'old-test');
  });

  it('refuses preparation when repository snapshot is unprovable (not git)', () => {
    // Do not init git in tmpDir
    fs.writeFileSync(
      path.join(tmpDir, '.prospec.yaml'),
      'project:\n  name: test\nbase_dir: prospec\nartifact_language: en\n',
    );
    setupChange('c-nogit');
    expect(() => assessVerificationContext(tmpDir, 'c-nogit')).toThrow(PrerequisiteError);
  });

  it('refuses preparation when required proposal or delta-spec cannot be read', () => {
    setupRepo();
    setupChange('c-missing-delta');
    fs.unlinkSync(path.join(tmpDir, '.prospec', 'changes', 'c-missing-delta', 'delta-spec.md'));
    expect(() => assessVerificationContext(tmpDir, 'c-missing-delta')).toThrow(PrerequisiteError);
  });

  it('handles scale quick without delta-spec', () => {
    setupRepo();
    setupChange('c-quick', { scale: 'quick' });
    fs.unlinkSync(path.join(tmpDir, '.prospec', 'changes', 'c-quick', 'delta-spec.md'));

    const a = assessVerificationContext(tmpDir, 'c-quick');
    expect(a.context.scale).toBe('quick');
    expect(a.context.spec.content).toBe('');
    expect(a.context.spec.req_ids).toEqual([]);
  });
});
