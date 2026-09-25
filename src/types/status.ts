import type { ChangeScale, ChangeStatus, GateResult, VerifyGrade } from './change.js';
import type { ReferenceLoadKind } from './station-references.js';
import { PAUSE_AT_ENV_VAR, PAUSE_AT_NONE } from './config.js';

/**
 * SDD station-routing contract — the types behind `prospec status`.
 *
 * The station order and every edge's gate are defined by
 * `prospec/ai-knowledge/_status-lifecycle.md`; `lib/status-router.ts` is the
 * executable copy of those rules. These types only carry the computed result:
 * per in-flight change, the current node, the suggested next station, the
 * blocking gates on the edge ahead, and the reasons for the placement.
 */

/**
 * Workflow stations in canonical SDD order. Wider than `CHANGE_STATUSES`:
 * design, review (and the periodic learn, which is not a linear station) own
 * no `status` transition, so resume logic places them by this order — never
 * by `status` alone.
 *
 * `promote` is the backfill lifecycle ENTRY (`prospec-promote-backfill`), not a
 * step every change walks: a scale whose contract has neither a plan nor a task
 * list has no forward planning station, so its only route until it reaches
 * `implemented` is finishing its promotion. It sits immediately before
 * `implement` because that is the status the promotion lands at.
 */
export const SDD_STATIONS = [
  'story',
  'plan',
  'design',
  'tasks',
  'promote',
  'implement',
  'review',
  'verify',
  'knowledge-update',
  'archive',
] as const;

export type SddStation = (typeof SDD_STATIONS)[number];

/** The skill that runs each station (what the formatter suggests to invoke). */
export const STATION_SKILLS: Record<SddStation, string> = {
  story: 'prospec-new-story',
  plan: 'prospec-plan',
  design: 'prospec-design',
  tasks: 'prospec-tasks',
  promote: 'prospec-promote-backfill',
  implement: 'prospec-implement',
  review: 'prospec-review',
  verify: 'prospec-verify',
  'knowledge-update': 'prospec-knowledge-update',
  archive: 'prospec-archive',
};

/**
 * Stable reason codes shared by the router (`ChangeRoute.code` — why a change was
 * placed where it was) and the archive Entry Gate (`WorkflowReason.code` — why a
 * target was refused). Frozen: an automation matches on these, never on the prose
 * beside them. Route codes come first, gate codes second.
 */
export const WORKFLOW_REASON_CODES = [
  // routing
  'LIFECYCLE_NEXT',
  'QUICK_SKIPS_PLAN',
  'PROMOTION_INCOMPLETE',
  'DESIGN_REQUIRED',
  'PLAN_VERIFIER_FAILED',
  'TASKS_VERIFIER_FAILED',
  'REVIEW_PENDING',
  'VERIFY_PENDING',
  'VERIFY_GRADE_BELOW_BAR',
  'KNOWLEDGE_UNSYNCED',
  'TERMINAL',
  'ESCALATE_TO_HUMAN',
  'AWAITING_HUMAN_PLAN_SIGNOFF',
  'PLAN_VERIFIER_PENDING',
  // archive Entry Gate
  'CHECK_UNPROVABLE',
  'TASKS_INCOMPLETE',
  'METADATA_INCOMPLETE',
  'REVIEW_STALE',
  'TESTS_STALE',
  'DELTA_SPEC_STALE',
] as const;

export type WorkflowReasonCode = (typeof WORKFLOW_REASON_CODES)[number];

/**
 * The route codes that stop the loop for a human rather than naming a station:
 * a non-archived route with `next: null` carries one of these, never anything else.
 */
export const HUMAN_HALT_CODES = ['ESCALATE_TO_HUMAN', 'AWAITING_HUMAN_PLAN_SIGNOFF'] as const;
export type HumanHaltCode = (typeof HUMAN_HALT_CODES)[number];

export function isHumanHaltCode(code: WorkflowReasonCode): code is HumanHaltCode {
  return (HUMAN_HALT_CODES as readonly WorkflowReasonCode[]).includes(code);
}

/** The ways out of a plan sign-off pause that cannot be signed — one text for the router's
 *  AWAITING reason and the `--signoff` refusal, so the two never disagree. */
