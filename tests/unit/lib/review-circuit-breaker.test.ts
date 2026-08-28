import { describe, it, expect } from 'vitest';
import {
  countFlips,
  isOscillating,
  calculateFixInducedRatio,
  ReviewCircuitBreaker,
} from '../../../src/lib/review-circuit-breaker.js';

describe('countFlips', () => {
  it('returns 0 for empty or single trial', () => {
    expect(countFlips([])).toBe(0);
    expect(countFlips([true])).toBe(0);
    expect(countFlips([false])).toBe(0);
  });

  it('counts alternating transitions correctly', () => {
    expect(countFlips([false, true, false])).toBe(2);
    expect(countFlips([true, false, true, false])).toBe(3);
    expect(countFlips([false, false, true, true])).toBe(1);
    expect(countFlips([true, true, true])).toBe(0);
  });
});

describe('isOscillating', () => {
  it('detects oscillation at or above flip threshold', () => {
    expect(isOscillating([false, true, false], 2)).toBe(true);
    expect(isOscillating([false, true], 2)).toBe(false);
    expect(isOscillating([false, false, true], 2)).toBe(false);
  });
});

describe('calculateFixInducedRatio (REQ-LIB-063)', () => {
  it('returns 0 in round 1 or for empty findings', () => {
    expect(calculateFixInducedRatio([], 1)).toBe(0);
    expect(calculateFixInducedRatio([{ origin_round: 2 }], 1)).toBe(0);
    expect(calculateFixInducedRatio([], 2)).toBe(0);
  });

  it('calculates the ratio of findings with origin_round > baseRound in rounds > 1', () => {
    const findings = [
      { origin_round: 1 },
      { origin_round: 2 },
      { origin_round: 2 },
      { origin_round: 1 },
    ];
    expect(calculateFixInducedRatio(findings, 2)).toBe(0.5); // 2 out of 4 = 50%
  });

  it('ignores dismissed findings (not-found, invalid, dropped) from ratio calculation', () => {
    const findings = [
      { origin_round: 1, status: 'open' },
      { origin_round: 2, status: 'not-found' },
      { origin_round: 2, status: 'open' },
    ];
    // 2 active findings (1 from r1, 1 from r2) -> 1/2 = 50%
    expect(calculateFixInducedRatio(findings, 2)).toBe(0.5);
  });

  it('honors baseRound in multi-loop re-reviews', () => {
    const findings = [
      { origin_round: 1, status: 'fixed' },
      { origin_round: 4, status: 'open' }, // in new loop (baseRound 4)
      { origin_round: 5, status: 'open' }, // fix-induced in new loop
    ];
    expect(calculateFixInducedRatio(findings, 5, 4)).toBe(1 / 3);
  });
});

