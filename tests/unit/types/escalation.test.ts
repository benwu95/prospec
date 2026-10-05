import { describe, expect, it } from 'vitest';
import { NewQualityLogEntrySchema } from '../../../src/types/change.js';
import { EscalationReportSchema } from '../../../src/types/cascade.js';
import type { EscalationFailureDetails } from '../../../src/types/cascade.js';
import { EscalationError, ProspecError, TestGateError } from '../../../src/types/errors.js';

const entry = { skill: 'prospec-review', date: '2026-10-05', result: 'WARN', warnings: [] };
const event = { kind: 'trigger', event_id: 'review:1', station: 'prospec-review', trigger: 'oscillation' };
const decision = {
  trigger: 'oscillation', station: 'prospec-review', event_id: 'review:1', ordinal: 1,
  exits: [{ id: 'revert-and-redesign', label: 'Revert and redesign', description: 'Reassess the patch.' }],
  recommended: 'revert-and-redesign',
};
const legacy = { type: 'oscillation', message: 'Stop', tradeoffOptions: ['Reassess'], diagnostics: { flips: 2 } };

describe('escalation contracts', () => {
  it('preserves the old report and adds the structured decision', () => {
    expect(EscalationReportSchema.parse(legacy)).toEqual(legacy);
    expect(EscalationReportSchema.parse({ ...legacy, decision })).toEqual({ ...legacy, decision });
  });
  it('keeps the typed event when serializing a new quality entry', () => {
    expect(NewQualityLogEntrySchema.parse({ ...entry, escalation: event })).toEqual({ ...entry, escalation: event });
  });
  it.each([
    { ...event, kind: 'unknown' }, { ...event, trigger: 'signoff' },
    { ...event, station: 'prospec-archive' }, { ...event, event_id: '' },
    { kind: 'override', event_id: 'review:1', station: 'prospec-review', grant_id: 'g1', reason: '   ' },
    { kind: 'consume', event_id: 'review:1', station: 'prospec-review', grant_id: 'g1' },
  ])('refuses malformed sink-owned records: %j', (escalation) => {
    expect(NewQualityLogEntrySchema.safeParse({ ...entry, escalation }).success).toBe(false);
  });
  it.each([
    { ...decision, recommended: 'abandon' }, { ...decision, ordinal: -1 },
    { ...decision, exits: [] }, { ...decision, exits: [...decision.exits, ...decision.exits] },
  ])('refuses decisions with impossible ordinal or recommendation: %j', (invalid) => {
    expect(EscalationReportSchema.safeParse({ ...legacy, decision: invalid }).success).toBe(false);
  });
});

describe('accepted attempt receipt', () => {
  const accepted = { request_id: 'request:one', artifact_digest: 'artifact:one', base_digest: 'base:one' };
  it('retains the receipt beside its accepted attempt id', () => {
    const value = { ...entry, attempt_id: 'attempt:one', accepted };
    expect(NewQualityLogEntrySchema.parse(value)).toEqual(value);
  });
  it('refuses an incomplete accepted receipt', () => {
    expect(NewQualityLogEntrySchema.safeParse({ ...entry, accepted: {} }).success).toBe(false);
  });
});

it('preserves partial persistence and the original cause in both refusal types', () => {
  const cause = new Error('disk full');
  const details: EscalationFailureDetails = {
    history: { events: [], pending: null, grants: [], completeness: 'complete' },
    observed_escalation: {
      trigger: 'persistent_test_failure', station: 'prospec-review',
      event_id: null, ordinal: null, persisted: false,
    },
    persistence: {
      event_persisted: false, metrics_persisted: false, artifact_persisted: false,
      accepted_persisted: false, grant_consumed: false,
    },
  };
  const error = new EscalationError('Event write failed', 'Repair disk, then retry', details, cause);
  expect(error).toBeInstanceOf(ProspecError);
  expect(error.cause).toBe(cause);
  expect(error.details).toEqual(details);
  const testError = new TestGateError({
    changeName: 'fixture', entrance: 'review merge', reason: 'disk full', escalation: details, cause,
  });
  expect(testError.code).toBe('TEST_GATE_REFUSED');
  expect(testError.cause).toBe(cause);
  expect(testError.escalation).toEqual(details);
});
