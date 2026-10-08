import type { ChangeRouteFacts, WorkflowReason } from '../../src/types/status.js';
import { CHANGE_SCALES, type ChangeStatus } from '../../src/types/change.js';

/**
 * Deterministic `ChangeRouteFacts` for whole-router properties: per status, every
 * scale × premise × escalation history × retry bound × pass-through field shape ×
 * value of each fact that status's branch reads, with the facts no branch of that
 * status reads filled from a seeded stream. `randomRoutingFacts` draws every fact
 * from the same value sets.
 */

const UNSYNCED: WorkflowReason = { code: 'KNOWLEDGE_UNSYNCED', message: 'stale: services', remediation: 'verify' };
const INVALID: WorkflowReason = { code: 'KNOWLEDGE_INPUT_INVALID', message: 'bad id', remediation: 'rename' };

const event = (event_id: string, station: 'prospec-plan' | 'prospec-review', ordinal: number) =>
  ({ event_id, station, trigger: 'station_retry_limit_exceeded' as const, ordinal, legacy: false });

const HISTORIES: ChangeRouteFacts['escalationHistory'][] = [
  undefined,
  { events: [event('e1', 'prospec-plan', 1)], pending: null, grants: [], completeness: 'complete' },
  {
    events: [event('e1', 'prospec-plan', 1), event('e2', 'prospec-plan', 2)],
    pending: event('e2', 'prospec-plan', 2), grants: [], completeness: 'complete',
  },
  {
    events: [event('e2', 'prospec-plan', 1)], pending: event('e2', 'prospec-plan', 1), completeness: 'complete',
    grants: [{ event_id: 'e2', station: 'prospec-plan', grant_id: 'g1', reason: 'repair', consumed_by: null }],
  },
  {
    events: [event('e3', 'prospec-review', 1)], pending: event('e3', 'prospec-review', 1), completeness: 'complete',
    grants: [{ event_id: 'e3', station: 'prospec-review', grant_id: 'g2', reason: 'repair', consumed_by: null }],
  },
  // Grants that do not apply to the pending event: an earlier event's, and an already-consumed one.
  {
    events: [event('e4', 'prospec-plan', 1), event('e5', 'prospec-plan', 2)], pending: event('e5', 'prospec-plan', 2), completeness: 'complete',
    grants: [{ event_id: 'e4', station: 'prospec-plan', grant_id: 'g4', reason: 'repair', consumed_by: null }],
  },
  {
    events: [event('e6', 'prospec-plan', 1)], pending: event('e6', 'prospec-plan', 1), completeness: 'complete',
    grants: [{ event_id: 'e6', station: 'prospec-plan', grant_id: 'g6', reason: 'repair', consumed_by: 'attempt-1' }],
  },
] as ChangeRouteFacts['escalationHistory'][];

const PREMISES: ChangeRouteFacts['premise'][] = [
  undefined,
  { state: 'ready', findings: [], remedy: '', limitation: 'structural only' },
  { state: 'blocked', findings: ['missing source'], remedy: 'repair', limitation: 'structural only' },
] as ChangeRouteFacts['premise'][];

const DIMENSIONS = {
  lastPlanVerifierResult: [null, 'FAIL', 'PASS', 'WARN'],
  planFlawsStreak: [0, 2, 3],
  pauseAtPlan: [false, true],
  planSignedOff: [false, true],
  planChangedSinceVerifier: [false, true],
  uiScope: [null, 'full', 'partial', 'none'],
  hasDesignSpec: [false, true],
  lastTasksVerifierResult: [null, 'FAIL', 'PASS'],
  tasksFlawsStreak: [0, 2, 3],
  tasksShape: [[false, 0, 0], [true, 0, 0], [true, 3, 0], [true, 3, 1], [true, 2, 2]],
  hasReviewProvenance: [false, true],
  lastVerifyGrade: [null, 'S', 'A', 'B', 'D'],
  verifyBelowBarStreak: [0, 2, 3],
  knowledgeSyncReasons: [[], [UNSYNCED], [UNSYNCED, INVALID], [INVALID]],
  // Both sides of every streak bound: streaks 0/2/3 against limits 1 and 3.
  maxStationRetries: [1, 3],
  extras: [
    {},
    { issue: 'https://example.test/issues/1' },
    { unresolvedWarnings: [{ skill: 'prospec-plan', warning: 'w', date: '2026-10-08' }] },
    { unresolvedWarnings: [] },
  ],
} as const satisfies Record<string, readonly unknown[]>;

