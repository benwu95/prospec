import { describe, it, expect } from 'vitest';
import { routeChange } from '../../../src/lib/status-router.js';
import type { ChangeRouteFacts } from '../../../src/types/status.js';
import { CHANGE_SCALES, CHANGE_STATUSES } from '../../../src/types/change.js';

/**
 * The router is the executable copy of `_status-lifecycle.md` — every edge,
 * the quick skip, the backfill entry, and the no-status-transition stations
 * (design/review) are pinned here so a lifecycle edit that misses the router
 * (or vice versa) turns red.
 */

function facts(overrides: Partial<ChangeRouteFacts> = {}): ChangeRouteFacts {
  return {
    name: 'test-change',
    status: 'story',
    scale: 'standard',
    hasTasks: false,
    hasDesignSpec: false,
    uiScope: null,
    codeTasksTotal: 0,
    codeTasksDone: 0,
    hasReviewProvenance: false,
    lastVerifyGrade: null,
    ...overrides,
  };
}

describe('status-router — lifecycle edges', () => {
  it('story (standard) → plan', () => {
    const route = routeChange(facts());
    expect(route.current).toBe('story');
    expect(route.next).toBe('plan');
    expect(route.blockingGates.join(' ')).toContain('plan.md + delta-spec.md');
  });

  it('story (full) → plan', () => {
    expect(routeChange(facts({ scale: 'full' })).next).toBe('plan');
  });

  it('story (quick) → tasks: the single legal skip, plan never demanded', () => {
    const route = routeChange(facts({ scale: 'quick' }));
    expect(route.next).toBe('tasks');
    expect(route.reasons.join(' ')).toContain('legal skip');
    // False-block audit (PB-002): the quick path must not gate on plan.md.
    expect(route.blockingGates.join(' ')).not.toContain('plan.md');
  });

  it('plan → tasks when no ui_scope is declared', () => {
    const route = routeChange(facts({ status: 'plan' }));
    expect(route.current).toBe('plan');
    expect(route.next).toBe('tasks');
  });

  it('plan → tasks when ui_scope is none', () => {
    expect(routeChange(facts({ status: 'plan', uiScope: 'none' })).next).toBe('tasks');
  });

  for (const uiScope of ['full', 'partial'] as const) {
    it(`plan → design when ui_scope is ${uiScope} and design-spec.md is absent`, () => {
      const route = routeChange(facts({ status: 'plan', uiScope }));
      expect(route.next).toBe('design');
      expect(route.reasons.join(' ')).toContain('owns no status transition');
    });
  }

  it('plan → tasks when ui_scope is full but design-spec.md already exists', () => {
    const route = routeChange(facts({ status: 'plan', uiScope: 'full', hasDesignSpec: true }));
    expect(route.next).toBe('tasks');
    expect(route.reasons.join(' ')).toContain('design station has already run');
  });

  it('tasks → implement with the checkbox completion gate', () => {
    const route = routeChange(
      facts({ status: 'tasks', hasTasks: true, codeTasksTotal: 10, codeTasksDone: 4 }),
    );
    expect(route.current).toBe('tasks');
    expect(route.next).toBe('implement');
    expect(route.blockingGates.join(' ')).toContain('4/10');
    expect(route.blockingGates.join(' ')).toContain('[M]/[V]');
  });

  it('tasks with a missing tasks.md surfaces the gap instead of passing vacuously', () => {
    const route = routeChange(facts({ status: 'tasks', hasTasks: false }));
    expect(route.blockingGates.join(' ')).toContain('tasks.md not found');
  });

  it('tasks with zero code tasks is an honest empty gate, never "all done"', () => {
    const route = routeChange(facts({ status: 'tasks', hasTasks: true, codeTasksTotal: 0 }));
    expect(route.blockingGates.join(' ')).toContain('no code tasks');
  });

  it('implemented without review_provenance → review (workflow order, not status)', () => {
    const route = routeChange(facts({ status: 'implemented' }));
    expect(route.current).toBe('implement');
    expect(route.next).toBe('review');
    expect(route.reasons.join(' ')).toContain('owns no status transition');
  });

  it('implemented with review_provenance → verify with the S/A gate', () => {
    const route = routeChange(facts({ status: 'implemented', hasReviewProvenance: true }));
    expect(route.next).toBe('verify');
    expect(route.blockingGates.join(' ')).toContain('grade S or A');
  });

  for (const grade of ['B', 'C', 'D'] as const) {
    it(`implemented with a prior verify grade ${grade} points back at verify with the fix reason`, () => {
      const route = routeChange(
        facts({ status: 'implemented', hasReviewProvenance: true, lastVerifyGrade: grade }),
      );
      expect(route.next).toBe('verify');
      expect(route.reasons.join(' ')).toContain(`grade ${grade} did not advance`);
    });
  }

  it('implemented with a prior grade A carries no fix reason', () => {
    const route = routeChange(
      facts({ status: 'implemented', hasReviewProvenance: true, lastVerifyGrade: 'A' }),
    );
    expect(route.reasons.join(' ')).not.toContain('did not advance');
  });

  it('verified → archive with the Knowledge-sync gate', () => {
    const route = routeChange(facts({ status: 'verified' }));
    expect(route.current).toBe('verify');
    expect(route.next).toBe('archive');
    expect(route.blockingGates.join(' ')).toContain('Knowledge synced');
  });

  it('archived is terminal — next is null, periodic learn applies', () => {
    const route = routeChange(facts({ status: 'archived' }));
    expect(route.next).toBeNull();
    expect(route.reasons.join(' ')).toContain('/prospec-learn');
  });
});

