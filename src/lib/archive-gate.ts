import type { DriftReport } from '../types/drift-report.js';

/** The archive Entry-Gate verdict: blocked when any reason is present. */
export interface ArchiveGateVerdict {
  blocked: boolean;
  reasons: string[];
}

/** Inputs the pure gate cannot read from the report alone. */
export interface ArchiveGateInputs {
  /** Whether affected-module Knowledge is synced (from `checkKnowledgeSync`). */
  knowledgeSynced: boolean;
  /** `--allow-incomplete`: exempt the `metadata-completeness` condition only. */
  allowIncomplete: boolean;
}

const checkFails = (report: DriftReport, id: string): boolean =>
  report.structural.checks.find((c) => c.id === id)?.status === 'fail';

/**
 * The archive Entry Gate as a pure verdict over the drift report.
 *
 * The station skill used to run `prospec check --json` and read these checks by
 * hand; this is the executable copy that `prospec archive` refuses on, so the
 * text can converge to one line. A check absent from the report (an older
 * engine) does not block — it cannot be adjudicated, the same stance the verify
 * machine ledger takes on a missing check. `metadata-completeness` is the one
 * condition `allowIncomplete` exempts, for pre-schema records; every other
 * condition still blocks.
 */
export function evaluateArchiveEntryGate(
  report: DriftReport,
  { knowledgeSynced, allowIncomplete }: ArchiveGateInputs,
): ArchiveGateVerdict {
  const reasons: string[] = [];

  if (!allowIncomplete && checkFails(report, 'metadata-completeness')) {
    reasons.push(
      'metadata-completeness FAILs — the change metadata is incomplete or lacks a verify S/A grade (pass --allow-incomplete to archive a pre-schema record)',
    );
  }
  if (checkFails(report, 'review-provenance')) {
    reasons.push(
      'review-provenance FAILs — re-run `/prospec-review`, then `prospec check --record-review`',
    );
  }
  if (checkFails(report, 'test-provenance')) {
    reasons.push(
      'test-provenance FAILs — re-run the tests, then `prospec check --record-tests`',
    );
  }
  if (checkFails(report, 'delta-spec-provenance')) {
    reasons.push(
      'delta-spec-provenance FAILs — fold the review fix into the delta-spec landing block, then re-record',
    );
  }
  if (!knowledgeSynced) {
    reasons.push('affected-module Knowledge is not synced — run `/prospec-knowledge-update`');
  }

  return { blocked: reasons.length > 0, reasons };
}
