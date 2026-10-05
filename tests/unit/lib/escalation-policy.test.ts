import { describe, expect, it } from 'vitest';
import { ESCALATION_TRIGGERS } from '../../../src/types/change.js';
import { EscalationDecisionSchema } from '../../../src/types/cascade.js';
import { escalationDecision, projectEscalationReport } from '../../../src/lib/escalation.js';

describe('escalation policy', () => {
  it.each(ESCALATION_TRIGGERS)('prioritizes repeat history over trigger %s', (trigger) => {
    const decision = escalationDecision({ trigger, station: 'prospec-review', event_id: 'e2', ordinal: 2 });
    expect(decision.exits.map((e) => e.id)).toEqual(['re-scope', 'abandon', 'break-glass']);
    expect(decision.recommended).toBe('re-scope');
    expect(EscalationDecisionSchema.safeParse(decision).success).toBe(true);
  });
  it.each(ESCALATION_TRIGGERS)('provides a first-trigger remedy for %s', (trigger) => {
    const decision = escalationDecision({ trigger, station: 'prospec-review', event_id: 'e1', ordinal: 1 });
    const redesign = trigger === 'oscillation' || trigger === 'fix_induced_threshold_exceeded';
    expect(decision.recommended).toBe(redesign ? 'revert-and-redesign' : 'manual-intervention');
    expect(decision.exits.map((e) => e.id)).not.toContain('retry');
    if (redesign) expect(decision.exits.map((e) => e.id)).not.toContain('manual-intervention');
    expect(EscalationDecisionSchema.safeParse(decision).success).toBe(true);
  });
  it.each([0, 1, 2])('projects unpersisted observation over %i saved events', (ordinal) => {
    const report = projectEscalationReport({
      type: 'persistent_test_failure', message: 'Failed tests', diagnostics: { count: 3 },
      tradeoffOptions: ['old bypass'],
    }, { station: 'prospec-review', event_id: null, ordinal });
    expect(report.decision?.ordinal).toBe(ordinal);
    expect(report.decision?.event_id).toBeNull();
    expect(report.decision?.recommended).toBe(ordinal >= 2 ? 're-scope' : 'manual-intervention');
    expect(report.tradeoffOptions).toEqual(report.decision?.exits.map((e) => `${e.label}: ${e.description}`));
    expect(report.diagnostics).toEqual({ count: 3 });
    expect(report.message).toBe('Failed tests');
  });
});
