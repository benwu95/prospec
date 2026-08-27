import { describe, it, expect } from 'vitest';
import {
  countFlips,
  isOscillating,
  calculateFixInducedRatio,
  OscillationBreaker,
} from '../../../src/lib/oscillation-breaker.js';

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

describe('calculateFixInducedRatio (REQ-LIB-061)', () => {
  it('returns 0 in round 1 or for empty findings', () => {
    expect(calculateFixInducedRatio([], 1)).toBe(0);
    expect(calculateFixInducedRatio([{ origin_round: 2 }], 1)).toBe(0);
    expect(calculateFixInducedRatio([], 2)).toBe(0);
  });

  it('calculates the ratio of findings with origin_round > 1 in rounds > 1', () => {
    const findings = [
      { origin_round: 1 },
      { origin_round: 2 },
      { origin_round: 2 },
      { origin_round: 1 },
    ];
    expect(calculateFixInducedRatio(findings, 2)).toBe(0.5); // 2 out of 4 = 50%
  });
});

describe('OscillationBreaker', () => {
  it('initializes untripped with default configuration', () => {
    const breaker = new OscillationBreaker();
    const state = breaker.checkCircuitBreaker();
    expect(state.tripped).toBe(false);
    expect(state.reviewRounds).toBe(0);
    expect(state.oscillatingSignatures).toEqual([]);
  });

  it('records trials per signature independently', () => {
    const breaker = new OscillationBreaker();
    breaker.recordTrial('test-a', false);
    breaker.recordTrial('test-a', true);
    breaker.recordTrial('test-b', false);

    expect(breaker.getRecord('test-a')?.trials).toEqual([false, true]);
    expect(breaker.getRecord('test-a')?.consecutiveFlips).toBe(1);
    expect(breaker.getRecord('test-b')?.trials).toEqual([false]);
    expect(breaker.getRecord('test-b')?.consecutiveFlips).toBe(0);
  });

  it('trips circuit breaker and generates escalation report on oscillation', () => {
    const breaker = new OscillationBreaker();
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

  it('trips dual-axis circuit breaker when fix-induced ratio exceeds threshold in round > 1 (REQ-LIB-061)', () => {
    const breaker = new OscillationBreaker({ maxFixInducedRatio: 0.5 });
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

  it('trips dual-axis circuit breaker when cumulative spend exceeds budget (REQ-LIB-061)', () => {
    const breaker = new OscillationBreaker({ maxSpend: 10000 });
    breaker.recordSpend(6000);
    expect(breaker.checkCircuitBreaker({ round: 1 }).tripped).toBe(false);

    // Add spend taking cumulative to 11,000 > 10,000
    const state = breaker.checkCircuitBreaker({ round: 2, spend: 5000 });
    expect(state.tripped).toBe(true);
    expect(state.escalationReport?.type).toBe('spend_budget_exceeded');
    expect(state.reason).toContain('11000 tokens');
    expect(state.cumulativeSpend).toBe(11000);
  });

  it('trips circuit breaker when review rounds reach hard cap', () => {
    const breaker = new OscillationBreaker({ maxReviewRounds: 3 });
    breaker.incrementReviewRound();
    expect(breaker.checkCircuitBreaker().tripped).toBe(false);

    breaker.incrementReviewRound();
    expect(breaker.checkCircuitBreaker().tripped).toBe(false);

    breaker.incrementReviewRound(); // round 3
    const state = breaker.checkCircuitBreaker();
    expect(state.tripped).toBe(true);
    expect(state.escalationReport?.type).toBe('max_rounds_exceeded');
    expect(state.reason).toContain('hard cap of 3 rounds');
  });

  it('resets tracking state upon reset()', () => {
    const breaker = new OscillationBreaker();
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