describe('status-router — backfill entry (never a skipped station)', () => {
  it('backfill at implemented is a legal entry, not a skip', () => {
    const route = routeChange(facts({ status: 'implemented', scale: 'backfill' }));
    expect(route.next).toBe('review');
    const text = route.reasons.join(' ');
    expect(text).toContain('legal lifecycle entry');
    expect(text).toContain('not a skipped station');
  });

  it('backfill with review done routes to verify like any other change', () => {
    const route = routeChange(
      facts({ status: 'implemented', scale: 'backfill', hasReviewProvenance: true }),
    );
    expect(route.next).toBe('verify');
    expect(route.reasons.join(' ')).toContain('legal lifecycle entry');
  });

  it('backfill never gates on the plan/tasks artifacts it legitimately lacks', () => {
    const route = routeChange(
      facts({ status: 'implemented', scale: 'backfill', hasTasks: false }),
    );
    const text = route.blockingGates.join(' ');
    expect(text).not.toContain('plan.md');
    expect(text).not.toContain('tasks.md');
  });
});

describe('status-router — an unfinished promotion routes to promote, never to a station that refuses it', () => {
  // Reachable state: /prospec-promote-backfill runs `change story` → `change scale
  // backfill` → `change status implemented`; interrupted between the last two, the
  // change sits at a pre-implemented status with no plan and no task list.
  it.each(['story', 'plan', 'tasks'] as const)(
    'backfill at %s routes to promote',
    (status) => {
      const route = routeChange(facts({ status, scale: 'backfill' }));
      expect(route.next).toBe('promote');
      expect(route.blockingGates.join(' ')).toContain('validate promote-scaffold');
      expect(route.reasons.join(' ')).toContain('the lifecycle entry is the promotion itself');
      // Never name a station the CLI refuses for this scale.
      expect(route.blockingGates.join(' ')).not.toContain('plan.md + delta-spec.md');
    },
  );

  it('stops routing to promote once the promotion has landed at implemented', () => {
    expect(routeChange(facts({ status: 'implemented', scale: 'backfill' })).next).toBe('review');
  });

  // `implemented` normally marks `implement` as the completed station, but a scale
  // with no task list never ran it — its `implemented` came from the promotion.
  it('credits promote, not implement, as the completed station for a landed backfill', () => {
    expect(routeChange(facts({ status: 'implemented', scale: 'backfill' })).current).toBe(
      'promote',
    );
    for (const scale of ['quick', 'standard', 'full'] as const) {
      expect(routeChange(facts({ status: 'implemented', scale })).current).toBe('implement');
    }
  });

  it('never routes quick to promote — quick has a tasks station', () => {
    for (const status of ['story', 'plan', 'tasks'] as const) {
      expect(routeChange(facts({ status, scale: 'quick' })).next).not.toBe('promote');
    }
  });
});

