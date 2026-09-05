import type { ChangeScale, ChangeStatus, GateResult, VerifyGrade } from './change.js';

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
 * string from the latest entry, per skill, whose `result` is `WARN`. Display
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

/** One routed in-flight change — the router's whole verdict. */
export interface ChangeRoute {
  name: string;
  status: ChangeStatus;
  scale: ChangeScale;
  /** The last completed station (what `status` records). */
  current: SddStation;
  /** Suggested next station; null only at the terminal `archived`. */
  next: SddStation | null;
  /** Why the change was placed here, as a stable code (`reasons` carries the prose). */
  code: WorkflowReasonCode;
  /** Resolved skill file path for `next` (e.g. `.claude/skills/prospec-verify/SKILL.md`),
   *  so `prospec status` can hand the agent an actionable read target. Absent when the
   *  change is terminal (`next` is null) or the project configures no agent — never a
   *  hardcoded skills directory. Filled by the service; the router leaves it unset. */
  nextSkillPath?: string;
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
