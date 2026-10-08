import type {
  ChangeRoute,
  ChangeRouteFacts,
  SddStation,
  RouteTarget,
  WorkflowReasonCode,
} from '../types/status.js';
import { BREAK_GLASS_PREFIX, formatWorkflowReason, PLAN_SIGNOFF_REMEDIES, PLAN_VERSION_SIGNOFF_REMEDIES, ROUTE_TARGET_SKILLS } from '../types/status.js';
import { forbiddenArtifacts, isStatusBefore, type ChangeStatus } from '../types/change.js';
import { AGENT_CONFIGS } from '../types/skill.js';
import { RELATED_MODULE_HALT_CONDITION } from './knowledge-sync.js';
import type { ValidAgent } from '../types/config.js';
import { applicableGrant, escalationDecision } from './escalation.js';

/**
 * The executable copy of `prospec/ai-knowledge/_status-lifecycle.md` — a pure,
 * I/O-free router (drift-checker precedent: the service collects facts, this
 * evaluates them). Every edge, gate and special path below is transcribed from
 * that file's tables; when the lifecycle doc changes, this router must change
 * with it.
 *
 * Every decision is a rule in `ROUTING_TABLE`: the global rules run first, then
 * the branch for the change's status, and within a scope the first rule whose
 * condition holds decides the route — so a rule's position IS its precedence.
 * `prospec/ai-knowledge/modules/lib/routing-flow.md` draws the table (regenerate
 * with `pnpm routing-flow`) and lists what a new decision must update.
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
 *   `implemented`, so the router points back at verify with the fix reason. An
 *   already-`verified` change re-verified to B/C/D keeps its status (forward-only)
 *   but is ALSO routed back to verify: the latest grade, not the persisted
 *   status, says whether archive is next.
 * - plan / tasks: the station's latest recorded verifier result (the
 *   `change log --verifier-report` sink) — a FAIL routes back to that station
 *   until a PASS or a Break-Glass WARN supersedes it.
 * - plan, sign-off pause: a change whose scale has a plan and whose resolved pause
 *   stations include `plan` waits for a verifier result of the current plan
 *   version, then for a human sign-off that counts, before any forward edge. The
 *   waiting code is not a failure.
 * - archive accepts only `verified` and re-confirms Knowledge sync; at `verified`,
 *   a `KNOWLEDGE_INPUT_INVALID` knowledge-sync reason (an input no station repairs)
 *   halts for a human, and only `KNOWLEDGE_UNSYNCED` reasons route to knowledge-update.
 * - every route carries a stable `code` from `WORKFLOW_REASON_CODES`; `reasons`
 *   stays prose.
 */

/** A recorded grade that did not (or would not) advance the status. */
function gradeBelowBar(grade: ChangeRouteFacts['lastVerifyGrade']): boolean {
  return grade !== null && grade !== 'S' && grade !== 'A';
}

/** `status` value → the station it marks as completed. */
export const STATUS_STATION: Record<ChangeRouteFacts['status'], SddStation> = {
  story: 'story',
  plan: 'plan',
  tasks: 'tasks',
  implemented: 'implement',
  verified: 'verify',
  archived: 'archive',
  abandoned: 'archive',
};

/** What every rule condition and builder reads — derived once per route. */
export interface RouteContext {
  facts: ChangeRouteFacts;
  forbidden: readonly string[];
  history: ChangeRouteFacts['escalationHistory'];
  /** The plan sign-off pause applies: enabled, and the scale's contract has a plan. */
  pauseApplies: boolean;
  /** Design hangs off the plan station: ui_scope full/partial under a scale with a plan. */
  designApplies: boolean;
}

/** One routing decision. `label` is its human reading of `when`, drawn on the routing diagram. */
export interface RouteRule {
  id: string;
  label: string;
  when: (c: RouteContext) => boolean;
  code: WorkflowReasonCode;
  /** A halt is declared statically (`null`); a dynamic target always resolves to a station. */
  next: RouteTarget | null | { label: string; resolve: (c: RouteContext) => RouteTarget };
  gates: (c: RouteContext) => readonly string[];
  reasons: (c: RouteContext) => readonly string[];
  extra?: (c: RouteContext) => Pick<ChangeRoute, 'escalation'>;
}

