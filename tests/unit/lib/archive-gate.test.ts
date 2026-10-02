import { describe, it, expect } from 'vitest';
import { evaluateArchiveEntryGate } from '../../../src/lib/archive-gate.js';
import { formatWorkflowReason, WORKFLOW_REASON_CODES } from '../../../src/types/status.js';
import type { KnowledgeSyncGaps } from '../../../src/lib/knowledge-sync.js';
import {
  DRIFT_REPORT_VERSION,
  type DriftCheckId,
  type DriftFinding,
  type DriftReport,
} from '../../../src/types/drift-report.js';

const GATED: DriftCheckId[] = ['task-completion', 'metadata-completeness', 'review-provenance', 'test-provenance', 'delta-spec-provenance'];
const TARGET = 'add-widget';

/**
 * A drift report over `subjects` (default: the target alone) where each gated
 * check's status is `fail` exactly when a finding for it is anchored under some
 * change — the shape the engine emits, so the fixture cannot desynchronize status
 * from findings the way a hand-written status map could.
 */
function report(
  failing: Partial<Record<DriftCheckId, string[]>> = {},
  opts: { subjects?: string[]; skipped?: Partial<Record<DriftCheckId, string>>; omitSubjects?: boolean; absent?: DriftCheckId[] } = {},
): DriftReport {
  const subjects = opts.subjects ?? [TARGET];
  const findings: DriftFinding[] = [];
  const checks = GATED.filter((id) => !(opts.absent ?? []).includes(id)).map((id) => {
    const skipReason = opts.skipped?.[id];
    if (skipReason !== undefined) return { id, status: 'skipped' as const, reason: skipReason, subjects };
    const culprits = failing[id] ?? [];
    for (const change of culprits) {
      findings.push({ check: id, severity: 'fail', source_path: `.prospec/changes/${change}/metadata.yaml`, detail: `${id} fails for ${change}` });
    }
    return { id, status: culprits.length > 0 ? ('fail' as const) : ('pass' as const), ...(opts.omitSubjects ? {} : { subjects }) };
  });
  return {
    version: DRIFT_REPORT_VERSION,
    generated_at: '2026-08-29T00:00:00.000Z',
    structural: { checks: checks.length > 0 ? checks : [{ id: 'req-references', status: 'pass' as const }], findings },
    semantic: { status: 'not-checked' },
    summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
  } as DriftReport;
}

const NO_GAPS: KnowledgeSyncGaps = { stale: [], unregistered: [], malformedIds: [], moduleMapUnreadable: false };
const STALE: KnowledgeSyncGaps = { ...NO_GAPS, stale: ['services'] };

const inputs = (over: Partial<Parameters<typeof evaluateArchiveEntryGate>[1]> = {}) => ({
  changeName: TARGET,
  knowledgeGaps: NO_GAPS,
  allowIncomplete: false,
  taskCompletionApplicable: true,
  ...over,
});

const codes = (v: ReturnType<typeof evaluateArchiveEntryGate>) => v.reasons.map((r) => r.code);

