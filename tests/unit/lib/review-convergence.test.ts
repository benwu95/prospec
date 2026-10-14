import { describe, expect, it } from 'vitest';
import { ReviewCircuitBreaker } from '../../../src/lib/review-circuit-breaker.js';
import {
  mergeFindings, mergeFindingsWithActivity, parseReviewRows, parseReviewMetrics, parseReviewMetricsStrict,
  renderReviewDocument, renderReviewMetricsComment, replaceReviewMetrics, reviewArtifactDigest,
  withReviewReceipt, type ReviewRow,
} from '../../../src/lib/review-merge.js';

const row = (patch: Partial<ReviewRow> = {}): ReviewRow => ({
  id: 'A', location: 'a.ts:1', severity: 'minor', lens: 'correctness', status: 'open', summary: 'a', ...patch,
});

describe('merge activity', () => {
  it.each([
    { name: 'new', before: [], incoming: [row()], active: true },
    { name: 'unchanged advisory', before: [row()], incoming: [row()], active: false },
    { name: 'prose and location', before: [row()], incoming: [row({ summary: 'b', location: 'b:3' })], active: false },
    { name: 'resolved', before: [row()], incoming: [row({ status: 'fixed' })], active: false },
    { name: 'reopen', before: [row({ status: ' FIXED ' })], incoming: [row()], active: true },
    { name: 'severity', before: [row()], incoming: [row({ severity: 'major' })], active: true },
    { name: 'idless reopen', before: [row({ id: undefined, status: 'verified' })], incoming: [row({ id: undefined })], active: true },
    { name: 'duplicate id intermediate reopen', before: [row({ status: 'fixed' })], incoming: [row(), row({ status: 'fixed' })], active: true },
  ])('$name', ({ before, incoming, active }) => {
    const result = mergeFindingsWithActivity(before, incoming, 2);
    expect(result.activity).toBe(active);
    expect(result.rows).toEqual(mergeFindings(before, incoming, 2));
  });
});

describe('round activity metrics', () => {
  it.each([true, false])('preserves %s through render, receipt, digest and failure splice', (roundActivity) => {
    const comment = renderReviewMetricsComment({ round: 2, roundActivity });
    const rendered = renderReviewDocument(comment, [row()], 'c');
    const updated = renderReviewDocument(rendered, [row()], 'c', { round: 2 });
    const receipt = { request_id: 'a'.repeat(64), attempt_id: `prospec-review:${'b'.repeat(64)}`, base_digest: 'c'.repeat(64), artifact_digest: 'd'.repeat(64) };
    const withReceipt = withReviewReceipt(updated, receipt);
    const failure = replaceReviewMetrics(withReceipt, { consecutiveTestFailures: 1, testFailureAttemptIds: ['failed'] });
    for (const content of [comment, rendered, updated, withReceipt, failure]) {
      expect(parseReviewMetricsStrict(content).roundActivity).toBe(roundActivity);
    }
    expect(reviewArtifactDigest(comment)).not.toBe(reviewArtifactDigest(renderReviewMetricsComment({ round: 2, roundActivity: !roundActivity })));
  });
  it('refuses unterminated and duplicate comments before activity normalization', () => {
    const valid = '<!-- prospec:review-metrics round="2" round_activity="false" -->';
    for (const tail of [valid, '<!-- prospec:review-metrics round_activity=false -->', '<!-- prospec:review-metrics round="2" round_activity="false"']) {
      expect(() => parseReviewMetricsStrict(`${valid}\n${tail}`)).toThrow();
    }
    const incomplete = '<!-- prospec:review-metrics round="2" round_activity="false"';
    expect(() => parseReviewMetricsStrict(incomplete)).toThrow();
    expect(parseReviewMetrics(incomplete).roundActivity).toBeUndefined();
  });
  it('does not carry previous round activity to a new round without evidence', () => {
    const content = renderReviewMetricsComment({ round: 2, roundActivity: false });
    expect(parseReviewMetricsStrict(renderReviewDocument(content, [], 'c', { round: 3 })).roundActivity).toBeUndefined();
    expect(parseReviewMetricsStrict('<!-- prospec:review-metrics round="2" -->').roundActivity).toBeUndefined();
  });
  it.each([
    'round="2" round_activity="no"', 'round_activity="false"',
    'round="2x" round_activity="false"', 'round="0" round_activity="true"',
    'round="-1" round_activity="false"', 'round="1.5" round_activity="false"',
    'round="2" round_activity=false', "round=\"2\" round_activity='false'",
    'round="2" round_activity="true" round_activity="false"',
    'round="2" round_activity="false" round_activity="true"',
    'round="1" round="2" round_activity="false"',
    'round=2 round_activity="false"', 'round="2"round_activity="false"',
    'round="2" round_activity="false" garbage',

  ])('refuses invalid activity %s', (attrs) => {
    const content = `<!-- prospec:review-metrics ${attrs} -->`;
    expect(() => parseReviewMetricsStrict(content)).toThrow();
    expect(parseReviewMetrics(content).roundActivity).toBeUndefined();
  });
});