export interface RouteBranch {
  statuses: readonly ChangeStatus[];
  /** Reasons every route of this branch opens with. */
  preamble?: (c: RouteContext) => readonly string[];
  /** Ends with a rule whose `when` is `OTHERWISE`. */
  rules: readonly RouteRule[];
}

export interface RoutingTable {
  global: readonly RouteRule[];
  branches: readonly RouteBranch[];
}

/** The unconditional condition that closes every branch. */
export const OTHERWISE = (): boolean => true;

const isTerminal = (status: ChangeStatus): boolean => status === 'archived' || status === 'abandoned';
const hasPendingEscalation = (c: RouteContext): boolean => !isTerminal(c.facts.status) && c.history?.pending != null;
const pendingGrant = (c: RouteContext) => applicableGrant(c.history!, c.history!.pending!.station);
const pendingDecision = (c: RouteContext) => {
  const pending = c.history!.pending!;
  return escalationDecision({
    event_id: pending.event_id, station: pending.station,
    trigger: pending.trigger, ordinal: c.history!.events.length,
  });
};
const pendingReason = (c: RouteContext): string =>
  `${c.history!.pending!.trigger}: ${c.history!.events.length} lifetime escalation event(s); recommended: ${pendingDecision(c).recommended}`;
// Streak escalation is the legacy bound: once a structured escalation history exists, it governs.
const streakReached = (c: RouteContext, streak: number): boolean =>
  c.history === undefined && streak >= c.facts.maxStationRetries;

const PLAN_VERIFIER_GATE = `Architecture Verifier PASS/WARN recorded via \`prospec change log --skill prospec-plan --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`;
const TASKS_VERIFIER_GATE = `Task Verifier PASS/WARN recorded via \`prospec change log --skill prospec-tasks --verifier-report <file>\` (or a documented Break-Glass \`--result WARN --warning "${BREAK_GLASS_PREFIX} …"\`)`;
const VERIFY_GATE = 'grade S or A required (no FAIL, ≤ 2 WARN); `prospec verify record` adjudicates machine dimensions from `prospec check` — follow its current assessment, refusal and remediation';
const REVERIFY_GATE = 'a fresh grade S or A recorded by `prospec verify record` (no FAIL, ≤ 2 WARN)';

const GLOBAL_RULES: readonly RouteRule[] = [
  // A scale with neither a plan nor a task list has NO forward planning station:
  // its lifecycle entry is the promotion itself, landing at `implemented`. Until
  // it gets there the promotion is simply incomplete — routing such a change to
  // plan or tasks names a station the CLI refuses.
  {
    id: 'promotion-incomplete',
    label: 'scale has no plan and no task list,<br>premise not blocked,<br>status before implemented?',
    when: (c) => c.forbidden.includes('plan.md') && c.forbidden.includes('tasks.md') &&
      c.facts.premise?.state !== 'blocked' && isStatusBefore(c.facts.status, 'implemented'),
    code: 'PROMOTION_INCOMPLETE',
    next: 'promote',
    gates: () => ['promotion scaffold complete — `prospec validate promote-scaffold` PASSes and `status: implemented` is set'],
    reasons: (c) => [
      `scale: ${c.facts.scale} — its contract has no plan and no task list, so the lifecycle entry is the promotion itself; \`status: ${c.facts.status}\` is before \`implemented\`, so that promotion has not landed`,
    ],
  },
  {
    id: 'escalation-granted',
    label: 'non-terminal, escalation pending,<br>an applicable grant for the pending event (applicableGrant)?',
    when: (c) => hasPendingEscalation(c) && pendingGrant(c) !== undefined,
    code: 'LIFECYCLE_NEXT',
    next: {
      label: 'pending station',
      resolve: (c) => c.history!.pending!.station.slice('prospec-'.length) as 'plan' | 'tasks' | 'review' | 'verify',
    },
    gates: () => ['One new accepted attempt is authorized; existing test and live-evidence gates still apply'],
    reasons: (c) => [pendingReason(c)],
    extra: (c) => ({ escalation: pendingDecision(c) }),
  },
  {
    id: 'escalation-pending',
    label: 'non-terminal, escalation pending?',
    when: hasPendingEscalation,
    code: 'ESCALATE_TO_HUMAN',
    next: null,
    gates: () => ['Present the CLI exits to the developer; a break-glass grant requires an explicit nonempty reason for this event and station'],
    reasons: (c) => [pendingReason(c)],
    extra: (c) => ({ escalation: pendingDecision(c) }),
  },
  {
    id: 'premise-blocked',
    label: 'non-terminal, premise blocked?',
    when: (c) => !isTerminal(c.facts.status) && c.facts.premise?.state === 'blocked',
    code: 'PREMISE_INCOMPLETE',
    next: 'explore',
    gates: (c) => c.facts.premise!.findings,
    reasons: (c) => [c.facts.premise!.remedy, c.facts.premise!.limitation],
  },
];

