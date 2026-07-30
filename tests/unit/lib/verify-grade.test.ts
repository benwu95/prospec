import { describe, it, expect } from 'vitest';
import {
  computeGrade,
  resultForGrade,
  gradeAdvancesStatus,
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
