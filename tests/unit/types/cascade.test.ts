import { describe, it, expect } from 'vitest';
import {
  CircuitBreakerConfigSchema,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  EMPTY_TEST_FAILURE_STREAK,
  EscalationReportSchema,
  PersistentTestFailureDiagnosticsSchema,
  TestFailureStreakSchema,
} from '../../../src/types/cascade.js';

describe('CircuitBreakerConfigSchema.maxConsecutiveTestFailures (REQ-TYPES-086)', () => {
  it('defaults to three independently of the other thresholds', () => {
    const parsed = CircuitBreakerConfigSchema.parse({});
    expect(parsed.maxConsecutiveTestFailures).toBe(3);
    expect(DEFAULT_CIRCUIT_BREAKER_CONFIG.maxConsecutiveTestFailures).toBe(3);
    // Independent single source: changing the round cap or the flip cap leaves it alone.
    expect(
      CircuitBreakerConfigSchema.parse({ maxReviewRounds: 5, maxOscillationFlips: 4 })
        .maxConsecutiveTestFailures,
    ).toBe(3);
  });

  it('accepts a non-default positive integer such as four', () => {
    expect(
      CircuitBreakerConfigSchema.parse({ maxConsecutiveTestFailures: 4 }).maxConsecutiveTestFailures,
    ).toBe(4);
  });

  it.each([0, -1, 1.5])('rejects %s — the threshold is a positive integer', (value) => {
    expect(
      CircuitBreakerConfigSchema.safeParse({ maxConsecutiveTestFailures: value }).success,
    ).toBe(false);
  });
});

describe('TestFailureStreakSchema (REQ-TYPES-086)', () => {
  it('starts empty: zero observed failures and no retained attempt ids', () => {
    expect(EMPTY_TEST_FAILURE_STREAK).toEqual({ consecutiveTestFailures: 0, testFailureAttemptIds: [] });
    expect(TestFailureStreakSchema.parse(EMPTY_TEST_FAILURE_STREAK)).toEqual(EMPTY_TEST_FAILURE_STREAK);
  });

  it('rejects a negative count, a non-integer count and an empty attempt id', () => {
    expect(TestFailureStreakSchema.safeParse({ consecutiveTestFailures: -1, testFailureAttemptIds: [] }).success).toBe(false);
    expect(TestFailureStreakSchema.safeParse({ consecutiveTestFailures: 1.5, testFailureAttemptIds: ['a'] }).success).toBe(false);
    expect(TestFailureStreakSchema.safeParse({ consecutiveTestFailures: 1, testFailureAttemptIds: [''] }).success).toBe(false);
  });
});

describe('persistent_test_failure diagnostics (REQ-TYPES-086, REQ-LIB-057)', () => {
  it('is a typed count/threshold/attempt-id shape the breaker emits', () => {
    const diagnostics = { count: 3, threshold: 3, attemptIds: ['a', 'b', 'c'] };
    expect(PersistentTestFailureDiagnosticsSchema.parse(diagnostics)).toEqual(diagnostics);
    expect(PersistentTestFailureDiagnosticsSchema.safeParse({ count: 3, threshold: 0, attemptIds: [] }).success).toBe(false);
  });

  it('keeps persistent_test_failure in the escalation enum the report carries', () => {
    const report = EscalationReportSchema.parse({
      type: 'persistent_test_failure',
      message: 'm',
      diagnostics: { count: 3, threshold: 3, attemptIds: ['a', 'b', 'c'] },
      tradeoffOptions: ['ESCALATE_TO_HUMAN'],
    });
    expect(report.type).toBe('persistent_test_failure');
  });
});
