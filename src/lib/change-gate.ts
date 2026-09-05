import type { DriftCheckId, DriftFinding, DriftReport } from '../types/drift-report.js';
import { DRIFT_CHECK_SCOPES } from '../types/drift-report.js';

/** A per-change verdict: the four check statuses plus `unprovable` — the target
 *  could not be adjudicated at all, which a gate must refuse, never read as pass. */
export type ChangeCheckStatus = 'pass' | 'warn' | 'fail' | 'skipped' | 'unprovable';

export interface ChangeCheckVerdict {
  status: ChangeCheckStatus;
  /** Present for `skipped` (the check's own reason, verbatim) and `unprovable`. */
  reason?: string;
  /** The findings that decided the verdict (empty for skipped / unprovable). */
  findings: DriftFinding[];
}

const CHANGES_ROOT = '.prospec/changes/';

/** The repo-relative prefix every finding about one change is anchored under. */
export function changeDirPrefix(changeName: string): string {
  return `${CHANGES_ROOT}${changeName}/`;
}

/**
 * Adjudicate ONE check for ONE change — pure, I/O-free, over the drift report.
 *
 * A `repository`-scoped check's verdict is the report's own. A `change`-scoped
 * check is decided in this order:
 *   1. check absent from the report → `unprovable` (older engine);
 *   2. `skipped` → passed through with its reason (the engine graded nobody;
 *      which skips a gate accepts is that gate's policy, decided before the
 *      subjects test — a skipped source enumerates no one, and reporting that as
 *      "target not enumerated" would hide the real cause);
 *   3. no `subjects`, or the target not among them → `unprovable`;
 *   4. the target listed under `subject_skips` → `skipped` with that reason (the
 *      evaluator could not grade it — e.g. its test command was unavailable while
 *      a sibling's run failed, so the check as a whole reads `fail`, and "no
 *      finding under the target" would otherwise pass for evidence);
 *   5. otherwise only the findings anchored under the target's change directory
 *      decide (fail > warn > pass). A finding of a change-scoped check anchored
 *      outside EVERY change directory is attributed to the target — fail-closed,
 *      so an evaluator that mis-anchors cannot silently exempt anyone.
 *
 * A sibling change's findings never touch the target's verdict; that is the whole
 * point. What this does NOT undo is the whole-tree digest the provenance checks
 * compare against — a sibling's code edit still stales the target's evidence.
 */
export function adjudicateChangeCheck(
  report: DriftReport,
  checkId: DriftCheckId,
  changeName: string,
): ChangeCheckVerdict {
  const check = report.structural.checks.find((c) => c.id === checkId);
  if (!check) {
    return unprovable(`check "${checkId}" is absent from the report (an older engine wrote it)`);
  }
  const ofThisCheck = report.structural.findings.filter((f) => f.check === checkId);
  if (DRIFT_CHECK_SCOPES[checkId] === 'repository') {
    return {
      status: check.status,
      ...(check.reason === undefined ? {} : { reason: check.reason }),
      findings: ofThisCheck,
    };
  }
  if (check.status === 'skipped') {
    return { status: 'skipped', reason: check.reason ?? 'skipped without a reason', findings: [] };
  }
  if (check.subjects === undefined) {
    return unprovable(
      `check "${checkId}" enumerated no subjects — the report predates per-change adjudication; re-run \`prospec check\``,
    );
  }
  if (!check.subjects.includes(changeName)) {
    return unprovable(
      `change "${changeName}" was not enumerated by check "${checkId}" — its inputs could not be read, or the check's collector has nothing of it to grade`,
    );
  }
  const subjectSkip = check.subject_skips?.[changeName];
  if (subjectSkip !== undefined) {
    return { status: 'skipped', reason: subjectSkip, findings: [] };
  }
  const prefix = changeDirPrefix(changeName);
  const findings = ofThisCheck.filter(
    (f) => f.source_path.startsWith(prefix) || !f.source_path.startsWith(CHANGES_ROOT),
  );
  const status = findings.some((f) => f.severity === 'fail')
    ? 'fail'
    : findings.length > 0
      ? 'warn'
      : 'pass';
  return { status, findings };
}

function unprovable(reason: string): ChangeCheckVerdict {
  return { status: 'unprovable', reason, findings: [] };
}
