import { describe, expect, it } from 'vitest';
import { evaluateChangeTestEvidence, evaluateTestProvenance } from '../../../src/lib/drift-checker.js';
import { adjudicateChangeCheck } from '../../../src/lib/change-gate.js';
import type { TestProvenanceSource } from '../../../src/lib/drift-sources.js';
import { readTestEvidenceRecord } from '../../../src/lib/drift-sources.js';
import { TEST_EVIDENCE_SCOPE, TEST_FINGERPRINT_VERSION, type TestEvidenceIdentity } from '../../../src/types/change.js';
import type { TestEvidenceFacts } from '../../../src/types/station.js';

const policy = { version: 1, excluded_path: 'prospec/ai-knowledge' } as const;
const identity: TestEvidenceIdentity = { fingerprintVersion: TEST_FINGERPRINT_VERSION, scope: TEST_EVIDENCE_SCOPE, testPolicy: policy };
const facts = (): TestEvidenceFacts => ({
  changeName: 'sample', scale: 'full', backfillDraftPresent: false,
  commandUnavailableReason: null, currentDigest: 'digest', currentIdentity: identity, currentCommand: 'node test.cjs',
  recordedDigest: 'digest', recordedExitCode: 0, recordedCommand: 'node test.cjs', recordedDate: '2026-10-13',
  recordedAttemptId: 'original', recordedIdentity: identity, versionSupported: true,
  latestAttempt: { id: 'original', outcome: 'passed', date: '2026-10-13', command: 'node test.cjs', identity,
    beforeDigest: 'digest', afterDigest: 'digest', exitCode: 0 },
});

describe('certified opt-in test evidence', () => {
  it('reports the original run without mutating its facts', () => {
    const input = facts(); const before = structuredClone(input);
    expect(evaluateChangeTestEvidence(input)).toEqual({ verdict: 'pass', attemptId: 'original', reuse: {
      attempt_id: 'original', date: '2026-10-13', command: 'node test.cjs', exit_code: 0, test_policy: policy,
      reason: expect.stringMatching(/compatible.*inputs.*Knowledge/i),
    } });
    expect(input).toEqual(before);
  });
  it.each(['currentIdentity', 'recordedIdentity', 'attemptIdentity'] as const)('refuses absent or unsupported %s', (slot) => {
    for (const value of [undefined, { ...identity, fingerprintVersion: 'future' }, { ...identity, scope: 'other' },
      { ...identity, testPolicy: undefined }, { ...identity, testPolicy: { version: 2, excluded_path: policy.excluded_path } },
      { ...identity, testPolicy: { ...policy, excluded_path: 'other' } }]) {
      const input = facts();
      if (slot === 'attemptIdentity') input.latestAttempt!.identity = value;
      else input[slot] = value;
      expect(evaluateChangeTestEvidence(input).verdict).toBe('refuse');
    }
  });
  it.each(['currentCommand', 'recordedCommand', 'attemptCommand', 'recordedDate', 'attemptDate'])('refuses missing or inconsistent %s', (field) => {
    const input = facts();
    if (field === 'attemptCommand') input.latestAttempt!.command = 'different';
    else if (field === 'attemptDate') input.latestAttempt!.date = 'different';
    else if (field === 'recordedDate') input.recordedDate = undefined;
    else input[field as 'currentCommand' | 'recordedCommand'] = 'different';
    expect(evaluateChangeTestEvidence(input).verdict).toBe('refuse');
  });
  it.each(['running', 'failed', 'timeout', 'unprovable', 'unavailable'])('does not revive a PASS after %s', (outcome) => {
    const input = facts(); input.latestAttempt!.outcome = outcome;
    expect(evaluateChangeTestEvidence(input).verdict).not.toBe('pass');
  });
  it('keeps known failures ahead of exemptions and policy compatibility', () => {
    const input = facts(); input.recordedExitCode = 7; input.commandUnavailableReason = 'missing'; input.currentIdentity = undefined;
    expect(evaluateChangeTestEvidence(input)).toMatchObject({ verdict: 'refuse', knownFailure: true });
  });
  it('reads identity and original run fields through the shared metadata mapping', () => {
    const trace = { fingerprint_version: TEST_FINGERPRINT_VERSION, scope: TEST_EVIDENCE_SCOPE, test_policy: policy };
    const record = readTestEvidenceRecord({
      test_provenance: { ...trace, digest: 'digest', exit_code: 0, command: 'node test.cjs', date: '2026-10-13', attempt_id: 'original' },
      test_attempt: { ...trace, id: 'original', outcome: 'passed', date: '2026-10-13' },
    });
    expect(record).toMatchObject({ recordedIdentity: identity, recordedDate: '2026-10-13', versionSupported: true,
      latestAttempt: { identity, date: '2026-10-13' } });
  });
});

it.each([false, true])('preserves certified target adjudication with unavailable sibling: %s', (withSibling) => {
  const source: TestProvenanceSource = { available: true, command_unavailable_reason: null,
    current_digest: 'digest', working_tree_clean: true, current_identity: identity, current_command: 'node test.cjs',
    changes: [{ name: 'sample', source_path: '.prospec/changes/sample/metadata.yaml', status: 'implemented', scale: 'full',
      recorded_digest: 'digest', recorded_exit_code: 0, recorded_command: 'node test.cjs', recorded_attempt_id: 'original',
      recorded_identity: identity, recorded_date: '2026-10-13', version_supported: true, backfill_draft_present: false,
      attempt_id: 'original', attempt_outcome: 'passed', attempt_identity: identity, attempt_date: '2026-10-13',
      attempt_command: 'node test.cjs', attempt_before_digest: 'digest', attempt_after_digest: 'digest', attempt_exit_code: 0 }],
  };
  if (withSibling) source.changes.push({ ...source.changes[0]!, name: 'sibling',
    source_path: '.prospec/changes/sibling/metadata.yaml', attempt_outcome: 'unavailable', attempt_reason: 'command unavailable' });
  const result = evaluateTestProvenance(source);
  expect(result.result.status).toBe('pass');
  expect(result.result.subjects).toEqual(withSibling ? ['sample', 'sibling'] : ['sample']);
  const report = { version: 1 as const, generated_at: '2026-10-13',
    structural: { checks: [result.result], findings: result.findings },
    semantic: { status: 'not-checked' as const }, summary: { fail_count: 0, warn_count: 0, skipped_count: 0 } };
  expect(adjudicateChangeCheck(report, 'test-provenance', 'sample').status).toBe('pass');
  if (withSibling) {
    expect(adjudicateChangeCheck(report, 'test-provenance', 'sibling').status).toBe('skipped');
    expect(result.testEvidence?.sibling).toBeUndefined();
    source.changes.shift();
    expect(evaluateTestProvenance(source).result.status).toBe('skipped');
  }
  expect(result.testEvidence?.sample).toMatchObject({ attempt_id: 'original', test_policy: policy });
});
