import { describe, it, expect } from 'vitest';
import {
  OTHERWISE,
  ROUTING_TABLE,
  routeChange,
  routeWith,
  type RouteRule,
  type RoutingTable,
} from '../../../src/lib/status-router.js';
import { CHANGE_STATUSES } from '../../../src/types/change.js';
import { HUMAN_HALT_CODES, WORKFLOW_REASON_CODES, type ChangeRouteFacts } from '../../../src/types/status.js';
import { routingFactsGrid } from '../../helpers/routing-facts-grid.js';

/** Structural invariants of the router's rule table, and the first-match semantics `routeWith` gives it. */

const allRules = (table: RoutingTable): RouteRule[] => [...table.global, ...table.branches.flatMap((b) => b.rules)];

describe('ROUTING_TABLE invariants', () => {
  it('a rule halts (next null, not TERMINAL) exactly when its code is a human halt code', () => {
    const halting = new Set(allRules(ROUTING_TABLE).filter((r) => r.next === null && r.code !== 'TERMINAL').map((r) => r.code));
    expect([...halting].sort()).toEqual([...HUMAN_HALT_CODES].sort());
  });

  it('every rule code is a registry member', () => {
    for (const rule of allRules(ROUTING_TABLE)) expect(WORKFLOW_REASON_CODES, rule.id).toContain(rule.code);
  });

  it('OTHERWISE closes every branch and appears nowhere else', () => {
    for (const branch of ROUTING_TABLE.branches) {
      const positions = branch.rules.flatMap((r, i) => (r.when === OTHERWISE ? [i] : []));
      expect(positions, branch.statuses.join('/')).toEqual([branch.rules.length - 1]);
    }
    expect(ROUTING_TABLE.global.some((r) => r.when === OTHERWISE)).toBe(false);
  });

  it('every change status belongs to exactly one branch', () => {
    for (const status of CHANGE_STATUSES) {
      expect(ROUTING_TABLE.branches.filter((b) => b.statuses.includes(status)), status).toHaveLength(1);
    }
    expect(ROUTING_TABLE.branches.flatMap((b) => b.statuses).sort()).toEqual([...CHANGE_STATUSES].sort());
  });

  it('rule ids are unique', () => {
    const ids = allRules(ROUTING_TABLE).map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('routeWith first-match semantics', { timeout: 60_000 }, () => {
  /** A copy of `table` whose rules record which one fired last for the next `routeWith` call. */
  function traced(table: RoutingTable): { table: RoutingTable; fired: () => string | undefined } {
    let fired: string | undefined;
    const wrap = (rule: RouteRule): RouteRule => ({
      ...rule,
      when: (c) => {
        const holds = rule.when(c);
        if (holds) fired = rule.id;
        return holds;
      },
    });
    return {
      table: {
        global: table.global.map(wrap),
        branches: table.branches.map((b) => ({ ...b, rules: b.rules.map(wrap) })),
      },
      fired: () => fired,
    };
  }

  // REVIEW_PENDING/review is a route the plan branch never produces, so every facts
  // set the probe takes over visibly changes route.
  const probeHolds = (f: ChangeRouteFacts): boolean => f.planSignedOff;
  const probe: RouteRule = {
    id: 'probe', label: 'probe', when: (c) => probeHolds(c.facts), code: 'REVIEW_PENDING', next: 'review',
    gates: () => ['probe gate'], reasons: () => ['probe reason'],
  };
  const planBranch = ROUTING_TABLE.branches.find((b) => b.statuses.includes('plan'))!;
  const insertAt = planBranch.rules.findIndex((r) => r.id === 'pause-no-verifier');
  const withProbe: RoutingTable = {
    ...ROUTING_TABLE,
    branches: ROUTING_TABLE.branches.map((b) => (b === planBranch
      ? { ...b, rules: [...b.rules.slice(0, insertAt), probe, ...b.rules.slice(insertAt)] }
      : b)),
  };

  it('an inserted rule changes exactly the routes it holds for and no earlier rule takes', () => {
    expect(insertAt).toBeGreaterThan(0);
    const original = traced(ROUTING_TABLE);
    const laterIds = new Set(planBranch.rules.slice(insertAt).map((r) => r.id));
    let changed = 0;
    let shadowed = 0;
    for (const status of CHANGE_STATUSES) {
      for (const facts of routingFactsGrid(status)) {
        const before = JSON.stringify(routeWith(original.table, facts));
        const firedBefore = original.fired();
        const after = JSON.stringify(routeWith(withProbe, facts));
        const expectChange = facts.status === 'plan' && probeHolds(facts) && laterIds.has(firedBefore!);
        expect(after !== before, `${firedBefore} ${JSON.stringify(facts)}`).toBe(expectChange);
        if (expectChange) changed++;
        else if (facts.status === 'plan' && probeHolds(facts)) shadowed++;
      }
    }
    expect(changed).toBeGreaterThan(0);
    expect(shadowed).toBeGreaterThan(0);
  });
});

describe('routeWith refuses a table without a decision', () => {
  const facts = { ...routingFactsGrid('story').next().value!, status: 'story' as const };

  it('throws when no branch covers the status', () => {
    const noStory: RoutingTable = { global: [], branches: ROUTING_TABLE.branches.filter((b) => !b.statuses.includes('story')) };
    expect(() => routeWith(noStory, facts)).toThrow(/no rule for status "story"/);
  });

  it('throws when no rule of the branch holds', () => {
    const neverHolds: RoutingTable = {
      global: [],
      branches: [{ statuses: ['story'], rules: [{ ...ROUTING_TABLE.global[0]!, when: () => false }] }],
    };
    expect(() => routeWith(neverHolds, facts)).toThrow(/no rule for status "story"/);
  });
});

describe('route arrays are owned by the caller', () => {
  const base: ChangeRouteFacts = {
    name: 'c', status: 'plan', scale: 'standard', hasTasks: false, hasDesignSpec: false, uiScope: null,
    codeTasksTotal: 0, codeTasksDone: 0, hasReviewProvenance: false, lastVerifyGrade: null,
    lastPlanVerifierResult: null, lastTasksVerifierResult: null, knowledgeSyncReasons: [],
    verifyBelowBarStreak: 0, planFlawsStreak: 0, tasksFlawsStreak: 0, maxStationRetries: 3,
    pauseAtPlan: false, planSignedOff: false, planChangedSinceVerifier: false,
  };
  const premiseBlocked: ChangeRouteFacts = {
    ...base, premise: { state: 'blocked', findings: ['missing source'], remedy: 'repair', limitation: 'structural only' },
  };

  it.each([
    ['PREMISE_INCOMPLETE', premiseBlocked],
    ['LIFECYCLE_NEXT', base],
  ] as const)('mutating a %s route leaves later routes and the facts untouched', (code, facts) => {
    const first = routeChange(facts);
    expect(first.code).toBe(code);
    const pristine = JSON.stringify(routeChange(facts));
    first.reasons.push('appended');
    first.blockingGates.push('appended');
    expect(JSON.stringify(routeChange(facts))).toBe(pristine);
    expect(facts.premise?.findings ?? []).not.toContain('appended');
  });
});