const STORY_BRANCH: RouteBranch = {
  statuses: ['story'],
  rules: [
    // A scale that also forbids tasks.md already took the promotion rule, so
    // forbidding plan.md here means exactly the quick skip.
    {
      id: 'quick-skips-plan',
      label: 'scale has no plan?',
      when: (c) => c.forbidden.includes('plan.md'),
      code: 'QUICK_SKIPS_PLAN',
      next: 'tasks',
      gates: () => ['tasks.md created (decomposed directly from proposal.md)'],
      reasons: (c) => [
        `scale: ${c.facts.scale} — story → tasks is the single legal skip; no plan.md/delta-spec.md by contract (re-checked at the prospec-archive Entry Gate)`,
      ],
    },
    {
      id: 'story-next', label: 'otherwise', when: OTHERWISE, code: 'LIFECYCLE_NEXT', next: 'plan',
      gates: () => ['plan.md + delta-spec.md created'],
      reasons: () => ['status `story` — next station per lifecycle order'],
    },
  ],
};

const PLAN_BRANCH: RouteBranch = {
  statuses: ['plan'],
  rules: [
    // The plan verifier's recorded FLAWS (result FAIL) outranks every forward
    // edge, design included: a plan that failed its own audit is revised before
    // anything is built on it. Superseded only by a later PASS or Break-Glass
    // WARN — the service applies that reading, the router just trusts the fact.
    {
      id: 'plan-verifier-streak',
      label: 'plan verifier FAIL,<br>no escalation history,<br>streak ≥ max retries?',
      when: (c) => c.facts.lastPlanVerifierResult === 'FAIL' && streakReached(c, c.facts.planFlawsStreak),
      code: 'ESCALATE_TO_HUMAN',
      next: null,
      gates: () => [PLAN_VERIFIER_GATE],
      reasons: (c) => [
        `the prospec-plan verifier has failed ${c.facts.planFlawsStreak} consecutive times (limit: ${c.facts.maxStationRetries}) — escalating to human; resolve repeated architecture verifier flaws`,
      ],
    },
    {
      id: 'plan-verifier-failed',
      label: 'plan verifier FAIL?',
      when: (c) => c.facts.lastPlanVerifierResult === 'FAIL',
      code: 'PLAN_VERIFIER_FAILED',
      next: 'plan',
      gates: () => [PLAN_VERIFIER_GATE],
      reasons: () => [
        'the latest recorded prospec-plan verifier result is FAIL — revise plan.md/delta-spec.md and re-run the Architecture Verifier; the status stays `plan`',
      ],
    },
    // The pause rules sit after the FAIL rules, so a plan that failed its own
    // audit is revised before a human is asked to sign it.
    {
      id: 'pause-no-verifier',
      label: 'sign-off pause applies (enabled, scale has a plan),<br>no verifier result?',
      when: (c) => c.pauseApplies && c.facts.lastPlanVerifierResult === null,
      code: 'PLAN_VERIFIER_PENDING',
      next: 'plan',
      gates: () => ['Architecture Verifier PASS/WARN recorded via `prospec change log --skill prospec-plan --verifier-report <file>`'],
      reasons: (c) => [
        `scale: ${c.facts.scale} with the plan sign-off pause enabled — no plan verifier result is recorded yet, so there is nothing for a human to sign off`,
      ],
    },
    {
      id: 'pause-plan-changed',
      label: 'pause applies, not signed off,<br>plan changed since verifier?',
      when: (c) => c.pauseApplies && !c.facts.planSignedOff && c.facts.planChangedSinceVerifier,
      code: 'PLAN_VERIFIER_PENDING',
      next: 'plan',
      gates: () => ['Architecture Verifier PASS/WARN for the current plan.md and delta-spec.md recorded via `prospec change log --skill prospec-plan --verifier-report <file>`'],
      reasons: (c) => [
        `scale: ${c.facts.scale} with the plan sign-off pause enabled — plan.md or delta-spec.md changed after the plan verifier audited it, so a sign-off would cover an unaudited version; record a new verifier report first`,
      ],
    },
    {
      id: 'pause-awaiting-signoff',
      label: 'pause applies, not signed off?',
      when: (c) => c.pauseApplies && !c.facts.planSignedOff,
      code: 'AWAITING_HUMAN_PLAN_SIGNOFF',
      next: null,
      gates: (c) => [
        c.facts.scale === 'full'
          ? 'human plan sign-off newer than the latest plan verifier result, recorded via `prospec change log --skill prospec-plan --signoff <option>` (the option must equal candidates/decision.json `recommended_option`)'
          : 'human sign-off of the audited plan version, newer than the latest plan verifier result, recorded via `prospec change log --skill prospec-plan --signoff plan`',
      ],
      reasons: (c) => c.facts.scale === 'full'
        ? [
            'scale: full with the plan sign-off pause enabled — HALT and present the candidate summary, metrics table, in-session rationale and plan verifier report for a human decision',
            `no decision.json or plan verifier report to sign (e.g. after \`change scale full\`, or only a Break-Glass override)? ${PLAN_SIGNOFF_REMEDIES}`,
          ]
        : [
            `scale: ${c.facts.scale} with the plan sign-off pause enabled — HALT and present the direction summary of the audited plan for a human decision`,
            `no plan verifier report to sign (only a Break-Glass override)? ${PLAN_VERSION_SIGNOFF_REMEDIES}`,
          ],
    },
    // Reachable under a scale with no plan only via a manual `change status plan`;
    // `designApplies` keys on the scale registry so design is never routed there.
    {
      id: 'design-required',
      label: 'design applies (scale has a plan,<br>UI scope full/partial), no design spec?',
      when: (c) => c.designApplies && !c.facts.hasDesignSpec,
      code: 'DESIGN_REQUIRED',
      next: 'design',
      gates: () => ['design-spec.md + interaction-spec.md produced'],
      reasons: (c) => [
        `proposal ui_scope: ${c.facts.uiScope} — design sits between plan and tasks (owns no status transition; placed by workflow order)`,
      ],
    },
    {
      id: 'plan-next', label: 'otherwise', when: OTHERWISE, code: 'LIFECYCLE_NEXT', next: 'tasks',
      gates: () => ['tasks.md created'],
      reasons: (c) => [
        'status `plan` — next station per lifecycle order',
        ...(c.pauseApplies ? ['plan sign-off recorded — the pause is released'] : []),
        ...(c.designApplies && c.facts.hasDesignSpec ? ['design-spec.md present — the design station has already run'] : []),
      ],
    },
  ],
};

