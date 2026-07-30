import type { QualityDimension, VerifyGrade, GateResult } from '../types/change.js';

/**
 * The /prospec-verify S/A/B/C/D decision table as a pure function — the
 * executable copy of the grading rules in `skills/prospec-verify.hbs`.
 *
 * Post-#107 there is NO engine-unavailability WARN exemption class: the CLI is
 * a required file, so "the engine could not run" is a STOP before verify ever
 * grades — every WARN counts against grade A's budget. A `not-adjudicated`
 * dimension (an individual check honestly skipped, e.g. a non-git checkout)
 * still makes S unreachable and consumes the budget like any other WARN.
 *
 * Inputs are the GRADE-INPUT dimensions only — the caller applies scale rules
 * (e.g. `scale: backfill` records 3/5 and 5/5 but excludes them from grading)
 * before calling; this function never re-derives scale policy.
 */

/** Grade A tolerates at most this many budget-counted WARNs. */
export const GRADE_A_WARN_BUDGET = 2;

/** Grade C tolerates at most this many FAILed dimensions; more is D. */
export const GRADE_C_FAIL_CEILING = 2;

export function computeGrade(
  dimensions: QualityDimension[],
  warnings: string[],
): VerifyGrade {
  const failCount = dimensions.filter((d) => d.result === 'FAIL').length;
  if (failCount > GRADE_C_FAIL_CEILING) return 'D';
  if (failCount > 0) return 'C';

  const warnLikeDimensions = dimensions.filter(
    (d) => d.result === 'WARN' || d.result === 'not-adjudicated',
  );
  // A WARN dimension whose warning string was not spelled out still counts —
  // the budget can never be dodged by omitting the narrative.
  const effectiveWarnCount = Math.max(warnings.length, warnLikeDimensions.length);

  if (effectiveWarnCount === 0) {
    // All grade-input dimensions PASS (or genuinely not-applicable), and every
    // machine dimension was actually adjudicated — S asserts that everything
    // mechanically checkable was mechanically checked.
    return 'S';
  }
  return effectiveWarnCount <= GRADE_A_WARN_BUDGET ? 'A' : 'B';
}

/** The quality_log gate three-state derived from the grade: S/A PASS, B WARN, C/D FAIL. */
export function resultForGrade(grade: VerifyGrade): GateResult {
  if (grade === 'S' || grade === 'A') return 'PASS';
  return grade === 'B' ? 'WARN' : 'FAIL';
}

/** Only S/A graduate — the `status: verified` gate `/prospec-archive` looks for. */
export function gradeAdvancesStatus(grade: VerifyGrade): boolean {
  return grade === 'S' || grade === 'A';
}
