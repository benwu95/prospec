import { describe, it, expect } from 'vitest';
import {
  computeGrade,
  resultForGrade,
  gradeAdvancesStatus,
  isSelfVerified,
  applySelfVerifiedCap,
  GRADE_A_WARN_BUDGET,
  GRADE_C_FAIL_CEILING,
} from '../../../src/lib/verify-grade.js';
import type { QualityDimension } from '../../../src/types/change.js';

const dim = (name: string, result: QualityDimension['result']): QualityDimension => ({
  name,
  result,
  adjudicator: ['task-completion', 'knowledge', 'tests'].includes(name) ? 'machine' : 'judgment',
});

const allPass: QualityDimension[] = [
  dim('task-completion', 'PASS'),
  dim('delta-spec-compliance', 'PASS'),
  dim('constitution', 'PASS'),
  dim('knowledge', 'PASS'),
  dim('tests', 'PASS'),
  dim('design', 'not-applicable'),
];

describe('computeGrade', () => {
  it('grades S when every dimension is PASS/not-applicable and no warnings', () => {
    expect(computeGrade(allPass, [])).toBe('S');
  });

  it('grades A within the ≤2 WARN budget', () => {
    const dims = allPass.map((d) => (d.name === 'constitution' ? dim(d.name, 'WARN') : d));
    expect(computeGrade(dims, ['SHOULD violation: README not updated'])).toBe('A');
    expect(computeGrade(allPass, ['w1', 'w2'])).toBe('A');
    expect(GRADE_A_WARN_BUDGET).toBe(2);
  });

  it('grades B when warnings exceed the budget, with no FAIL', () => {
    expect(computeGrade(allPass, ['w1', 'w2', 'w3'])).toBe('B');
  });

  it('grades C on 1-2 FAILed dimensions and D above the ceiling', () => {
    const oneFail = allPass.map((d) => (d.name === 'tests' ? dim(d.name, 'FAIL') : d));
    expect(computeGrade(oneFail, [])).toBe('C');
    const threeFails = allPass.map((d, i) => (i < 3 ? dim(d.name, 'FAIL') : d));
    expect(computeGrade(threeFails, [])).toBe('D');
    expect(GRADE_C_FAIL_CEILING).toBe(2);
  });

  it('a FAIL caps the grade regardless of how many warnings there are', () => {
    const oneFail = allPass.map((d) => (d.name === 'tests' ? dim(d.name, 'FAIL') : d));
    expect(computeGrade(oneFail, [])).toBe('C');
    expect(computeGrade(oneFail, ['w1', 'w2', 'w3', 'w4'])).toBe('C');
  });

  it('post-#107: not-adjudicated consumes the budget — no exemption class', () => {
    const oneNotAdjudicated = allPass.map((d) =>
      d.name === 'knowledge' ? dim(d.name, 'not-adjudicated') : d,
    );
    // S unreachable, lands at A (1 effective WARN)…
    expect(computeGrade(oneNotAdjudicated, [])).toBe('A');
    // …and it COUNTS: with 2 more budget-counted warnings it tips past A to B.
    expect(computeGrade(oneNotAdjudicated, ['w1', 'w2', 'w3'])).toBe('B');
  });

  it('a WARN dimension with no warning string still consumes the budget', () => {
    const warnDims = allPass.map((d, i) => (i < 3 ? dim(d.name, 'WARN') : d));
    expect(computeGrade(warnDims, [])).toBe('B');
  });

  it('is deterministic — same input recomputes bit-identically', () => {
    const dims = allPass.map((d) => (d.name === 'constitution' ? dim(d.name, 'WARN') : d));
    const runs = new Set(
      Array.from({ length: 5 }, () => computeGrade(dims, ['one warning'])),
    );
    expect(runs.size).toBe(1);
  });
});

describe('isSelfVerified / in-session grade cap', () => {
  const inSession = (name: string): QualityDimension => ({
    ...dim(name, 'PASS'),
    graded_by: 'in-session',
  });
  const freshSubagent = (name: string): QualityDimension => ({
    ...dim(name, 'PASS'),
    graded_by: 'fresh-subagent',
  });

  it('isSelfVerified is true only when a dimension is graded in-session', () => {
    expect(isSelfVerified(allPass)).toBe(false);
    expect(isSelfVerified(allPass.map((d) => freshSubagent(d.name)))).toBe(false);
    expect(
      isSelfVerified(allPass.map((d) => (d.name === 'constitution' ? inSession(d.name) : d))),
    ).toBe(true);
  });

  it('caps an otherwise-S run at A when any judgment dimension is graded in-session', () => {
    const dims = allPass.map((d) => (d.name === 'delta-spec-compliance' ? inSession(d.name) : d));
    expect(computeGrade(dims, [])).toBe('A');
  });

  it('keeps S reachable when every judgment dimension is graded fresh-subagent', () => {
    const dims = allPass.map((d) =>
      ['delta-spec-compliance', 'constitution'].includes(d.name) ? freshSubagent(d.name) : d,
    );
    expect(computeGrade(dims, [])).toBe('S');
  });

  it('does not push an already-warned run below A — the cap only blocks S', () => {
    // 2 real WARNs → A; adding in-session grading must not tip it to B.
    const dims = allPass.map((d) => (d.name === 'constitution' ? inSession(d.name) : d));
    expect(computeGrade(dims, ['w1', 'w2'])).toBe('A');
    // machine dimensions never carry graded_by, so they never trip the cap
    expect(isSelfVerified(allPass.map((d) => (d.name === 'tests' ? { ...d, graded_by: undefined } : d)))).toBe(false);
  });
});

describe('applySelfVerifiedCap', () => {
  const judgmentDim = (graded_by: QualityDimension['graded_by']): QualityDimension => ({
    name: 'constitution',
    result: 'PASS',
    adjudicator: 'judgment',
    graded_by,
  });

  it('caps S at A when the full judgment set carries an in-session dimension the grade inputs excluded', () => {
    expect(applySelfVerifiedCap('S', [judgmentDim('in-session')])).toBe('A');
  });

  it('leaves S untouched when every judgment dimension is fresh-subagent', () => {
    expect(applySelfVerifiedCap('S', [judgmentDim('fresh-subagent')])).toBe('S');
  });

  it('never moves a non-S grade — the cap only blocks the top grade', () => {
    expect(applySelfVerifiedCap('A', [judgmentDim('in-session')])).toBe('A');
    expect(applySelfVerifiedCap('B', [judgmentDim('in-session')])).toBe('B');
    expect(applySelfVerifiedCap('D', [judgmentDim('in-session')])).toBe('D');
  });
});

describe('resultForGrade / gradeAdvancesStatus', () => {
  it('maps grades onto the gate three-state (grade never leaks into result)', () => {
    expect(resultForGrade('S')).toBe('PASS');
    expect(resultForGrade('A')).toBe('PASS');
    expect(resultForGrade('B')).toBe('WARN');
    expect(resultForGrade('C')).toBe('FAIL');
    expect(resultForGrade('D')).toBe('FAIL');
  });

  it('only S/A graduate to verified', () => {
    expect(gradeAdvancesStatus('S')).toBe(true);
    expect(gradeAdvancesStatus('A')).toBe(true);
    expect(gradeAdvancesStatus('B')).toBe(false);
    expect(gradeAdvancesStatus('C')).toBe(false);
    expect(gradeAdvancesStatus('D')).toBe(false);
  });
});