const TASKS_BRANCH: RouteBranch = {
  statuses: ['tasks'],
  rules: [
    {
      id: 'tasks-verifier-streak',
      label: 'tasks verifier FAIL,<br>no escalation history,<br>streak ≥ max retries?',
      when: (c) => c.facts.lastTasksVerifierResult === 'FAIL' && streakReached(c, c.facts.tasksFlawsStreak),
      code: 'ESCALATE_TO_HUMAN',
      next: null,
      gates: () => [TASKS_VERIFIER_GATE],
      reasons: (c) => [
        `the prospec-tasks verifier has failed ${c.facts.tasksFlawsStreak} consecutive times (limit: ${c.facts.maxStationRetries}) — escalating to human; resolve repeated task verifier flaws`,
      ],
    },
    {
      id: 'tasks-verifier-failed',
      label: 'tasks verifier FAIL?',
      when: (c) => c.facts.lastTasksVerifierResult === 'FAIL',
      code: 'TASKS_VERIFIER_FAILED',
      next: 'tasks',
      gates: () => [TASKS_VERIFIER_GATE],
      reasons: () => [
        'the latest recorded prospec-tasks verifier result is FAIL — revise tasks.md and re-run the Task Verifier; the status stays `tasks`',
      ],
    },
    {
      id: 'tasks-next', label: 'otherwise', when: OTHERWISE, code: 'LIFECYCLE_NEXT', next: 'implement',
      // Honest gate state, never a vacuous pass: a missing tasks.md or an
      // empty code-task set is surfaced instead of reading as "all done".
      gates: (c) => [
        !c.facts.hasTasks
          ? 'tasks.md not found — prospec-tasks owns its creation'
          : c.facts.codeTasksTotal === 0
            ? 'no code tasks found in tasks.md — nothing measurable to complete'
            : `\`prospec change status implemented\` refuses until all code-task checkboxes are complete — currently ${c.facts.codeTasksDone}/${c.facts.codeTasksTotal} ([M]/[V] tasks are reminders, not blockers)`,
      ],
      reasons: () => ['status `tasks` — next station per lifecycle order'],
    },
  ],
};

