import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Handlebars from 'handlebars';
import BASELINE from '../../fixtures/station-reference-baseline.json' with { type: 'json' };
import { registerHelper } from '../../../src/lib/template.js';
import {
  isUseApplicable,
  renderStationReferenceSlot,
  projectStartupMandatory,
  projectStationDeployment,
  projectStatusReferenceMap,
  undecidedCondition,
} from '../../../src/lib/skill-reference-map.js';
import {
  SKILL_DEFINITIONS,
  STATION_REFERENCES,
  type StationReferenceUse,
} from '../../../src/types/skill.js';

const status = (skill: string, overrides: Partial<Parameters<typeof projectStatusReferenceMap>[1]> = {}) =>
  projectStatusReferenceMap(skill, { scale: 'standard', uiScope: null, skillPath: '.claude/skills', ...overrides });

describe('deployment projection (REQ-TYPES-099)', () => {
  it('deploys each file once however many phases read it', () => {
    const verify = projectStationDeployment('prospec-verify');
    expect(verify.map((file) => file.outputName)).toEqual([
      'verify-backfill.md',
      'debug-recovery-format.md',
      'drift-report-format.md',
      'delegated-evidence-format.md',
      'cascade-protocol.md',
    ]);
    // verify-backfill is read at six load points and still deploys once.
    const uses = STATION_REFERENCES['prospec-verify']!.uses.filter(
      (use) => use.target.kind === 'reference' && use.target.reference === 'verify-backfill.md',
    );
    expect(uses.length).toBeGreaterThan(1);
  });

  it('returns an explicit empty list for a reference-free or unknown skill', () => {
    expect(projectStationDeployment('prospec-explore')).toEqual([]);
    expect(projectStationDeployment('prospec-not-a-skill')).toEqual([]);
  });

  it('keeps a stable order across calls for every skill', () => {
    for (const skill of SKILL_DEFINITIONS) {
      expect(projectStationDeployment(skill.name)).toEqual(projectStationDeployment(skill.name));
    }
  });
});

describe('status projection (REQ-SERVICES-111)', () => {
  it('resolves paths under the configured skill directory, never a hardcoded host root', () => {
    const rows = status('prospec-tasks', { skillPath: '.agents/skills' });
    expect(rows.map((row) => row.referencePath)).toEqual([
      '.agents/skills/prospec-tasks/references/tasks-format.md',
      '.agents/skills/prospec-tasks/references/tasks-format.md',
      '.agents/skills/prospec-tasks/references/tasks-verifier-rubric.md',
    ]);
    expect(rows[0]).toMatchObject({ phase: 'Startup Loading', loading: 'startup-mandatory' });
    expect(rows.every((row) => row.purpose.length > 0)).toBe(true);
  });

  it('keeps one row per load point, in registry order', () => {
    const rows = status('prospec-plan', { scale: 'full' });
    expect(rows.map((row) => row.phase)).toEqual([
      'Phase 4: Design plan.md',
      'Phase 4: Design plan.md',
      'Phase 5: Generate delta-spec.md',
      'Phase 6: Architecture Verification',
    ]);
  });

  it('drops load points a known scale excludes and keeps the ones it allows', () => {
    const quick = status('prospec-ff', { scale: 'quick' }).map((row) => row.phase);
    expect(quick).not.toContain('Phase 3: Plan Generation');
    expect(quick).toContain('Phase 4: Tasks Generation');
    expect(status('prospec-ff', { scale: 'full' }).map((row) => row.phase)).toContain('Phase 3: Plan Generation');
  });

  it('keeps a backfill-only load point only under backfill', () => {
    expect(status('prospec-verify', { scale: 'standard' }).map((row) => row.phase))
      .not.toContain('Entry Gate');
    expect(status('prospec-verify', { scale: 'backfill' }).map((row) => row.phase))
      .toContain('Entry Gate');
  });

  it('carries runtime conditions the projection cannot decide', () => {
    const row = status('prospec-review').find((r) => r.phase === 'Review Lenses');
    expect(row?.conditionHint).toMatch(/conditional lens/);
  });

  it('treats an undeclared UI scope as unknown, not as none', () => {
    const use: StationReferenceUse = {
      id: 'ui-only',
      phase: 'Phase 1',
      site: 'Phase 1',
      target: { kind: 'reference', reference: 'x.md' },
      purpose: 'a UI-only read',
      loading: 'in-phase',
      uiScopes: ['full', 'partial'],
    };
    expect(isUseApplicable(use, { scale: 'standard', uiScope: 'none' })).toBe(false);
    expect(isUseApplicable(use, { scale: 'standard', uiScope: 'full' })).toBe(true);
    // null is "the proposal declared no UI Scope", which is not a decision.
    expect(isUseApplicable(use, { scale: 'standard', uiScope: null })).toBe(true);
  });

  it('surfaces an undecidable UI predicate as a condition rather than dropping it', () => {
    const use: StationReferenceUse = {
      id: 'ui-only',
      phase: 'Phase 1',
      site: 'Phase 1',
      target: { kind: 'reference', reference: 'x.md' },
      purpose: 'a UI-only read',
      loading: 'in-phase',
      uiScopes: ['full', 'partial'],
    };
    expect(undecidedCondition(use, null)).toMatch(/UI scope/);
    expect(undecidedCondition(use, 'full')).toBeUndefined();
  });

  it('returns an empty map for a reference-free or unknown skill', () => {
    expect(status('prospec-explore')).toEqual([]);
    expect(status('prospec-not-a-skill')).toEqual([]);
  });

  it('skips project targets unless the project path is resolvable', () => {
    expect(status('prospec-implement').map((row) => row.referencePath))
      .not.toContain('prospec/ai-knowledge/_conventions.md');
    expect(
      status('prospec-implement', { knowledgeBasePath: 'prospec/ai-knowledge' }).map((row) => row.referencePath),
    ).toContain('prospec/ai-knowledge/_conventions.md');
  });
});

