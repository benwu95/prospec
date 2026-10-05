import { describe, expect, it } from 'vitest';
import type { EscalationRecord, NewQualityLogEntry } from '../../../src/types/change.js';
import { reduceEscalationHistory, legacyEscalationRecords } from '../../../src/lib/escalation.js';

const ledger = (escalation: EscalationRecord): NewQualityLogEntry => ({
  skill: 'prospec-escalation', date: '2026-10-05', result: 'WARN', warnings: [], escalation,
});
const trigger = (event_id: string, station: 'prospec-review' | 'prospec-plan' = 'prospec-review') => ledger({
  kind: 'trigger', event_id, station, trigger: 'oscillation',
});
const flaws = (): NewQualityLogEntry => ({
  skill: 'prospec-plan', date: '2026-10-05', result: 'FAIL', warnings: [], verifier_verdict: 'FLAWS',
});
const legacyReview = (): NewQualityLogEntry => ({
  skill: 'prospec-review', date: '2026-10-05', result: 'WARN', round: 3,
  warnings: ['circuit breaker tripped: oscillation'],
});

describe('chronological escalation history', () => {
  it('deduplicates events across stations and reopens a resolved event without changing its first ordinal', () => {
    const logs = [trigger('review:1'), trigger('plan:one', 'prospec-plan'),
      ledger({ kind: 'resolve', event_id: 'plan:one', station: 'prospec-plan' }), trigger('review:1')];
    const history = reduceEscalationHistory(logs, 3);
    expect(history.events.map((e) => e.ordinal)).toEqual([1, 2]);
    expect(history.pending).toMatchObject({ event_id: 'review:1', ordinal: 1 });
    expect(reduceEscalationHistory([...logs, trigger('review:1')], 3)).toEqual(history);
  });
  it('retains early legacy events when later structured events arrive (R330-7)', () => {
    const history = reduceEscalationHistory([legacyReview(), trigger('review:9')], 3);
    expect(history.events.map((e) => [e.event_id, e.ordinal])).toEqual([['review:3', 1], ['review:9', 2]]);
    expect(history.completeness).toBe('legacy-partial');
  });
  it('counts a proven alias once and does not let a later legacy warning reopen a structured resolution', () => {
    const history = reduceEscalationHistory([legacyReview(), trigger('review:3'),
      ledger({ kind: 'resolve', event_id: 'review:3', station: 'prospec-review' }), legacyReview()], 3);
    expect(history.events).toHaveLength(1);
    expect(history.pending).toBeNull();
    expect(history.completeness).toBe('legacy-partial');
  });
  it('places legacy retries where the configured bound was first crossed, before later review history', () => {
    const history = reduceEscalationHistory([flaws(), flaws(), legacyReview()], 2);
    expect(history.events.map((e) => e.station)).toEqual(['prospec-plan', 'prospec-review']);
    expect(reduceEscalationHistory([flaws(), flaws(), legacyReview()], 3).events).toHaveLength(1);
  });
  it('keeps a legacy event after a new accepted PASS and materializes it without changing first-seen order (R330-4)', () => {
    const logs = [flaws(), flaws()];
    const before = reduceEscalationHistory(logs, 2);
    const records = legacyEscalationRecords(logs, 2);
    const after = reduceEscalationHistory([...logs, ...records.map(ledger), {
      ...flaws(), result: 'PASS', verifier_verdict: 'PASS', attempt_id: 'new-pass',
    }, ledger({ kind: 'resolve', event_id: before.pending!.event_id, station: 'prospec-plan' })], 2);
    expect(after.events).toEqual(before.events);
    expect(after.pending).toBeNull();
    expect(after.completeness).toBe('legacy-partial');
  });
  it('retains grants and consumption across later resolution, without counting them as events', () => {
    const history = reduceEscalationHistory([trigger('review:1'), ledger({
      kind: 'override', event_id: 'review:1', station: 'prospec-review', grant_id: 'g1', reason: 'repair boundary',
    }), ledger({ kind: 'consume', event_id: 'review:1', station: 'prospec-review', grant_id: 'g1', attempt_id: 'a1' }),
    ledger({ kind: 'resolve', event_id: 'review:1', station: 'prospec-review' })], 3);
    expect(history.events).toHaveLength(1);
    expect(history.pending).toBeNull();
    expect(history.grants).toEqual([{
      event_id: 'review:1', station: 'prospec-review', grant_id: 'g1', reason: 'repair boundary', consumed_by: 'a1',
    }]);
  });
  it('keeps a materialized legacy source in its first position after counts replacement', () => {
    const logs = [legacyReview(), trigger('review:9')];
    const before = reduceEscalationHistory(logs, 3);
    const records = legacyEscalationRecords(logs, 3).map(ledger);
    const replacement = { ...legacyReview(), warnings: [], attempt_id: 'accepted-round-3' };
    const after = reduceEscalationHistory([replacement, logs[1]!, ...records], 3);
    expect(after).toEqual(before);
    expect(legacyEscalationRecords([replacement, logs[1]!, ...records], 3)).toEqual([]);
  });
  it('discloses historical override reasons without inventing a usable grant', () => {
    const history = reduceEscalationHistory([{
      ...flaws(), verifier_verdict: undefined, result: 'WARN', warnings: ['Manual override: explain the exception'],
    }], 2);
    expect(history.events).toEqual([]);
    expect(history.grants[0]).toMatchObject({ event_id: null, grant_id: null, reason: 'explain the exception', legacy: true });
    expect(history.completeness).toBe('legacy-partial');
  });
  it('does not infer another event from structured accepted outcomes or count unrelated halts', () => {
    const logs = Array.from({ length: 4 }, (_, i) => ({ ...flaws(), attempt_id: `a${i}` }));
    expect(reduceEscalationHistory(logs, 2).events).toEqual([]);
    expect(reduceEscalationHistory([{ ...flaws(), verifier_verdict: undefined, warnings: ['KNOWLEDGE_INPUT_INVALID'] }], 2).events).toEqual([]);
  });
});