const IMPLEMENTED_BRANCH: RouteBranch = {
  statuses: ['implemented'],
  preamble: (c) => c.facts.scale === 'backfill'
    ? ['scale: backfill — legal lifecycle entry at `implemented` (brownfield code pre-exists; no plan/tasks by design, not a skipped station)']
    : [],
  rules: [
    {
      id: 'review-pending',
      label: 'no review provenance?',
      when: (c) => !c.facts.hasReviewProvenance,
      code: 'REVIEW_PENDING',
      next: 'review',
      gates: () => ['adversarial review completed and its baseline recorded (`prospec check --record-review`)'],
      reasons: () => [
        'review owns no status transition — placed by workflow order between implemented and verified (no review_provenance recorded yet)',
      ],
    },
    {
      id: 'verify-streak',
      label: 'recorded grade below S/A,<br>no escalation history,<br>streak ≥ max retries?',
      when: (c) => gradeBelowBar(c.facts.lastVerifyGrade) && streakReached(c, c.facts.verifyBelowBarStreak),
      code: 'ESCALATE_TO_HUMAN',
      next: null,
      gates: () => [VERIFY_GATE],
      reasons: (c) => [
        `prospec-verify has produced below-bar grades ${c.facts.verifyBelowBarStreak} consecutive times (limit: ${c.facts.maxStationRetries}, latest: ${c.facts.lastVerifyGrade}) — escalating to human; fix the WARN/FAIL items and re-run prospec-verify`,
      ],
    },
    {
      id: 'verify-below-bar',
      label: 'recorded grade below S/A?',
      when: (c) => gradeBelowBar(c.facts.lastVerifyGrade),
      code: 'VERIFY_GRADE_BELOW_BAR',
      next: 'verify',
      gates: () => [VERIFY_GATE],
      reasons: (c) => [
        `previous verify grade ${c.facts.lastVerifyGrade} did not advance the status — fix the WARN/FAIL items and re-run prospec-verify`,
      ],
    },
    {
      id: 'verify-pending', label: 'otherwise', when: OTHERWISE, code: 'VERIFY_PENDING', next: 'verify',
      gates: () => [VERIFY_GATE],
      reasons: () => ['review_provenance recorded — verify is the next station'],
    },
  ],
};