describe('startup-mandatory projection (REQ-TESTS-116)', () => {
  const options = { skillPath: '.agents/skills', knowledgeBasePath: 'prospec/ai-knowledge' };

  it('lists the marker-derived mandatory loads of a station, project files included', () => {
    expect(projectStartupMandatory('prospec-implement', options)).toEqual([
      '.agents/skills/prospec-implement/references/implementation-guide.md',
      'prospec/ai-knowledge/_conventions.md',
    ]);
    expect(projectStartupMandatory('prospec-tasks', options)).toEqual([
      '.agents/skills/prospec-tasks/references/tasks-format.md',
    ]);
  });

  it('excludes conditional and on-demand reads from the legacy startup metric', () => {
    expect(projectStartupMandatory('prospec-verify', options)).toEqual([]);
    expect(projectStartupMandatory('prospec-ff', options)).toEqual([]);
  });

  it('returns an empty list for a reference-free or unknown skill', () => {
    expect(projectStartupMandatory('prospec-explore', options)).toEqual([]);
    expect(projectStartupMandatory('prospec-not-a-skill', options)).toEqual([]);
  });
});

/**
 * `prospec status` calls these projections on its ordinary path. An import of the
 * renderer, the template bundle or a service here would put all of them on that
 * path, which the startup-module contract forbids — so the boundary is asserted
 * on the source itself rather than inferred from a measurement.
 */
describe('projection stays importable from the status path (REQ-SERVICES-111)', () => {
  it('imports nothing but types', () => {
    const source = readFileSync(
      new URL('../../../src/lib/skill-reference-map.ts', import.meta.url),
      'utf8',
    );
    const specifiers = [...source.matchAll(/^import[^']*'([^']+)'/gm)].map((match) => match[1]!);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((specifier) => !specifier.startsWith('../types/'))).toEqual([]);
  });
});

/**
 * Each slot must reproduce the prose the shipped instructions carried BEFORE the
 * migration, byte for byte. The expectation is the frozen capture, not another
 * call to the same renderer, so a registry edit that changes what an agent reads
 * cannot pass by changing both sides at once.
 */
describe('map slot rendering reproduces the pre-migration prose (REQ-TEMPLATES-232)', () => {
  const frozen = (BASELINE as unknown as { slot_text: Record<string, string> }).slot_text;

  it('covers exactly the declared slots', () => {
    const declared = Object.entries(STATION_REFERENCES)
      .flatMap(([skill, entry]) => entry.slots.map((slot) => `${skill}/${slot.id}`))
      .sort();
    expect(Object.keys(frozen).sort()).toEqual(declared);
  });

  it.each(Object.entries(frozen))('%s renders its frozen text', (key, expected) => {
    const [skill, slotId] = key.split('/') as [string, string];
    expect(renderStationReferenceSlot(skill, slotId)).toBe(expected);
  });

  it('writes a citation as a markdown link by default and as code when asked', () => {
    expect(renderStationReferenceSlot('prospec-tasks', 'startup-tasks-format'))
      .toContain('[`references/tasks-format.md`](references/tasks-format.md)');
    expect(renderStationReferenceSlot('prospec-promote-backfill', 'startup-format-references'))
      .toContain('`references/proposal-format.md`, `references/delta-spec-format.md`');
  });

  it('refuses an unknown skill or slot instead of rendering nothing', () => {
    expect(() => renderStationReferenceSlot('prospec-not-a-skill', 'startup')).toThrow(/Unknown skill/);
    expect(() => renderStationReferenceSlot('prospec-tasks', 'no-such-slot')).toThrow(/Unknown station reference slot/);
    expect(() => renderStationReferenceSlot('prospec-explore', 'startup')).toThrow(/Unknown station reference slot/);
  });
});

/**
 * The template boundary: a skill template asks for a slot by name and gets the
 * markdown verbatim. The helper returns a SafeString because the map IS markdown
 * (links, backticks) — a plain string would ship `&#x60;references/…&#x60;` into
 * every SKILL.md the day a caller compiles without `noEscape`.
 */
describe('the template helper emits the map unescaped (REQ-TEMPLATES-232)', () => {
  /** Registering any helper initializes the shared instance the skill templates use. */
  const compile = (source: string) => {
    registerHelper('stationReferencesTestProbe', () => '');
    return Handlebars.compile(source)({});
  };

  it('renders the same text renderStationReferenceSlot produces, escaping nothing', () => {
    const rendered = compile('{{stationReferences "prospec-tasks" "startup-tasks-format"}}');
    expect(rendered).toBe(renderStationReferenceSlot('prospec-tasks', 'startup-tasks-format'));
    expect(rendered).not.toContain('&#x60;');
  });

  it('needs no template context to reach the registry', () => {
    expect(compile('{{stationReferences "prospec-plan" "startup-phase-map"}}'))
      .toContain('[`references/plan-format.md`](references/plan-format.md)');
  });

  it('fails the render on an unknown slot rather than emitting an empty map', () => {
    expect(() => compile('{{stationReferences "prospec-tasks" "nope"}}')).toThrow(
      /Unknown station reference slot/,
    );
  });
});
