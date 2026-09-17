import { describe, it, expect } from 'vitest';
import {
  SDD_STATIONS,
  STATION_SKILLS,
  UI_SCOPES,
  type ChangeRoute,
  type StationReferenceMapRow,
} from '../../../src/types/status.js';
import { SKILL_DEFINITIONS } from '../../../src/types/skill.js';

/**
 * The station vocabulary is the routing contract (REQ-TYPES-070): the router
 * names a station, the formatter turns it into a skill to invoke. A station with
 * no skill would print `undefined` at the one place the user is told what to run.
 */
describe('SDD_STATIONS (REQ-TYPES-070)', () => {
  it('is the canonical order, with non-status stations in place', () => {
    expect(SDD_STATIONS).toEqual([
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
    ]);
  });

  it('places promote immediately before implement — the status its promotion lands at', () => {
    expect(SDD_STATIONS.indexOf('promote')).toBe(SDD_STATIONS.indexOf('implement') - 1);
  });

  it('places knowledge-update immediately between verify and archive', () => {
    expect(SDD_STATIONS.indexOf('knowledge-update')).toBe(SDD_STATIONS.indexOf('verify') + 1);
    expect(SDD_STATIONS.indexOf('archive')).toBe(SDD_STATIONS.indexOf('knowledge-update') + 1);
  });

  it('maps every station to a skill that actually exists', () => {
    expect(Object.keys(STATION_SKILLS).sort()).toEqual([...SDD_STATIONS].sort());
    // Shape alone would pass `prospec-planning`; the formatter prints this
    // host-neutral identity, so it must name a real skill without a host sigil.
    const deployed = new Set(SKILL_DEFINITIONS.map((s) => s.name));
    for (const station of SDD_STATIONS) {
      expect(deployed, `station ${station} names a skill that is not deployed`).toContain(
        STATION_SKILLS[station],
      );
    }
  });

  it('routes the promote station at the backfill entry skill', () => {
    expect(STATION_SKILLS.promote).toBe('prospec-promote-backfill');
  });

  it('routes the knowledge-update station at the knowledge update skill', () => {
    expect(STATION_SKILLS['knowledge-update']).toBe('prospec-knowledge-update');
  });

  it('declares the three ui_scope values design engages on', () => {
    expect(UI_SCOPES).toEqual(['full', 'partial', 'none']);
  });
});

/**
 * The next-station reference map is ADDITIVE on `ChangeRoute` (REQ-SERVICES-111):
 * a consumer written before it must still read every field it read before, and a
 * route without a map must be indistinguishable from the pre-change shape.
 */
describe('ChangeRoute next-station reference map', () => {
  const base: ChangeRoute = {
    name: 'add-auth',
    status: 'implemented',
    scale: 'standard',
    current: 'implement',
    next: 'review',
    code: 'REVIEW_PENDING',
    blockingGates: [],
    reasons: [],
  };

  it('is optional — a route without one keeps the pre-change shape', () => {
    expect(Object.hasOwn(base, 'nextReferenceMap')).toBe(false);
    expect(JSON.parse(JSON.stringify(base))).toEqual(base);
  });

  it('carries the canonical skill identity additively beside the optional path', () => {
    // Identity and path are separate fields on purpose: the identity is what a
    // host invokes, the path is only the fallback a file-reading host needs.
    const route: ChangeRoute = {
      ...base,
      nextSkill: STATION_SKILLS.review,
      nextSkillPath: '.claude/skills/prospec-review/SKILL.md',
    };
    expect(route.nextSkill).toBe('prospec-review');
    expect({ ...route, nextSkill: undefined, nextSkillPath: undefined }).toMatchObject(base);
  });

  it('accepts an identity with no resolvable path (no agent configured)', () => {
    const route: ChangeRoute = { ...base, nextSkill: STATION_SKILLS.review };
    expect(Object.hasOwn(route, 'nextSkillPath')).toBe(false);
    expect(route.nextSkill).toBe('prospec-review');
  });

  it('keeps both absent at a terminal route', () => {
    const terminal: ChangeRoute = {
      ...base,
      current: 'archive',
      next: null,
      code: 'TERMINAL',
    };
    expect(Object.hasOwn(terminal, 'nextSkill')).toBe(false);
    expect(Object.hasOwn(terminal, 'nextSkillPath')).toBe(false);
  });

  it('carries a phase, a deployed path, a purpose and the load kind', () => {
    const row: StationReferenceMapRow = {
      phase: 'Startup Loading',
      referencePath: '.claude/skills/prospec-review/references/review-format.md',
      purpose: 'the severity contract',
      loading: 'startup-mandatory',
    };
    const route: ChangeRoute = { ...base, nextReferenceMap: [row] };
    expect(route.nextReferenceMap).toEqual([row]);
    // Every other field keeps its meaning beside it.
    expect({ ...route, nextReferenceMap: undefined }).toMatchObject(base);
  });

  it('accepts an undecidable runtime condition on a row', () => {
    const row: StationReferenceMapRow = {
      phase: 'Review Lenses',
      referencePath: '.claude/skills/prospec-review/references/review-lenses-content.md',
      purpose: 'the lens criteria',
      loading: 'in-phase',
      conditionHint: 'a conditional lens applies to this diff',
    };
    expect(row.conditionHint).toBeTruthy();
  });
});