const VERIFIED_BRANCH: RouteBranch = {
  statuses: ['verified'],
  rules: [
    // The persisted status never regresses, but the LATEST grade decides the
    // route: a re-verify that landed B/C/D means the change is not archivable
    // until a fresh S/A — say so here, not at the archive refusal.
    {
      id: 'reverify-streak',
      label: 'latest grade below S/A,<br>no escalation history,<br>streak ≥ max retries?',
      when: (c) => gradeBelowBar(c.facts.lastVerifyGrade) && streakReached(c, c.facts.verifyBelowBarStreak),
      code: 'ESCALATE_TO_HUMAN',
      next: null,
      gates: () => [REVERIFY_GATE],
      reasons: (c) => [
        `status stays \`verified\` (forward-only) but prospec-verify has produced below-bar grades ${c.facts.verifyBelowBarStreak} consecutive times (limit: ${c.facts.maxStationRetries}, latest: ${c.facts.lastVerifyGrade}) — escalating to human; fix the WARN/FAIL items and re-run prospec-verify before archive`,
      ],
    },
    {
      id: 'reverify-below-bar',
      label: 'latest grade below S/A?',
      when: (c) => gradeBelowBar(c.facts.lastVerifyGrade),
      code: 'VERIFY_GRADE_BELOW_BAR',
      next: 'verify',
      gates: () => [REVERIFY_GATE],
      reasons: (c) => [
        `status stays \`verified\` (forward-only) but the latest prospec-verify grade is ${c.facts.lastVerifyGrade} — fix the WARN/FAIL items and re-run prospec-verify before archive; \`prospec archive\` would refuse this change`,
      ],
    },
    // Only KNOWLEDGE_UNSYNCED is knowledge-update's to repair; any other reason
    // halts for a human rather than naming a station that cannot fix it. Each gap
    // reason keeps its own code: the formatter prefixes every reason line with the
    // route's code, which a co-listed KNOWLEDGE_UNSYNCED reason does not share.
    {
      id: 'knowledge-input-invalid',
      label: 'a knowledge-sync reason<br>other than UNSYNCED?',
      when: (c) => c.facts.knowledgeSyncReasons.some((r) => r.code !== 'KNOWLEDGE_UNSYNCED'),
      code: 'KNOWLEDGE_INPUT_INVALID',
      next: null,
      gates: () => [
        `knowledge-sync inputs repaired — every delta-spec REQ id canonical, module-map.yaml readable; resolve ${RELATED_MODULE_HALT_CONDITION}`,
      ],
      reasons: (c) => [
        'status `verified` — a knowledge-sync input no station repairs blocks archive; prospec-knowledge-update cannot fix it, so repair it and re-run prospec status',
        ...c.facts.knowledgeSyncReasons.map(formatWorkflowReason),
      ],
    },
    {
      id: 'knowledge-unsynced',
      label: 'any knowledge-sync reason?',
      when: (c) => c.facts.knowledgeSyncReasons.length > 0,
      code: 'KNOWLEDGE_UNSYNCED',
      next: 'knowledge-update',
      gates: () => [
        'affected-module Knowledge synced (module-map.yaml last_verified updated via `prospec knowledge verify` or prospec-knowledge-update)',
      ],
      reasons: (c) => [
        'status `verified` — knowledge is not yet synced for affected modules; prospec-knowledge-update is the next station',
        ...c.facts.knowledgeSyncReasons.map(formatWorkflowReason),
      ],
    },
    {
      id: 'verified-next', label: 'otherwise', when: OTHERWISE, code: 'LIFECYCLE_NEXT', next: 'archive',
      gates: () => [
        '`prospec archive` refuses unless the change is `verified`',
        'affected-module Knowledge synced — `prospec archive` refuses otherwise (verify S/A commit prompt is the prevention; the archive Entry Gate is the backstop)',
        // `verified` is inside PROVENANCE_AUDITED_STATUSES, so these are live gates
        // on this edge, not just on the one before it. Equivalent commits keep
        // repository-input evidence current. Declared, not
        // evaluated: the router is I/O-free and never reads the drift report — the
        // station CLI (`prospec archive`) is the adjudicator that refuses on them.
        'review/test provenance current for the final inputs — `prospec archive` refuses on any FAIL (`prospec check` — re-record when inputs change; equivalent commits preserve evidence)',
      ],
      reasons: () => ['status `verified` — next station per lifecycle order'],
    },
  ],
};

const TERMINAL_BRANCH: RouteBranch = {
  statuses: ['abandoned', 'archived'],
  rules: [
    {
      id: 'terminal', label: 'otherwise', when: OTHERWISE, code: 'TERMINAL', next: null,
      gates: () => [],
      reasons: () => ['terminal — linear flow complete; periodic prospec-learn applies'],
    },
  ],
};

/** Every routing decision, in evaluation order. */
export const ROUTING_TABLE: RoutingTable = {
  global: GLOBAL_RULES,
  branches: [STORY_BRANCH, PLAN_BRANCH, TASKS_BRANCH, IMPLEMENTED_BRANCH, VERIFIED_BRANCH, TERMINAL_BRANCH],
};