describe('evaluateArchiveEntryGate', () => {
  it('passes when every gated check passes for the target and Knowledge is synced', () => {
    const v = evaluateArchiveEntryGate(report(), inputs());
    expect(v.blocked).toBe(false);
    expect(v.reasons).toEqual([]);
  });

  it('blocks and names metadata-completeness on FAIL', () => {
    const v = evaluateArchiveEntryGate(report({ 'metadata-completeness': [TARGET] }), inputs());
    expect(v.blocked).toBe(true);
    expect(codes(v)).toEqual(['METADATA_INCOMPLETE']);
    expect(v.reasons[0]!.message).toContain('metadata-completeness');
  });

  it('--allow-incomplete exempts completeness but nothing else', () => {
    expect(evaluateArchiveEntryGate(report({ 'metadata-completeness': [TARGET] }), inputs({ allowIncomplete: true })).blocked).toBe(false);
    const alsoReview = evaluateArchiveEntryGate(
      report({ 'metadata-completeness': [TARGET], 'review-provenance': [TARGET] }),
      inputs({ allowIncomplete: true }),
    );
    expect(codes(alsoReview)).toEqual(['REVIEW_STALE']);
  });

  it.each([
    ['review-provenance', 'REVIEW_STALE'],
    ['test-provenance', 'TESTS_STALE'],
    ['delta-spec-provenance', 'DELTA_SPEC_STALE'],
    ['task-completion', 'TASKS_INCOMPLETE'],
  ] as const)('blocks on %s FAIL with code %s', (id, code) => {
    const v = evaluateArchiveEntryGate(report({ [id]: [TARGET] }), inputs());
    expect(codes(v)).toEqual([code]);
    expect(v.reasons[0]!.message).toContain(id);
    expect(v.reasons[0]!.remediation.length).toBeGreaterThan(0);
  });

  it('blocks when Knowledge is not synced', () => {
    const v = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: STALE }));
    expect(codes(v)).toEqual(['KNOWLEDGE_UNSYNCED']);
  });

  it('names stale modules and points them at knowledge-update + knowledge verify', () => {
    const [r] = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: { ...NO_GAPS, stale: ['services', 'lib'] } })).reasons;
    expect(r!.message).toContain('services, lib');
    expect(r!.remediation).toContain('prospec-knowledge-update');
    expect(r!.remediation).toContain('prospec knowledge verify services lib');
  });

  it('names unregistered modules without suggesting knowledge verify for them', () => {
    const [r] = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: { ...NO_GAPS, unregistered: ['auth'] } })).reasons;
    expect(r!.message).toContain('auth');
    expect(r!.remediation).toContain('req_prefixes');
    expect(r!.remediation).not.toContain('knowledge verify');
  });

  it('names a non-canonical REQ id and an unreadable module map with their own remedies', () => {
    const [bad] = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: { ...NO_GAPS, malformedIds: ['REQ-LIB-0001'] } })).reasons;
    expect(bad!.code).toBe('KNOWLEDGE_INPUT_INVALID');
    expect(bad!.message).toContain('REQ-LIB-0001');
    expect(bad!.remediation).toContain('REQ-{MODULE}-NNN');
    const [map] = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: { ...NO_GAPS, moduleMapUnreadable: true } })).reasons;
    expect(map!.code).toBe('KNOWLEDGE_INPUT_INVALID');
    expect(map!.message).toContain('module-map.yaml cannot be read, parsed or validated');
    expect(map!.remediation).toContain('repair module-map.yaml');
    expect(map!.remediation).not.toContain('knowledge verify');
  });

  it('remedies a module map outside the knowledge root by keeping the map inside it, not by repairing it', () => {
    const gaps = { ...NO_GAPS, moduleMapUnreadable: true, moduleMapOutsideRoot: true as const };
    const [map] = evaluateArchiveEntryGate(report(), inputs({ knowledgeGaps: gaps })).reasons;
    expect(map!.code).toBe('KNOWLEDGE_INPUT_INVALID');
    expect(map!.message).toContain('module-map.yaml resolves outside the knowledge root');
    expect(map!.remediation).toContain('keep module-map.yaml itself inside the knowledge root');
    expect(map!.remediation).not.toContain('repair module-map.yaml');
  });

  it('lists a related-only unregistered name apart from a delta-spec-sourced one, each with its own remedy', () => {
    const v = evaluateArchiveEntryGate(
      report(),
      inputs({ knowledgeGaps: { ...NO_GAPS, unregistered: ['auth', 'ghost'], relatedUnregistered: ['ghost'] } }),
    );
    expect(codes(v)).toEqual(['KNOWLEDGE_INPUT_INVALID', 'KNOWLEDGE_UNSYNCED']);
    const [related, delta] = v.reasons;
    expect(related!.message).toContain('ghost');
    expect(related!.message).not.toContain('auth');
    expect(related!.remediation).toContain(`prospec change related-modules <module...> --change ${TARGET}`);
    expect(delta!.message).toContain('auth');
    expect(delta!.message).not.toContain('ghost');
    expect(delta!.remediation).toContain('req_prefixes');
  });

  it('names one reason per failing cause', () => {
    const v = evaluateArchiveEntryGate(
      report({ 'metadata-completeness': [TARGET], 'review-provenance': [TARGET], 'test-provenance': [TARGET], 'delta-spec-provenance': [TARGET] }),
      inputs({ knowledgeGaps: STALE }),
    );
    expect(v.reasons).toHaveLength(5);
  });

  it('blocks as unprovable on a check absent from the report (older engine)', () => {
    const v = evaluateArchiveEntryGate(report({}, { absent: ['review-provenance'] }), inputs());
    expect(v.blocked).toBe(true);
    expect(codes(v)).toEqual(['CHECK_UNPROVABLE']);
  });

  it('refuses unprovable review even alongside an advisory delta warning', () => {
    const v = evaluateArchiveEntryGate(report({}, { skipped: { 'review-provenance': 'source unavailable' } }), inputs());
    expect(v.blocked).toBe(true);
    expect(codes(v)).toEqual(['CHECK_UNPROVABLE']);
  });

  it('accepts only the explicitly unavailable test command as a skip', () => {
    const ok = evaluateArchiveEntryGate(report({}, { skipped: { 'test-provenance': 'test command unavailable: no runner' } }), inputs());
    expect(ok.blocked).toBe(false);
    const other = evaluateArchiveEntryGate(report({}, { skipped: { 'test-provenance': 'source unavailable' } }), inputs());
    expect(codes(other)).toEqual(['CHECK_UNPROVABLE']);
  });

  // --- per-change adjudication (REQ-LIB-071 / issue #266) ---

  it("a sibling change's missing review and tests never refuse the target", () => {
    const twoChanges = report(
      { 'review-provenance': ['other'], 'test-provenance': ['other'], 'metadata-completeness': ['other'] },
      { subjects: [TARGET, 'other'] },
    );
    expect(evaluateArchiveEntryGate(twoChanges, inputs()).blocked).toBe(false);
    const sibling = evaluateArchiveEntryGate(twoChanges, inputs({ changeName: 'other' }));
    expect(codes(sibling).sort()).toEqual(['METADATA_INCOMPLETE', 'REVIEW_STALE', 'TESTS_STALE']);
  });

  it('refuses as unprovable a target the engine did not enumerate — never a borrowed pass', () => {
    const v = evaluateArchiveEntryGate(report({}, { subjects: ['other'] }), inputs());
    expect(v.blocked).toBe(true);
    expect(codes(v)).toEqual(Array(GATED.length).fill('CHECK_UNPROVABLE'));
  });

  it('refuses a legacy report that carries no subjects as unprovable', () => {
    const v = evaluateArchiveEntryGate(report({}, { omitSubjects: true }), inputs());
    expect(v.blocked).toBe(true);
    expect(new Set(codes(v))).toEqual(new Set(['CHECK_UNPROVABLE']));
  });

  it('a proven backfill (no tasks.md, never enumerated by task-completion) is not refused for task-completion', () => {
    const noTasks = report({}, { subjects: [TARGET] });
    const tc = noTasks.structural.checks.find((c) => c.id === 'task-completion')!;
    tc.subjects = [];
    expect(codes(evaluateArchiveEntryGate(noTasks, inputs({ taskCompletionApplicable: true })))).toEqual(['CHECK_UNPROVABLE']);
    expect(evaluateArchiveEntryGate(noTasks, inputs({ taskCompletionApplicable: false })).blocked).toBe(false);
  });

  it('an unproven scale: backfill keeps the ordinary rule and its remediation names the exits', () => {
    const noTasks = report({}, { subjects: [TARGET] });
    noTasks.structural.checks.find((c) => c.id === 'task-completion')!.subjects = [];
    const v = evaluateArchiveEntryGate(noTasks, inputs());
    expect(v.reasons[0]!.remediation).toMatch(/backfill-draft\.md/);
    expect(v.reasons[0]!.remediation).toMatch(/prospec change scale/);
  });

  it('every reason code is a member of WORKFLOW_REASON_CODES and formats as CODE: message — remediation', () => {
    const v = evaluateArchiveEntryGate(
      report({ 'review-provenance': [TARGET] }, { skipped: { 'delta-spec-provenance': 'source unavailable' } }),
      inputs({ knowledgeGaps: STALE }),
    );
    for (const r of v.reasons) {
      expect(WORKFLOW_REASON_CODES).toContain(r.code);
      expect(formatWorkflowReason(r)).toBe(`${r.code}: ${r.message} — ${r.remediation}`);
    }
  });
});