export const PLAN_SIGNOFF_REMEDIES = `record the plan verifier report after candidates/decision.json is written (re-running the Phase 4 candidate selection first when there is none), add \`graded_by\` to a legacy decision.json and re-record the plan verifier, or — only on the human's instruction — skip the pause for one run with ${PAUSE_AT_ENV_VAR} set to ${PAUSE_AT_NONE} or empty`;

/**
 * The Break-Glass marker: a `WARN` quality_log entry whose warning opens with this
 * prefix is a documented manual override and supersedes a station's recorded
 * verifier FAIL. One constant, rendered into the skill templates by `agent sync`
 * and read by the status service — never a second hand-typed copy.
 */
export const BREAK_GLASS_PREFIX = 'Manual override:';

/** A refusal or placement, machine-matchable by `code`, human-actionable by `remediation`. */
export interface WorkflowReason {
  code: WorkflowReasonCode;
  message: string;
  remediation: string;
}

/** proposal.md `## UI Scope` values (design engages only on full/partial). */
export const UI_SCOPES = ['full', 'partial', 'none'] as const;
export type UiScope = (typeof UI_SCOPES)[number];

/**
 * One unresolved WARN surfaced from a change's `quality_log`: a single warning
 * string from the latest entry, per skill, whose `result` is `WARN` — a plan
 * sign-off entry is provenance, not a gate result, so it never counts as that
 * latest entry. Display
 * data only — `prospec status` lists it so a station skill need not re-read the
 * `quality_log` itself.
 */
export interface UnresolvedWarning {
  skill: string;
  warning: string;
  date: string;
}

/**
 * The facts `routeChange` consumes — gathered by `status.service.ts` so the
 * router itself stays I/O-free (drift-checker precedent: collectors do I/O,
 * evaluators are pure).
 */
export interface ChangeRouteFacts {
  name: string;
  status: ChangeStatus;
  /** Resolved scale — an absent metadata `scale` reads as `standard`. */
  scale: ChangeScale;
  hasTasks: boolean;
  hasDesignSpec: boolean;
  /** null when proposal.md declares no `## UI Scope` (the deterministic
   *  reading for routing: only an explicit full/partial engages design). */
  uiScope: UiScope | null;
  codeTasksTotal: number;
  codeTasksDone: number;
  hasReviewProvenance: boolean;
  /** Latest `prospec-verify` quality_log grade, null when never verified. */
  lastVerifyGrade: VerifyGrade | null;
  /**
   * The plan / tasks station's latest recorded verifier result, null when none.
   * Read by PROVENANCE, not by `result`: only an entry the sink (`prospec change
   * log --verifier-report`) stamped with `verifier_verdict` counts (`FLAWS` →
   * FAIL, else PASS/WARN), plus a Break-Glass `WARN` whose warning opens with
   * `BREAK_GLASS_PREFIX`; a station's own unstamped Exit Gate entry is neither a
   * verifier result nor able to hide one. The service derives it; the router only
   * reads it.
   */
  lastPlanVerifierResult: GateResult | null;
  lastTasksVerifierResult: GateResult | null;
  /** Trailing below-bar verify grades (B/C/D), reset by S or A. */
  verifyBelowBarStreak: number;
  /** Trailing plan verifier FLAWS results, reset by PASS/WARN or Break-Glass. */
  planFlawsStreak: number;
  /** Trailing tasks verifier FLAWS results, reset by PASS/WARN or Break-Glass. */
  tasksFlawsStreak: number;
  /** Resolved maximum station retries bound. */
  maxStationRetries: number;
  /** Whether the resolved pause stations (`PROSPEC_PAUSE_AT` / `workflow.pause_at`)
   *  include `plan`. The router alone decides whether the scale is eligible. */
  pauseAtPlan: boolean;
  /** Whether a plan sign-off sits after the latest plan verifier result (and
   *  that result is PASS/WARN) — judged by quality_log position, not by date. */
  planSignedOff: boolean;
  /** Whether affected-module Knowledge is confirmed synced for this change. */
  hasKnowledgeSync: boolean;
  /** Unresolved WARNs computed from this change's `quality_log` (empty when
   *  none). Display data, NOT a routing fact; the router forwards it to the
   *  route only when non-empty (see `ChangeRoute.unresolvedWarnings`). */
  unresolvedWarnings?: UnresolvedWarning[];
  /** Registered external-tracker reference (metadata `issue`), absent when the
   *  change registered none. Display data, NOT a routing fact — every station
   *  verdict is computed as if it were not here. */
  issue?: string;
}