/** Route one change through any table of `ROUTING_TABLE`'s shape. Pure — no I/O. */
export function routeWith(table: RoutingTable, facts: ChangeRouteFacts): ChangeRoute {
  const forbidden = forbiddenArtifacts(facts.scale);
  const c: RouteContext = {
    facts,
    forbidden,
    history: facts.escalationHistory,
    pauseApplies: facts.pauseAtPlan && !forbidden.includes('plan.md'),
    designApplies: (facts.uiScope === 'full' || facts.uiScope === 'partial') && !forbidden.includes('plan.md'),
  };

  const base = {
    name: facts.name,
    ...(facts.premise === undefined ? {} : { premise: facts.premise }),
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
    // Display-only pass-through, spread conditionally: writing `issue:
    // facts.issue` would put the key on every route, and the formatter's
    // print-only-when-registered branch reads absence, not falsiness. The same
    // shape carries unresolved WARNs — absent when there are none.
    ...(facts.issue === undefined ? {} : { issue: facts.issue }),
    ...(facts.unresolvedWarnings === undefined || facts.unresolvedWarnings.length === 0
      ? {}
      : { unresolvedWarnings: facts.unresolvedWarnings }),
    ...(facts.escalationHistory === undefined ? {} : { escalationHistory: facts.escalationHistory }),
  } satisfies Omit<ChangeRoute, 'next' | 'code' | 'blockingGates' | 'reasons'>;

  // Fresh arrays every call: callers append to `reasons`, and a builder may hand
  // back an array it does not own (the premise findings).
  const fire = (rule: RouteRule, preamble: readonly string[]): ChangeRoute => ({
    ...base,
    ...rule.extra?.(c),
    next: rule.next === null || typeof rule.next === 'string' ? rule.next : rule.next.resolve(c),
    code: rule.code,
    blockingGates: [...rule.gates(c)],
    reasons: [...preamble, ...rule.reasons(c)],
  });

  const global = table.global.find((rule) => rule.when(c));
  if (global !== undefined) return fire(global, []);
  const branch = table.branches.find((b) => b.statuses.includes(facts.status));
  const rule = branch?.rules.find((r) => r.when(c));
  if (branch === undefined || rule === undefined) {
    throw new Error(`routing table has no rule for status "${facts.status}"`);
  }
  return fire(rule, branch.preamble?.(c) ?? []);
}

/** Route one in-flight change to its next SDD station. Pure — no I/O. */
export function routeChange(facts: ChangeRouteFacts): ChangeRoute {
  return routeWith(ROUTING_TABLE, facts);
}

/**
 * The canonical skill identity for a change's next station — what `prospec
 * status` names as the primary target, because it is the one form every host can
 * act on: a host with its own skill mechanism invokes it, a host without one
 * resolves it to a file through `resolveNextSkillPath`.
 *
 * Pure — no I/O, and deliberately independent of the configured agents: the
 * identity exists even where no deployment root does, so an unreadable or empty
 * agent configuration costs the caller the fallback path, never the target.
 * Returns null only for a terminal change (no next station).
 */
export function resolveNextSkill(station: RouteTarget | null): string | null {
  return station === null ? null : ROUTE_TARGET_SKILLS[station];
}

/**
 * Resolve the skill file path for a change's next station, so `prospec status`
 * can hand a host with no skill mechanism of its own an actionable read target
 * (Station Transition Protocol).
 *
 * Pure — no I/O. The caller passes the project's configured agent names (from
 * `config.agents`) and the routed next station. The canonical skill path is the
 * FIRST configured agent's registry `skillPath` (every agent's per-station
 * subdirectory is identically named, so the choice is only which root to show).
 * The host-neutral canonical Skill name in `next:` stays the primary reference;
 * this path is an actionable read-target hint. `ROUTE_TARGET_SKILLS[station]` is
 * already the Skill directory name (so `story` → `prospec-new-story`, not
 * `prospec-story`).
 *
 * Returns null — never a hardcoded directory — when there is no next station
 * (terminal) or no agent is configured, so the formatter can fall back to the
 * bare slash command.
 */
export function resolveNextSkillPath(
  agentNames: readonly string[],
  station: RouteTarget | null,
): string | null {
  if (station === null) return null;
  const root = resolveSkillRoot(agentNames);
  if (root === null) return null;
  return `${root}/${ROUTE_TARGET_SKILLS[station]}/SKILL.md`;
}

/**
 * The deployment root the first configured agent uses, or null when the project
 * configures none. Extracted so the next station's skill path and its reference
 * paths come from ONE resolution — a second derivation is how they would end up
 * naming different hosts for the same route.
 */
export function resolveSkillRoot(agentNames: readonly string[]): string | null {
  if (agentNames.length === 0) return null;
  return AGENT_CONFIGS[agentNames[0] as ValidAgent]?.skillPath ?? null;
}