describe('ReviewCircuitBreaker', () => {
  it('initializes untripped with default configuration', () => {
    const breaker = new ReviewCircuitBreaker();
    const state = breaker.checkCircuitBreaker();
    expect(state.tripped).toBe(false);
    expect(state.reviewRounds).toBe(0);
    expect(state.oscillatingSignatures).toEqual([]);
  });

  it('validates configuration bounds via Zod schema (1-5 rounds)', () => {
    expect(() => new ReviewCircuitBreaker({ maxReviewRounds: 0 })).toThrow();
    expect(() => new ReviewCircuitBreaker({ maxReviewRounds: 6 })).toThrow();
    expect(new ReviewCircuitBreaker({ maxReviewRounds: 5 })).toBeDefined();
  });

  it('validates fix-induced ratio (0-1) and spend (non-negative) bounds via Zod schema', () => {
    expect(() => new ReviewCircuitBreaker({ maxFixInducedRatio: 1.5 })).toThrow();
    expect(() => new ReviewCircuitBreaker({ maxFixInducedRatio: -0.1 })).toThrow();
    expect(() => new ReviewCircuitBreaker({ maxSpend: -1 })).toThrow();
    expect(new ReviewCircuitBreaker({ maxFixInducedRatio: 1, maxSpend: 0 })).toBeDefined();
  });

  it('records trials per signature independently', () => {
    const breaker = new ReviewCircuitBreaker();
    breaker.recordTrial('test-a', false);
    breaker.recordTrial('test-a', true);
    breaker.recordTrial('test-b', false);

    expect(breaker.getRecord('test-a')?.trials).toEqual([false, true]);
    expect(breaker.getRecord('test-a')?.consecutiveFlips).toBe(1);
    expect(breaker.getRecord('test-b')?.trials).toEqual([false]);
    expect(breaker.getRecord('test-b')?.consecutiveFlips).toBe(0);
  });

  it('trips circuit breaker and generates escalation report on oscillation', () => {
    const breaker = new ReviewCircuitBreaker();
    breaker.recordTrial('defect-101', false); // FAIL
    breaker.recordTrial('defect-101', true);  // PASS
    breaker.recordTrial('defect-101', false); // FAIL (2nd flip -> oscillation)

    expect(breaker.detectOscillation('defect-101')).toBe(true);
    expect(breaker.getOscillatingSignatures()).toEqual(['defect-101']);

    const state = breaker.checkCircuitBreaker();
    expect(state.tripped).toBe(true);
    expect(state.reason).toContain('defect-101');
    expect(state.escalationReport).toBeDefined();
    expect(state.escalationReport?.type).toBe('oscillation');
    expect(state.escalationReport?.tradeoffOptions.length).toBeGreaterThan(0);
  });

  it('trips dual-axis circuit breaker when fix-induced ratio exceeds threshold in round > 1 (REQ-LIB-063)', () => {
    const breaker = new ReviewCircuitBreaker({ maxFixInducedRatio: 0.5 });
    // Round 1 with 1 finding: ratio is 0
    expect(
      breaker.checkCircuitBreaker({
        round: 1,
        findings: [{ origin_round: 1 }],
      }).tripped,
    ).toBe(false);

    // Round 2 with 3 findings (2 of which are fix-induced = 66.7% > 50%)
    const state = breaker.checkCircuitBreaker({
      round: 2,
      findings: [{ origin_round: 1 }, { origin_round: 2 }, { origin_round: 2 }],
    });
    expect(state.tripped).toBe(true);
    expect(state.escalationReport?.type).toBe('fix_induced_threshold_exceeded');
    expect(state.reason).toContain('Fix-induced defect ratio');
    expect(state.escalationReport?.tradeoffOptions[0]).toContain('revert-and-redesign');
  });

  it('trips dual-axis circuit breaker when cumulative spend exceeds budget (REQ-LIB-063)', () => {
    const breaker = new ReviewCircuitBreaker({ maxSpend: 10000 });
    breaker.recordSpend(6000);
    expect(breaker.checkCircuitBreaker({ round: 1 }).tripped).toBe(false);

    // The caller records spend (cumulative 11,000 > 10,000); checkCircuitBreaker
    // is a pure query that reads the recorded spend read-only.
    breaker.recordSpend(5000);
    const state = breaker.checkCircuitBreaker({ round: 2 });
    expect(state.tripped).toBe(true);
    expect(state.escalationReport?.type).toBe('spend_budget_exceeded');
    expect(state.reason).toContain('11000 tokens');
    expect(state.cumulativeSpend).toBe(11000);
  });

  it('checkCircuitBreaker is a pure query — repeated calls do not mutate recorded state (REQ-LIB-063)', () => {
    const breaker = new ReviewCircuitBreaker({ maxFixInducedRatio: 0.5, maxSpend: 10000 });
    breaker.recordSpend(6000);
    const findings = [{ origin_round: 1 }, { origin_round: 2 }, { origin_round: 2 }];

    const first = breaker.checkCircuitBreaker({ round: 2, findings });
    const second = breaker.checkCircuitBreaker({ round: 2, findings });

    // Identical inputs -> identical output, and the query never accumulates spend.
    expect(second).toEqual(first);
    expect(breaker.getCumulativeSpend()).toBe(6000);
    expect(first.cumulativeSpend).toBe(6000);
    expect(first.fixInducedRatio).toBeCloseTo(2 / 3);
    expect(first.escalationReport?.type).toBe('fix_induced_threshold_exceeded');
  });

  it('trips circuit breaker when review rounds reach hard cap with unresolved criticals', () => {
    const breaker = new ReviewCircuitBreaker({ maxReviewRounds: 3 });
    breaker.incrementReviewRound();
    breaker.incrementReviewRound();
    breaker.incrementReviewRound(); // round 3

    // Round 3 with an unresolved critical -> trips
    const state = breaker.checkCircuitBreaker({
      round: 3,
      findings: [{ severity: 'critical', status: 'open' }],
    });
    expect(state.tripped).toBe(true);
    expect(state.escalationReport?.type).toBe('max_rounds_exceeded');
    expect(state.reason).toContain('hard cap of 3 rounds');
  });

  it('does NOT trip circuit breaker on hard cap when all criticals are resolved', () => {
    const breaker = new ReviewCircuitBreaker({ maxReviewRounds: 3 });
    breaker.incrementReviewRound();
    breaker.incrementReviewRound();
    breaker.incrementReviewRound(); // round 3

    // Round 3 with resolved critical -> does not trip hard cap
    const state = breaker.checkCircuitBreaker({
      round: 3,
      findings: [{ severity: 'critical', status: 'fixed' }],
    });
    expect(state.tripped).toBe(false);
  });

  it('resets tracking state upon reset()', () => {
    const breaker = new ReviewCircuitBreaker();
    breaker.recordTrial('test-x', false);
    breaker.incrementReviewRound();
    breaker.recordSpend(500);
    expect(breaker.getRecord('test-x')).toBeDefined();
    expect(breaker.getCumulativeSpend()).toBe(500);

    breaker.reset();
    expect(breaker.getRecord('test-x')).toBeUndefined();
    expect(breaker.getCumulativeSpend()).toBe(0);
    expect(breaker.checkCircuitBreaker().reviewRounds).toBe(0);
  });
});
