import { describe, it, expect } from 'vitest';
import { adjudicateChangeCheck, changeDirPrefix } from '../../../src/lib/change-gate.js';
import {
  DRIFT_CHECK_IDS,
  DRIFT_CHECK_SCOPES,
  DRIFT_REPORT_VERSION,
  type DriftCheckId,
  type DriftFinding,
  type DriftReport,
} from '../../../src/types/drift-report.js';

/**
 * Per-change adjudication (REQ-LIB-077): a gate asks "what does check X say
 * about change A" and must never read a sibling's finding, a missing
 * enumeration, or an older report as A's pass.
 */

type CheckSpec = {
  id: DriftCheckId;
  status: 'pass' | 'warn' | 'fail' | 'skipped';
  reason?: string;
  subjects?: string[];
};

function report(checks: CheckSpec[], findings: DriftFinding[] = []): DriftReport {
  return {
    version: DRIFT_REPORT_VERSION,
    generated_at: '2026-09-05T00:00:00.000Z',
    structural: { checks, findings },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
  } as DriftReport;
}

const finding = (check: DriftCheckId, source_path: string, severity: 'fail' | 'warn' = 'fail'): DriftFinding => ({
  check,
  severity,
  source_path,
  detail: `${severity} at ${source_path}`,
});

describe('DRIFT_CHECK_SCOPES — the scope registry', () => {
  it('declares a scope for every drift check id', () => {
    expect(Object.keys(DRIFT_CHECK_SCOPES).sort()).toEqual([...DRIFT_CHECK_IDS].sort());
  });

  it('marks exactly the six change-directory checks as change-scoped', () => {
    const changeScoped = DRIFT_CHECK_IDS.filter((id) => DRIFT_CHECK_SCOPES[id] === 'change').sort();
    expect(changeScoped).toEqual(
      [
        'delta-spec-landing-fidelity',
        'delta-spec-provenance',
        'metadata-completeness',
        'review-provenance',
        'task-completion',
        'test-provenance',
      ].sort(),
    );
  });
});

describe('adjudicateChangeCheck — change-scoped checks', () => {
  const A = changeDirPrefix('a');
  const B = changeDirPrefix('b');

  it("a sibling's FAIL never touches the target: A passes while B fails the same check", () => {
    const r = report(
      [{ id: 'review-provenance', status: 'fail', subjects: ['a', 'b'] }],
      [finding('review-provenance', `${B}metadata.yaml`)],
    );
    expect(adjudicateChangeCheck(r, 'review-provenance', 'a')).toEqual({ status: 'pass', findings: [] });
    const b = adjudicateChangeCheck(r, 'review-provenance', 'b');
    expect(b.status).toBe('fail');
    expect(b.findings).toHaveLength(1);
  });

  it('warn-only findings under the target yield warn; a fail anywhere under it yields fail', () => {
    const r = report(
      [{ id: 'delta-spec-landing-fidelity', status: 'fail', subjects: ['a'] }],
      [
        finding('delta-spec-landing-fidelity', `${A}delta-spec.md`, 'warn'),
        finding('delta-spec-landing-fidelity', `${A}delta-spec.md`, 'fail'),
      ],
    );
    expect(adjudicateChangeCheck(r, 'delta-spec-landing-fidelity', 'a').status).toBe('fail');
    const warnOnly = report(
      [{ id: 'delta-spec-landing-fidelity', status: 'warn', subjects: ['a'] }],
      [finding('delta-spec-landing-fidelity', `${A}delta-spec.md`, 'warn')],
    );
    expect(adjudicateChangeCheck(warnOnly, 'delta-spec-landing-fidelity', 'a').status).toBe('warn');
  });

  it('is unprovable when the check is absent from the report (older engine)', () => {
    const v = adjudicateChangeCheck(report([]), 'test-provenance', 'a');
    expect(v.status).toBe('unprovable');
    expect(v.reason).toMatch(/absent from the report/);
  });

  it('is unprovable when the check carries no subjects (report predates per-change adjudication)', () => {
    const v = adjudicateChangeCheck(report([{ id: 'test-provenance', status: 'pass' }]), 'test-provenance', 'a');
    expect(v.status).toBe('unprovable');
    expect(v.reason).toMatch(/enumerated no subjects/);
  });

  it('is unprovable when the target is not among the enumerated subjects — a pass status is not borrowed', () => {
    const v = adjudicateChangeCheck(
      report([{ id: 'metadata-completeness', status: 'pass', subjects: ['b'] }]),
      'metadata-completeness',
      'a',
    );
    expect(v.status).toBe('unprovable');
    expect(v.reason).toMatch(/was not enumerated/);
  });

  it('passes a skipped check through with its reason, ahead of the subjects test', () => {
    const v = adjudicateChangeCheck(
      report([{ id: 'test-provenance', status: 'skipped', reason: 'test command unavailable: no runner', subjects: [] }]),
      'test-provenance',
      'a',
    );
    expect(v).toEqual({ status: 'skipped', reason: 'test command unavailable: no runner', findings: [] });
  });

  // Review pin (Q-1): a per-subject skip recorded by the evaluator (e.g. this
  // change's test command was unavailable while a sibling's run failed) must come
  // back as `skipped` with its reason — never as a vacuous pass because no finding
  // happens to be anchored under the target.
  it('returns a per-subject skip as skipped with its reason, ahead of the finding filter', () => {
    const r = report(
      [{ id: 'test-provenance', status: 'fail', subjects: ['a', 'b'], subject_skips: { a: 'test command unavailable: latest attempt for change "a"' } } as never],
      [finding('test-provenance', `${B}metadata.yaml`)],
    );
    expect(adjudicateChangeCheck(r, 'test-provenance', 'a')).toEqual({
      status: 'skipped',
      reason: 'test command unavailable: latest attempt for change "a"',
      findings: [],
    });
    expect(adjudicateChangeCheck(r, 'test-provenance', 'b').status).toBe('fail');
  });

  it('attributes a finding anchored outside every change directory to the target (fail-closed)', () => {
    const r = report(
      [{ id: 'task-completion', status: 'fail', subjects: ['a', 'b'] }],
      [finding('task-completion', 'tasks.md')],
    );
    expect(adjudicateChangeCheck(r, 'task-completion', 'a').status).toBe('fail');
    expect(adjudicateChangeCheck(r, 'task-completion', 'b').status).toBe('fail');
  });

  it('matches the change directory exactly — "a" does not absorb "a-2"', () => {
    const r = report(
      [{ id: 'task-completion', status: 'fail', subjects: ['a', 'a-2'] }],
      [finding('task-completion', `${changeDirPrefix('a-2')}tasks.md`)],
    );
    expect(adjudicateChangeCheck(r, 'task-completion', 'a').status).toBe('pass');
    expect(adjudicateChangeCheck(r, 'task-completion', 'a-2').status).toBe('fail');
  });
});

describe('adjudicateChangeCheck — repository-scoped checks', () => {
  it("adopts the check's own status and reason regardless of the target", () => {
    const r = report(
      [{ id: 'knowledge-health', status: 'warn' }],
      [finding('knowledge-health', 'prospec/ai-knowledge/modules/lib/README.md', 'warn')],
    );
    const v = adjudicateChangeCheck(r, 'knowledge-health', 'anyone');
    expect(v.status).toBe('warn');
    expect(v.findings).toHaveLength(1);
    const skipped = adjudicateChangeCheck(
      report([{ id: 'constitution-severity', status: 'skipped', reason: 'no constitution' }]),
      'constitution-severity',
      'anyone',
    );
    expect(skipped).toMatchObject({ status: 'skipped', reason: 'no constitution' });
  });
});
