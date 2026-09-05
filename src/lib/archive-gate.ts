import type { DriftReport } from '../types/drift-report.js';
import type { WorkflowReason } from '../types/status.js';
import { adjudicateChangeCheck } from './change-gate.js';

/** The archive Entry-Gate verdict: blocked when any reason is present. */
export interface ArchiveGateVerdict {
  blocked: boolean;
  reasons: WorkflowReason[];
}

/** Inputs the pure gate cannot read from the report alone. */
export interface ArchiveGateInputs {
  /** The change being archived — the gate adjudicates the report for IT alone. */
  changeName: string;
  /** Whether affected-module Knowledge is synced (from `checkKnowledgeSync`). */
  knowledgeSynced: boolean;
  /** `--allow-incomplete`: exempt the `metadata-completeness` condition only. */
  allowIncomplete: boolean;
  /**
   * False for a PROVEN backfill (`scale: backfill` with `backfill-draft.md`): its
   * contract forbids `tasks.md`, so the task-completion collector never enumerates
   * it and the ordinary rule would read "unprovable" forever. The service derives
   * this from the draft's presence, never from the hand-editable `scale` alone —
   * the same policy `verify record` applies to its machine dimensions.
   */
  taskCompletionApplicable: boolean;
}

const GATED_CHECKS = [
  'metadata-completeness',
  'task-completion',
  'review-provenance',
  'test-provenance',
  'delta-spec-provenance',
] as const;

const FAIL_REASONS: Record<(typeof GATED_CHECKS)[number], WorkflowReason> = {
  'metadata-completeness': {
    code: 'METADATA_INCOMPLETE',
    message: 'metadata-completeness FAILs — the change metadata is incomplete or lacks a verify S/A grade',
    remediation: 'fix the metadata (or pass --allow-incomplete to archive a pre-schema record)',
  },
  'task-completion': {
    code: 'TASKS_INCOMPLETE',
    message: 'task-completion FAILs — code tasks are still unchecked',
    remediation: 'complete the pending code tasks (`prospec change progress --complete <id>`)',
  },
  'review-provenance': {
    code: 'REVIEW_STALE',
    message: 'review-provenance FAILs — the review baseline is absent or stale for this change',
    remediation: 're-run `prospec-review`, then `prospec check --record-review`',
  },
  'test-provenance': {
    code: 'TESTS_STALE',
    message: 'test-provenance FAILs — the recorded test run is absent, stale or failing for this change',
    remediation: 're-run the tests, then `prospec check --record-tests`',
  },
  'delta-spec-provenance': {
    code: 'DELTA_SPEC_STALE',
    message: 'delta-spec-provenance FAILs — the delta-spec changed since its recorded baseline',
    remediation: 'fold the review fix into the delta-spec landing block, then re-record',
  },
};

/**
 * The archive Entry Gate as a pure verdict over the drift report, adjudicated for
 * ONE target change (`adjudicateChangeCheck`): a sibling change's missing review
 * or failing tests never refuse this target, and a target the engine did not
 * enumerate is refused as unprovable rather than waved through.
 *
 * Required absent/unprovable checks refuse entry. Only an explicitly unavailable
 * test command may skip; allowIncomplete exempts metadata completeness alone.
 * Services supply a current assessment, never a saved display report.
 */
export function evaluateArchiveEntryGate(
  report: DriftReport,
  { changeName, knowledgeSynced, allowIncomplete, taskCompletionApplicable }: ArchiveGateInputs,
): ArchiveGateVerdict {
  const reasons: WorkflowReason[] = [];

  for (const id of GATED_CHECKS) {
    if (id === 'metadata-completeness' && allowIncomplete) continue;
    if (id === 'task-completion' && !taskCompletionApplicable) continue;
    const verdict = adjudicateChangeCheck(report, id, changeName);
    if (verdict.status === 'skipped') {
      if (id === 'test-provenance' && verdict.reason?.startsWith('test command unavailable:')) continue;
      reasons.push({
        code: 'CHECK_UNPROVABLE',
        message: `${id} is skipped for this change (${verdict.reason}) — nothing proves it`,
        remediation: 'restore the check\'s inputs and collect current facts before archiving',
      });
      continue;
    }
    if (verdict.status === 'unprovable') {
      reasons.push({
        code: 'CHECK_UNPROVABLE',
        message: `${id} is unprovable for change "${changeName}": ${verdict.reason}`,
        remediation:
          id === 'task-completion'
            ? 'collect current inputs (`prospec check`); a `scale: backfill` change without `backfill-draft.md` has no `tasks.md` to enumerate — restore the draft through `prospec-promote-backfill` or change the scale with `prospec change scale`'
            : 'collect current inputs (`prospec check`) and make sure the change metadata is readable',
      });
      continue;
    }
    if (verdict.status === 'fail') reasons.push({ ...FAIL_REASONS[id] });
  }
  if (!knowledgeSynced) {
    reasons.push({
      code: 'KNOWLEDGE_UNSYNCED',
      message: 'affected-module Knowledge is not synced',
      remediation: 'run `prospec-knowledge-update` (then `prospec knowledge verify <modules>`)',
    });
  }

  return { blocked: reasons.length > 0, reasons };
}

/** One line per reason, in the shape the archive refusal prints. */
export function formatWorkflowReason(reason: WorkflowReason): string {
  return `${reason.code}: ${reason.message} — ${reason.remediation}`;
}