describe('historical breaker recovery', () => {
  const history = [row({ origin_round: 1, status: 'fixed' }), row({ id: 'B', origin_round: 2, status: 'fixed' })];
  it.each(['fixed', 'verified', 'not-found', 'dropped', 'invalid', ' FIXED '])('retains ratio with all %s', (status) => {
    const breaker = new ReviewCircuitBreaker();
    [false, true, false, true].forEach(passed => breaker.recordTrial('A', passed));
    const result = breaker.checkCircuitBreaker({ round: 3, findings: [...history, row({ id: 'C', origin_round: 2, status })] });
    expect(result.tripped).toBe(false);
    expect(result.fixInducedRatio).toBe(status === 'not-found' || status === 'dropped' || status === 'invalid' ? 0.5 : 2 / 3);
    expect(breaker.getRecord('A')?.trials).toEqual([false, true, false, true]);
  });
  it.each(['minor', 'major'])('allows carried %s only with false activity', (severity) => {
    const breaker = new ReviewCircuitBreaker();
    const findings = [...history, { origin_round: 2, status: 'open', severity }];
    for (const roundActivity of [undefined, true, false]) {
      const result = breaker.checkCircuitBreaker({ round: 3, findings, roundActivity });
      expect(result.tripped).toBe(roundActivity !== false);
      expect(result.fixInducedRatio).toBe(2 / 3);
    }
  });
  it.each(['critical', 'unknown', undefined])('does not exempt unresolved severity %s', (severity) => {
    expect(new ReviewCircuitBreaker().checkCircuitBreaker({ round: 3, roundActivity: false,
      findings: [...history, { origin_round: 2, severity }],
    }).tripped).toBe(true);
  });
  it('keeps missing snapshot conservative and explicit empty converged', () => {
    const breaker = new ReviewCircuitBreaker();
    [false, true, false].forEach(passed => breaker.recordTrial('A', passed));
    expect(breaker.checkCircuitBreaker({ roundActivity: false }).tripped).toBe(true);
    expect(breaker.checkCircuitBreaker({ findings: [] }).tripped).toBe(false);
    expect(breaker.checkCircuitBreaker({ findings: [row()], roundActivity: false }).tripped).toBe(false);
    expect(breaker.checkCircuitBreaker({ findings: [row()], roundActivity: true }).tripped).toBe(true);
  });
  it('still prioritizes persistent test failure after convergence', () => {
    const breaker = new ReviewCircuitBreaker();
    breaker.setTestFailureStreak({ consecutiveTestFailures: 3, testFailureAttemptIds: ['a', 'b', 'c'] });
    expect(breaker.checkCircuitBreaker({ findings: [], roundActivity: false }).escalationReport?.type).toBe('persistent_test_failure');
  });
});


describe('unrecognized artifact severity', () => {
  it.each(['urgent', '', '   '])('preserves %j across render and only clears on a supplied finding', severity => {
    const artifact = renderReviewDocument('', [row({ severity: 'major', origin_round: 2 })], 'c', { round: 2 });
    const invalid = artifact.replace('| major |', `| ${severity} |`);
    const parsed = parseReviewRows(invalid);
    expect(parsed[0]?.unrecognizedSeverity).toBe(severity.trim());
    const carried = mergeFindingsWithActivity(parsed, [], 3);
    const roundTrip = parseReviewRows(renderReviewDocument(invalid, carried.rows, 'c', { round: 3, roundActivity: false }));
    const breaker = new ReviewCircuitBreaker();
    expect(breaker.checkCircuitBreaker({ round: 3, findings: roundTrip, roundActivity: false }).tripped).toBe(true);
    expect(breaker.checkCircuitBreaker({ round: 3, findings: roundTrip.map(r => ({ ...r, status: 'fixed' })), roundActivity: false }).tripped).toBe(false);
    const corrected = mergeFindingsWithActivity(roundTrip, [row({ severity: 'major' })], 4);
    expect(corrected.rows[0]?.unrecognizedSeverity).toBeUndefined();
    expect(breaker.checkCircuitBreaker({ round: 4, findings: corrected.rows, roundActivity: false }).tripped).toBe(false);
  });
});
