import { describe, it, expect } from 'vitest';
import { evaluateArchiveEntryGate } from '../../../src/lib/archive-gate.js';
import { DRIFT_REPORT_VERSION, type DriftReport } from '../../../src/types/drift-report.js';

/** A drift report carrying the given check → status map (plus a filler so `checks` is non-empty). */
function report(statuses: Record<string, 'pass' | 'warn' | 'fail' | 'skipped'>): DriftReport {
  const checks = Object.entries({ 'task-completion': 'pass', 'metadata-completeness': 'pass', 'review-provenance': 'pass', 'test-provenance': 'pass', 'delta-spec-provenance': 'pass', ...statuses }).map(([id, status]) => ({ id, status }));
  return {
    version: DRIFT_REPORT_VERSION,
    generated_at: '2026-08-29T00:00:00.000Z',
    structural: {
      checks: checks.length > 0 ? checks : [{ id: 'req-references', status: 'pass' as const }],
      findings: [],
    },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
  } as DriftReport;
}

describe('evaluateArchiveEntryGate', () => {
  it('passes when every gated check passes and Knowledge is synced', () => {
    const v = evaluateArchiveEntryGate(
      report({
        'metadata-completeness': 'pass',
        'review-provenance': 'pass',
        'test-provenance': 'pass',
        'delta-spec-provenance': 'pass',
      }),
      { knowledgeSynced: true, allowIncomplete: false },
    );
    expect(v.blocked).toBe(false);
    expect(v.reasons).toEqual([]);
  });

  it('blocks and names metadata-completeness on FAIL', () => {
    const v = evaluateArchiveEntryGate(report({ 'metadata-completeness': 'fail' }), {
      knowledgeSynced: true,
      allowIncomplete: false,
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons).toHaveLength(1);
    expect(v.reasons[0]).toContain('metadata-completeness');
  });

  it('--allow-incomplete exempts completeness but nothing else', () => {
    const onlyCompleteness = evaluateArchiveEntryGate(report({ 'metadata-completeness': 'fail' }), {
      knowledgeSynced: true,
      allowIncomplete: true,
    });
    expect(onlyCompleteness.blocked).toBe(false);

    const alsoReview = evaluateArchiveEntryGate(
      report({ 'metadata-completeness': 'fail', 'review-provenance': 'fail' }),
      { knowledgeSynced: true, allowIncomplete: true },
    );
    expect(alsoReview.blocked).toBe(true);
    expect(alsoReview.reasons).toHaveLength(1);
    expect(alsoReview.reasons[0]).toContain('review-provenance');
  });

  it.each(['review-provenance', 'test-provenance', 'delta-spec-provenance'])(
    'blocks on %s FAIL',
    (id) => {
      const v = evaluateArchiveEntryGate(report({ [id]: 'fail' }), {
        knowledgeSynced: true,
        allowIncomplete: false,
      });
      expect(v.blocked).toBe(true);
      expect(v.reasons[0]).toContain(id);
    },
  );

  it('blocks when Knowledge is not synced', () => {
    const v = evaluateArchiveEntryGate(report({ 'metadata-completeness': 'pass' }), {
      knowledgeSynced: false,
      allowIncomplete: false,
    });
    expect(v.blocked).toBe(true);
    expect(v.reasons.some((r) => r.includes('Knowledge'))).toBe(true);
  });

  it('names one reason per failing cause', () => {
    const v = evaluateArchiveEntryGate(
      report({
        'metadata-completeness': 'fail',
        'review-provenance': 'fail',
        'test-provenance': 'fail',
        'delta-spec-provenance': 'fail',
      }),
      { knowledgeSynced: false, allowIncomplete: false },
    );
    expect(v.reasons).toHaveLength(5);
  });

  it('blocks on a check absent from the report (older engine)', () => {
    const v = evaluateArchiveEntryGate({ ...report({}), structural: { checks: [], findings: [] } }, {
      knowledgeSynced: true,
      allowIncomplete: false,
    });
    expect(v.blocked).toBe(true);
  });

  it('refuses unprovable review even alongside an advisory delta warning', () => {
    const v = evaluateArchiveEntryGate(
      report({ 'review-provenance': 'skipped', 'delta-spec-provenance': 'warn' }),
      { knowledgeSynced: true, allowIncomplete: false },
    );
    expect(v.blocked).toBe(true);
  });
});

it('refuses missing required facts and pending code tasks', () => {
  const absent = report({});
  absent.structural.checks = [];
  expect(evaluateArchiveEntryGate(absent, { knowledgeSynced: true, allowIncomplete: true }).blocked).toBe(true);
  const pending = report({ 'task-completion': 'fail', 'metadata-completeness': 'pass', 'review-provenance': 'pass', 'test-provenance': 'pass', 'delta-spec-provenance': 'pass' });
  expect(evaluateArchiveEntryGate(pending, { knowledgeSynced: true, allowIncomplete: false }).reasons.some((r) => r.includes('task-completion'))).toBe(true);
});