/**
 * One row of the next station's reference map: a load point that station reaches,
 * the deployed path to read, and why. Display data derived from
 * `STATION_REFERENCES` — the router decides nothing from it.
 */
export interface StationReferenceMapRow {
  /** Load-point label as the station calls it (`Startup Loading`, `Phase 4`). */
  phase: string;
  /** Deployed path under the resolved skill directory. */
  referencePath: string;
  /** One line: what the station reads it for. */
  purpose: string;
  loading: ReferenceLoadKind;
  /** A runtime condition status cannot decide (absent when unconditional). */
  conditionHint?: string;
}

/** One routed in-flight change — the router's whole verdict. */
export interface ChangeRoute {
  name: string;
  status: ChangeStatus;
  scale: ChangeScale;
  /** The last completed station (what `status` records). */
  current: SddStation;
  /** Suggested next station; null at the terminal `archived` and on a
   *  `HUMAN_HALT_CODES` route, where the next actor is a human. */
  next: SddStation | null;
  /** Why the change was placed here, as a stable code (`reasons` carries the prose). */
  code: WorkflowReasonCode;
  /** Canonical skill identity for `next` (`STATION_SKILLS[next]`, e.g. `prospec-verify`),
   *  so `prospec status` can hand the agent a target its own skill mechanism can load.
   *  Present for every route with a next station — including one whose agent configuration
   *  is missing or unreadable, because the identity does not depend on a deployment root.
   *  Absent whenever `next` is null. Display data: it decides no routing.
   *  Filled by the service; the router leaves it unset. */
  nextSkill?: string;
  /** Resolved skill file path for `next` (e.g. `.claude/skills/prospec-verify/SKILL.md`),
   *  the FALLBACK for a host with no skill-loading mechanism of its own. Absent when
   *  `next` is null or the project configures no agent — never a
   *  hardcoded skills directory. Filled by the service; the router leaves it unset. */
  nextSkillPath?: string;
  /** The next station's reference map, filtered to this change's known scale and
   *  UI scope and resolved against the same agent deployment `nextSkillPath` uses.
   *  Additive and display-only: absent when `next` is null, when no agent
   *  is configured, and empty when the next station deploys no references. */
  nextReferenceMap?: StationReferenceMapRow[];
  /** Gate/precondition text for the edge to `next`, from the lifecycle table. */
  blockingGates: string[];
  /** Why the router placed the change here (quick skip, backfill entry, …). */
  reasons: string[];
  /** Unresolved WARNs surfaced from `quality_log`, carried through for display
   *  only (absent when none) — like `issue`, never a routing input. */
  unresolvedWarnings?: UnresolvedWarning[];
  /** The registered tracker reference, carried through for display only. */
  issue?: string;
}

/**
 * What the drift report says, reported only when no change is in progress.
 *
 * Two states and no third: either the report can be trusted and carries
 * findings, or it cannot be trusted and says why. There is deliberately no
 * "clean" state — nothing to report is reported by omitting this entirely.
 */
export type DriftSignal =
  | {
      state: 'findings';
      count: number;
      recommendation: string;
    }
  | {
      state: 'unusable';
      /** `unreadable`: absent from disk it is simply omitted; this is malformed or off-schema.
       *  `stale`: its recorded digest names a different working tree than the one on disk.
       *  `unprovable`: it records no digest at all (an older engine wrote it), so its
       *  freshness is unmeasured — which is not the same as measured and wrong. */
      reason: 'unreadable' | 'stale' | 'unprovable';
      recommendation: string;
    };

/** A change whose metadata could not be routed — reported, never dropped. */
export interface ChangeRouteError {
  name: string;
  error: string;
}

/** The `prospec status` result over `.prospec/changes/`. */
export interface StatusReport {
  /** True when there is no in-flight change and no unroutable record. */
  clean: boolean;
  changes: ChangeRoute[];
  errors: ChangeRouteError[];
  /** Drift report state — present only when no change is in progress and there
   *  is something to say (findings, or a report that cannot be trusted). */
  drift?: DriftSignal;
}
