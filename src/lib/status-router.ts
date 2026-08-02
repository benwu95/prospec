import type {
  ChangeRoute,
  ChangeRouteFacts,
  SddStation,
} from '../types/status.js';
import { forbiddenArtifacts, isStatusBefore } from '../types/change.js';

/**
 * The executable copy of `prospec/ai-knowledge/_status-lifecycle.md` — a pure,
 * I/O-free router (drift-checker precedent: the service collects facts, this
 * evaluates them). Every edge, gate and special path below is transcribed from
 * that file's tables; when the lifecycle doc changes, this router must change
 * with it.
 *
 * Encoded rules:
 * - `status` records the last COMPLETED station: story → current `story`,
 *   implemented → current `implement`, and so on.
 * - `scale: quick` — story → tasks is the single legal skip (no plan.md /
 *   delta-spec.md by contract; never a blocker).
 * - `scale: backfill` — a lifecycle ENTRY at `implemented`, not a skip; the
 *   brownfield code pre-exists and plan/tasks are absent by design. Before it
 *   reaches `implemented` the promotion is unfinished, so the route is the
 *   `promote` station — never plan or tasks, which refuse that scale.
 * - design / review own no status transition: design sits between plan and
 *   tasks (only when proposal.md declares ui_scope full/partial), review
 *   between implemented and verified (done-ness read from review_provenance).
 * - verify sets `verified` only at grade S/A — B/C/D leaves the status at
 *   `implemented`, so the router points back at verify with the fix reason.
 * - archive accepts only `verified` and re-confirms Knowledge sync.
 */

/** `status` value → the station it marks as completed. */
const STATUS_STATION: Record<ChangeRouteFacts['status'], SddStation> = {
  story: 'story',
  plan: 'plan',
  tasks: 'tasks',
  implemented: 'implement',
  verified: 'verify',
  archived: 'archive',
};

