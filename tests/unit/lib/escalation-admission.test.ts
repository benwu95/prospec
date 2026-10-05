import { describe, expect, it } from 'vitest';
import type { EscalationHistory, EscalationRecord, NewQualityLogEntry } from '../../../src/types/change.js';
import { admitEscalation, canonicalAttemptId, escalationTransitions, reduceEscalationHistory } from '../../../src/lib/escalation.js';

const station = 'prospec-review' as const;
const row = (escalation: EscalationRecord): NewQualityLogEntry => ({ skill: 'prospec-escalation', date: '2026-10-05', result: 'WARN', warnings: [], escalation });
const logs = [1, 2].map((n) => row({ kind: 'trigger', event_id: `review:${n}`, station, trigger: 'oscillation' }));
const pending = () => reduceEscalationHistory(logs, 3);
const accepted: NewQualityLogEntry = { skill: station, date: '2026-10-05', result: 'PASS', warnings: [], attempt_id: 'a1', accepted: { request_id: 'request:1' } };

describe('attempt admission', () => {
  it('canonicalizes key order while retaining changed nested causal inputs', () => {
    const a = canonicalAttemptId(station, { round: 2, specs: { proposal: 'one', delta: 'two' } });
    expect(canonicalAttemptId(station, { specs: { delta: 'two', proposal: 'one' }, round: 2 })).toBe(a);
    expect(canonicalAttemptId(station, { round: 2, specs: { proposal: 'changed', delta: 'two' } })).not.toBe(a);
    expect(canonicalAttemptId('prospec-verify', { round: 2, specs: { proposal: 'one', delta: 'two' } })).not.toBe(a);
  });
  it('fails closed for unrepresentable identity inputs', () => {
    expect(() => canonicalAttemptId(station, { value: Number.NaN })).toThrow();
    expect(() => canonicalAttemptId(station, { value: () => undefined })).toThrow();
  });
  it('refuses a new attempt despite its sharing a previously accepted round', () => {
    const outcome = admitEscalation(pending(), [...logs, { ...accepted, round: 2 }], station, 'different-input');
    expect(outcome.kind).toBe('refused');
    if (outcome.kind === 'refused') expect(outcome.decision.recommended).toBe('re-scope');
  });
  it('finds an older accepted replay without changing the latest verdict', () => {
    const log = [...logs, accepted, { ...accepted, attempt_id: 'a2', result: 'WARN' as const }];
    expect(admitEscalation(pending(), log, station, 'a1')).toEqual({ kind: 'replay', entry: accepted });
    expect(log.at(-1)?.attempt_id).toBe('a2');
  });
  it.each(['wrong-event', 'wrong-station', 'consumed'])('does not accept a %s grant', (mode) => {
    const history = pending();
    history.grants.push({
      event_id: mode === 'wrong-event' ? 'review:1' : 'review:2',
      station: mode === 'wrong-station' ? 'prospec-plan' : station,
      grant_id: 'g1', reason: 'explicit reason', consumed_by: mode === 'consumed' ? 'old' : null,
    });
    expect(admitEscalation(history, logs, station, 'new').kind).toBe('refused');
  });
  it('admits one attempt and returns its bound consumption together with the next event', () => {
    const history = pending();
    history.grants.push({ event_id: 'review:2', station, grant_id: 'g1', reason: 'repair', consumed_by: null });
    const admission = admitEscalation(history, logs, station, 'a3');
    expect(admission.kind).toBe('accept');
    if (admission.kind !== 'accept') throw new Error('fixture did not reach admission');
    const transitions = escalationTransitions(history, { station, event_id: 'review:3', trigger: 'oscillation', attempt_id: 'a3', grant: admission.grant });
    expect(transitions).toEqual([
      { kind: 'consume', event_id: 'review:2', station, grant_id: 'g1', attempt_id: 'a3' },
      { kind: 'trigger', event_id: 'review:3', station, trigger: 'oscillation' },
    ]);
    const next = reduceEscalationHistory([...logs, ...history.grants.map((grant) => row({ kind: 'override', event_id: grant.event_id!, station, grant_id: grant.grant_id!, reason: grant.reason })), ...transitions.map(row)], 3);
    expect(admitEscalation(next, logs, station, 'a4').kind).toBe('refused');
  });
  it('does not let resolved lifetime history alone block a new attempt', () => {
    const history: EscalationHistory = { ...pending(), pending: null };
    expect(admitEscalation(history, logs, station, 'new')).toEqual({ kind: 'accept' });
  });
  it('does not revive an unused grant when a resolved event trips again', () => {
    const log = [...logs, row({ kind: 'override', event_id: 'review:2', station, grant_id: 'g1', reason: 'old approval' }),
      row({ kind: 'resolve', event_id: 'review:2', station }),
      row({ kind: 'trigger', event_id: 'review:2', station, trigger: 'oscillation' })];
    const history = reduceEscalationHistory(log, 3);
    expect(admitEscalation(history, log, station, 'new').kind).toBe('refused');
    expect(history.grants[0]).toMatchObject({ expired: true, consumed_by: null });
  });
  it('resolves only the accepted station and suppresses identical pending transitions', () => {
    const history = pending();
    expect(escalationTransitions(history, { station, event_id: 'review:2', trigger: 'oscillation', attempt_id: 'new' })).toEqual([]);
    expect(escalationTransitions(history, { station, event_id: 'review:2', trigger: null, attempt_id: 'new' })).toEqual([
      { kind: 'resolve', event_id: 'review:2', station },
    ]);
    expect(escalationTransitions(history, { station: 'prospec-plan', event_id: 'plan:1', trigger: null, attempt_id: 'new' })).toEqual([]);
  });
});
