import type { ChangeScale, ChangeStatus, VerifyGrade } from './change.js';

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
 * `promote` is the backfill lifecycle ENTRY (`/prospec-promote-backfill`), not a
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
  'archive',
] as const;

export type SddStation = (typeof SDD_STATIONS)[number];

/** The skill that runs each station (what the formatter suggests to invoke). */
export const STATION_SKILLS: Record<SddStation, string> = {
  story: '/prospec-new-story',
  plan: '/prospec-plan',
  design: '/prospec-design',
  tasks: '/prospec-tasks',
  promote: '/prospec-promote-backfill',
  implement: '/prospec-implement',
  review: '/prospec-review',
  verify: '/prospec-verify',
  archive: '/prospec-archive',
};

/** proposal.md `## UI Scope` values (design engages only on full/partial). */
export const UI_SCOPES = ['full', 'partial', 'none'] as const;
export type UiScope = (typeof UI_SCOPES)[number];

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
  /** Gate/precondition text for the edge to `next`, from the lifecycle table. */
  blockingGates: string[];
  /** Why the router placed the change here (quick skip, backfill entry, …). */
  reasons: string[];
}

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
}