describe('status-router — full status × scale matrix stays lifecycle-consistent', () => {
  // Every combination routes without throwing and lands on a station the
  // lifecycle order permits from that status. `backfill`/`quick` specifics are
  // pinned above; this guards the whole input space against regressions.
  // Keyed by BOTH axes: a per-status union would let a wrong scale reach a station
  // that is legal for some other scale at that status (widening `tasks` to accept
  // `promote` once left `full × tasks` unpinned entirely).
  const NEXT_BY_STATUS_SCALE: Record<string, Record<string, string | null>> = {
    story: { quick: 'tasks', standard: 'plan', full: 'plan', backfill: 'promote' },
    plan: { quick: 'tasks', standard: 'tasks', full: 'tasks', backfill: 'promote' },
    tasks: { quick: 'implement', standard: 'implement', full: 'implement', backfill: 'promote' },
    implemented: { quick: 'review', standard: 'review', full: 'review', backfill: 'review' },
    verified: { quick: 'archive', standard: 'archive', full: 'archive', backfill: 'archive' },
    archived: { quick: null, standard: null, full: null, backfill: null },
  };

  for (const status of CHANGE_STATUSES) {
    for (const scale of CHANGE_SCALES) {
      it(`${status} × ${scale} routes to exactly its lifecycle-legal next station`, () => {
        const route = routeChange(facts({ status, scale }));
        expect(route.next).toBe(NEXT_BY_STATUS_SCALE[status]![scale]);
        expect(route.reasons.length).toBeGreaterThan(0);
      });
    }
  }

  // Both light scales skip plan, for different reasons: quick still has a tasks
  // station, backfill has none at all and owes a finished promotion instead.
  it('routes each scale at story per its artifact contract', () => {
    const expected: Record<string, string> = {
      quick: 'tasks',
      backfill: 'promote',
      standard: 'plan',
      full: 'plan',
    };
    for (const scale of CHANGE_SCALES) {
      expect(routeChange(facts({ status: 'story', scale })).next).toBe(expected[scale]);
    }
  });

  // Review F4 ruling (documented in _status-lifecycle.md): the router does not
  // suggest design under `scale: quick` — quick legally skips `plan`, the
  // station design hangs off; a quick UI change runs /prospec-design manually.
  // Every status, not just the two the ruling was written against: `plan` is
  // reachable under quick via a manual `change status plan`, and design hangs off
  // the plan station that quick's contract removes.
  it.each(['story', 'plan', 'tasks'] as const)(
    'quick with a declared ui_scope never routes to design (at %s)',
    (status) => {
      const expected = { story: 'tasks', plan: 'tasks', tasks: 'implement' } as const;
      for (const uiScope of ['full', 'partial'] as const) {
        const route = routeChange(facts({ status, scale: 'quick', uiScope }));
        expect(route.next).not.toBe('design');
        expect(route.next).toBe(expected[status]);
      }
    },
  );

  it('still routes standard and full to design when a ui_scope is declared', () => {
    for (const scale of ['standard', 'full'] as const) {
      expect(routeChange(facts({ status: 'plan', scale, uiScope: 'full' })).next).toBe('design');
    }
  });
});