/** Route one in-flight change to its next SDD station. Pure — no I/O. */
export function routeChange(facts: ChangeRouteFacts): ChangeRoute {
  const forbidden = forbiddenArtifacts(facts.scale);

  const base = {
    name: facts.name,
    status: facts.status,
    scale: facts.scale,
    // `implemented` marks `implement` as completed — except for a scale with no
    // task list, which never ran that station: its `implemented` came from the
    // promotion. Naming `implement` there would credit a station whose artifacts
    // that scale's contract forbids.
    current:
      facts.status === 'implemented' && forbidden.includes('tasks.md')
        ? 'promote'
        : STATUS_STATION[facts.status],
  } satisfies Omit<ChangeRoute, 'next' | 'blockingGates' | 'reasons'>;

  // A scale with neither a plan nor a task list has NO forward planning station:
  // its lifecycle entry is the promotion itself, landing at `implemented`. Until
  // it gets there the promotion is simply incomplete — routing such a change to
  // plan or tasks names a station the CLI refuses.
  if (
    forbidden.includes('plan.md') &&
    forbidden.includes('tasks.md') &&
    isStatusBefore(facts.status, 'implemented')
  ) {
    return {
      ...base,
      next: 'promote',
      blockingGates: [
        'promotion scaffold complete — `prospec validate promote-scaffold` PASSes and `status: implemented` is set',
      ],
      reasons: [
        `scale: ${facts.scale} — its contract has no plan and no task list, so the lifecycle entry is the promotion itself; \`status: ${facts.status}\` is before \`implemented\`, so that promotion has not landed`,
      ],
    };
  }

  switch (facts.status) {
    case 'story': {
      // A scale that also forbids tasks.md already returned above, so forbidding
      // plan.md here means exactly the quick skip — the second clause would be a
      // tautology, and a condition that cannot fail pins nothing.
      if (forbidden.includes('plan.md')) {
        return {
          ...base,
          next: 'tasks',
          blockingGates: ['tasks.md created (decomposed directly from proposal.md)'],
          reasons: [
            `scale: ${facts.scale} — story → tasks is the single legal skip; no plan.md/delta-spec.md by contract (re-checked at the /prospec-archive Entry Gate)`,
          ],
        };
      }
      return {
        ...base,
        next: 'plan',
        blockingGates: ['plan.md + delta-spec.md created'],
        reasons: ['status `story` — next station per lifecycle order'],
      };
    }

    case 'plan': {
      // Design hangs off the `plan` station, so a scale whose contract has no plan
      // is never routed to it — the lifecycle states this for quick, and keying it
      // on the registry rather than the scale name keeps the two from drifting.
      // (Reachable at this status only via a manual `change status plan`.)
      const designApplies =
        (facts.uiScope === 'full' || facts.uiScope === 'partial') &&
        !forbidden.includes('plan.md');
      if (designApplies && !facts.hasDesignSpec) {
        return {
          ...base,
          next: 'design',
          blockingGates: ['design-spec.md + interaction-spec.md produced'],
          reasons: [
            `proposal ui_scope: ${facts.uiScope} — design sits between plan and tasks (owns no status transition; placed by workflow order)`,
          ],
        };
      }
      const reasons = ['status `plan` — next station per lifecycle order'];
      if (designApplies && facts.hasDesignSpec) {
        reasons.push('design-spec.md present — the design station has already run');
      }
      return {
        ...base,
        next: 'tasks',
        blockingGates: ['tasks.md created'],
        reasons,
      };
    }

    case 'tasks': {
      // Honest gate state, never a vacuous pass: a missing tasks.md or an
      // empty code-task set is surfaced instead of reading as "all done".
      const gate = !facts.hasTasks
        ? 'tasks.md not found — /prospec-tasks owns its creation'
        : facts.codeTasksTotal === 0
          ? 'no code tasks found in tasks.md — nothing measurable to complete'
          : `all code-task checkboxes complete — currently ${facts.codeTasksDone}/${facts.codeTasksTotal} ([M]/[V] tasks are reminders, not blockers)`;
      return {
        ...base,
        next: 'implement',
        blockingGates: [gate],
        reasons: ['status `tasks` — next station per lifecycle order'],
      };
    }

    case 'implemented': {
      const reasons: string[] = [];
      if (facts.scale === 'backfill') {
        reasons.push(
          'scale: backfill — legal lifecycle entry at `implemented` (brownfield code pre-exists; no plan/tasks by design, not a skipped station)',
        );
      }
      if (!facts.hasReviewProvenance) {
        reasons.push(
          'review owns no status transition — placed by workflow order between implemented and verified (no review_provenance recorded yet)',
        );
        return {
          ...base,
          next: 'review',
          blockingGates: [
            'adversarial review completed and its baseline recorded (`prospec check --record-review`)',
          ],
          reasons,
        };
      }
      if (
        facts.lastVerifyGrade !== null &&
        facts.lastVerifyGrade !== 'S' &&
        facts.lastVerifyGrade !== 'A'
      ) {
        reasons.push(
          `previous verify grade ${facts.lastVerifyGrade} did not advance the status — fix the WARN/FAIL items and re-run /prospec-verify`,
        );
      } else {
        reasons.push('review_provenance recorded — verify is the next station');
      }
      return {
        ...base,
        next: 'verify',
        blockingGates: [
          'grade S or A required (no FAIL, ≤ 2 WARN); machine dimensions adjudicated by `prospec check`',
        ],
        reasons,
      };
    }

    case 'verified': {
      return {
        ...base,
        next: 'archive',
        blockingGates: [
          'only `verified` changes are archivable',
          'affected-module Knowledge synced (verify S/A commit prompt; the archive Entry Gate re-confirms as backstop)',
        ],
        reasons: ['status `verified` — next station per lifecycle order'],
      };
    }

    case 'archived': {
      return {
        ...base,
        next: null,
        blockingGates: [],
        reasons: ['terminal — linear flow complete; periodic /prospec-learn applies'],
      };
    }
  }
}
