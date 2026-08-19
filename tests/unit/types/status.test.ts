import { describe, it, expect } from 'vitest';
import { SDD_STATIONS, STATION_SKILLS, UI_SCOPES } from '../../../src/types/status.js';
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
    // Shape alone would pass `/prospec-planning`; the formatter prints this string
    // as the command to run, so it must name a real skill.
    const deployed = new Set(SKILL_DEFINITIONS.map((s) => `/${s.name}`));
    for (const station of SDD_STATIONS) {
      expect(deployed, `station ${station} names a skill that is not deployed`).toContain(
        STATION_SKILLS[station],
      );
    }
  });

  it('routes the promote station at the backfill entry skill', () => {
    expect(STATION_SKILLS.promote).toBe('/prospec-promote-backfill');
  });

  it('routes the knowledge-update station at the knowledge update skill', () => {
    expect(STATION_SKILLS['knowledge-update']).toBe('/prospec-knowledge-update');
  });

  it('declares the three ui_scope values design engages on', () => {
    expect(UI_SCOPES).toEqual(['full', 'partial', 'none']);
  });
});