it('R330-reviewer: a legacy override below the bound does not fabricate a later retry crossing', async () => {
  const { planningFlawsStreak, latestVerifierResult } = await import('../../../src/lib/escalation.js');
  const log: NewQualityLogEntry[] = [flaws(), flaws(), {
    skill: 'prospec-plan', date: '2026-10-05', result: 'WARN', warnings: ['Manual override: accepted historical exception'],
  }, flaws()];
  expect(planningFlawsStreak(log, 'prospec-plan')).toBe(1);
  expect(latestVerifierResult(log, 'prospec-plan')).toBe('FAIL');
  const history = reduceEscalationHistory(log, 3);
  expect(history.events).toEqual([]);
  expect(history.pending).toBeNull();
});

it.each(['prospec-plan', 'prospec-review'] as const)('an unbound legacy override cannot clear a pending %s event', (station) => {
  const log = [flaws(), flaws(), trigger('pending', station), {
    ...flaws(), result: 'WARN' as const, verifier_verdict: undefined, warnings: ['Manual override: historical exception'],
  }];
  const history = reduceEscalationHistory(log, 3);
  expect(history.events.map(e => e.event_id)).toEqual(['pending']);
  expect(history.pending).toMatchObject({ event_id: 'pending', station });
  expect(history.grants).toEqual([expect.objectContaining({ event_id: null, grant_id: null, legacy: true })]);
});

describe('legacy review resolution provenance', () => {
  const clean = { skill: 'prospec-review', date: '2026-10-05', result: 'PASS' as const, warnings: [], round: 4 };
  const close = { ...clean, round: undefined };
  it('requires clean counts followed by a close, preserving the event and expiring unused grants', () => {
    const grant = ledger({ kind: 'override', event_id: 'review:3', station: 'prospec-review', grant_id: 'g', reason: 'inspect' });
    const history = reduceEscalationHistory([legacyReview(), grant, clean, close], 3);
    expect(history.events).toHaveLength(1);
    expect(history.pending).toBeNull();
    expect(history.grants[0]).toMatchObject({ expired: true, consumed_by: null });
  });
  it.each([
    ['bare PASS', [close]],
    ['counts without close', [clean]],
    ['WARN close', [clean, { ...close, result: 'WARN', warnings: ['Manual override: historical reason'] }]],
    ['accepted receipt instead of close', [clean, { ...close, accepted: { request_id: 'request' }, attempt_id: 'attempt' }]],
  ])('does not resolve a legacy event using %s', (_name, tail) => {
    expect(reduceEscalationHistory([legacyReview(), ...(tail as NewQualityLogEntry[])], 3).pending?.event_id).toBe('review:3');
  });
  it('requires a dedicated resolution once a legacy anchor has a structured trigger', () => {
    expect(reduceEscalationHistory([legacyReview(), trigger('review:3'), clean, close], 3).pending?.event_id).toBe('review:3');
  });
});