type Dimension = keyof typeof DIMENSIONS;

/** Read on every route, whatever the status — enumerated for every status. */
const SHARED_DIMENSIONS: Dimension[] = ['extras', 'maxStationRetries'];

/** The facts each status's branch reads — the grid enumerates these exhaustively. */
const BRANCH_DIMENSIONS: Record<ChangeStatus, Dimension[]> = {
  story: [],
  plan: ['lastPlanVerifierResult', 'planFlawsStreak', 'pauseAtPlan', 'planSignedOff', 'planChangedSinceVerifier', 'uiScope', 'hasDesignSpec'],
  tasks: ['lastTasksVerifierResult', 'tasksFlawsStreak', 'tasksShape'],
  implemented: ['hasReviewProvenance', 'lastVerifyGrade', 'verifyBelowBarStreak'],
  verified: ['lastVerifyGrade', 'verifyBelowBarStreak', 'knowledgeSyncReasons'],
  archived: [],
  abandoned: [],
};

/**
 * A 32-bit linear congruential stream — fixed seed, so every run sees the same facts.
 * `Math.imul` keeps the product exact (a plain `*` loses the low bits past 2^53),
 * and the index comes from the high bits, the well-mixed half of an LCG state.
 */
function seededPick(seed: number): <T>(values: readonly T[]) => T {
  let state = seed >>> 0;
  return (values) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return values[(state >>> 16) % values.length]!;
  };
}

function build(
  status: ChangeStatus,
  scale: ChangeRouteFacts['scale'],
  premise: ChangeRouteFacts['premise'],
  history: ChangeRouteFacts['escalationHistory'],
  fixed: Partial<Record<Dimension, unknown>>,
  pick: <T>(values: readonly T[]) => T,
): ChangeRouteFacts {
  const value = (d: Dimension): unknown => (d in fixed ? fixed[d] : pick(DIMENSIONS[d]));
  const [hasTasks, codeTasksTotal, codeTasksDone] = value('tasksShape') as [boolean, number, number];
  return {
    name: 'grid-change',
    status,
    scale,
    hasTasks,
    codeTasksTotal,
    codeTasksDone,
    hasDesignSpec: value('hasDesignSpec'),
    uiScope: value('uiScope'),
    hasReviewProvenance: value('hasReviewProvenance'),
    lastVerifyGrade: value('lastVerifyGrade'),
    lastPlanVerifierResult: value('lastPlanVerifierResult'),
    lastTasksVerifierResult: value('lastTasksVerifierResult'),
    verifyBelowBarStreak: value('verifyBelowBarStreak'),
    planFlawsStreak: value('planFlawsStreak'),
    tasksFlawsStreak: value('tasksFlawsStreak'),
    maxStationRetries: value('maxStationRetries'),
    pauseAtPlan: value('pauseAtPlan'),
    planSignedOff: value('planSignedOff'),
    planChangedSinceVerifier: value('planChangedSinceVerifier'),
    knowledgeSyncReasons: value('knowledgeSyncReasons'),
    ...(premise === undefined ? {} : { premise }),
    ...(history === undefined ? {} : { escalationHistory: history }),
    ...(value('extras') as object),
  } as ChangeRouteFacts;
}

function* product(dimensions: Dimension[]): Generator<Partial<Record<Dimension, unknown>>> {
  if (dimensions.length === 0) {
    yield {};
    return;
  }
  const [head, ...rest] = dimensions;
  for (const value of DIMENSIONS[head!]) {
    for (const tail of product(rest)) yield { [head!]: value, ...tail };
  }
}

/** Every grid point for one status. */
export function* routingFactsGrid(status: ChangeStatus): Generator<ChangeRouteFacts> {
  const pick = seededPick(42);
  for (const scale of CHANGE_SCALES) {
    for (const premise of PREMISES) {
      for (const history of HISTORIES) {
        for (const fixed of product([...SHARED_DIMENSIONS, ...BRANCH_DIMENSIONS[status]])) {
          yield build(status, scale, premise, history, fixed, pick);
        }
      }
    }
  }
}

/** `count` facts with every field drawn from the grid's value sets, status included. */
export function* randomRoutingFacts(count: number, seed: number, statuses: readonly ChangeStatus[]): Generator<ChangeRouteFacts> {
  const pick = seededPick(seed);
  for (let i = 0; i < count; i++) {
    yield build(pick(statuses), pick(CHANGE_SCALES), pick(PREMISES), pick(HISTORIES), {}, pick);
  }
}
