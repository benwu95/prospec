import { describe, expect, it } from 'vitest';
import {
  STATION_REFERENCES,
  type StationReferenceEntry,
  type StationReferenceUse,
} from '../../../src/types/station-references.js';
import { validateStationReferences } from '../../helpers/station-references.js';
import {
  SKILL_DEFINITIONS,
  STATION_REFERENCES as REEXPORTED,
  skillHasReferences,
} from '../../../src/types/skill.js';
import RAW_BASELINE from '../../fixtures/station-reference-baseline.json' with { type: 'json' };

/** The frozen pre-migration inventory, read by skill name rather than by a key
 *  the fixture happens to have today. */
const BASELINE = RAW_BASELINE as unknown as {
  hosts: Record<string, { skill_path: string; references: Record<string, string[]> }>;
  prose_sites: Record<string, Record<string, string[]>>;
};

const entries = () => Object.entries(STATION_REFERENCES);

describe('STATION_REFERENCES contract (REQ-TYPES-099)', () => {
  const skillNames = SKILL_DEFINITIONS.map((skill) => skill.name);

  it('is the single entry point, re-exported unchanged from types/skill.ts', () => {
    expect(REEXPORTED).toBe(STATION_REFERENCES);
  });

  it('satisfies every closure rule', () => {
    expect(validateStationReferences(STATION_REFERENCES, skillNames)).toEqual([]);
  });

  it('covers exactly the shipped skills, empty sets declared explicitly', () => {
    expect(Object.keys(STATION_REFERENCES).sort()).toEqual([...skillNames].sort());
    for (const [skill, entry] of entries()) {
      expect(Array.isArray(entry.files), skill).toBe(true);
      expect(Array.isArray(entry.uses), skill).toBe(true);
      expect(Array.isArray(entry.slots), skill).toBe(true);
    }
  });

  /**
   * Each rule is exercised on a registry built to break it. Asserting the rules
   * only against the shipped (valid) registry would keep them green forever,
   * whether or not they are implemented at all.
   */
  describe('each closure rule refuses a registry that breaks it', () => {
    const file = { templateName: 'x.hbs', outputName: 'x.md', title: 'X' };
    const use: StationReferenceUse = {
      id: 'u1',
      phase: 'Phase 1',
      site: 'Phase 1',
      target: { kind: 'reference', reference: 'x.md' },
      purpose: 'a purpose',
      loading: 'in-phase',
    };
    const valid = { files: [file], uses: [use], slots: [] };
    const check = (entry: StationReferenceEntry) => validateStationReferences({ 'prospec-x': entry }, ['prospec-x']);

    it('accepts the minimal valid entry', () => {
      expect(check(valid)).toEqual([]);
    });

    it.each([
      ['no registry entry', {}, ['prospec-x']],
      ['not a shipped skill', { 'prospec-x': valid, 'prospec-ghost': valid }, ['prospec-x']],
    ] as const)('%s', (message, registry, names) => {
      expect(validateStationReferences(registry, names).join('\n')).toContain(message);
    });

    it.each([
      ['duplicate reference file', { ...valid, files: [file, file] }],
      ['is not a .hbs', { ...valid, files: [{ ...file, templateName: 'x.md' }] }],
      ['is not a kebab .md', { ...valid, files: [{ ...file, outputName: 'X.MD' }] }],
      ['has no title', { ...valid, files: [{ ...file, title: ' ' }] }],
      ['duplicate use id', { ...valid, uses: [use, { ...use, phase: 'Phase 2' }] }],
      ['has no purpose', { ...valid, uses: [{ ...use, purpose: ' ' }] }],
      ['has no site', { ...valid, uses: [{ ...use, site: ' ' }] }],
      ['has no phase', { ...valid, uses: [{ ...use, phase: ' ' }] }],
      ['names unknown scale', { ...valid, uses: [{ ...use, scales: ['huge'] as never }] }],
      ['names unknown UI scope', { ...valid, uses: [{ ...use, uiScopes: ['maybe'] as never }] }],
      ['unknown loading kind', { ...valid, uses: [{ ...use, loading: 'someday' as never }] }],
      ['points at undeclared', { ...valid, uses: [{ ...use, target: { kind: 'reference', reference: 'y.md' } as const }] }],
      ['has no load point', { files: [file], uses: [], slots: [] }],
      ['renders no use', { ...valid, slots: [{ id: 's', site: 'Phase 1', groups: [] }] }],
      [
        'names unknown use',
        { ...valid, slots: [{ id: 's', site: 'Phase 1', groups: [{ uses: ['nope'], joiner: '', tail: '' }] }] },
      ],
      [
        'slot s has no site',
        { ...valid, slots: [{ id: 's', site: ' ', groups: [{ uses: ['u1'], joiner: '', tail: '' }] }] },
      ],
      [
        'duplicate slot id',
        {
          ...valid,
          slots: [
            { id: 's', site: 'Phase 1', groups: [{ uses: ['u1'], joiner: '', tail: '' }] },
            { id: 's', site: 'Phase 1', groups: [{ uses: ['u1'], joiner: '', tail: '' }] },
          ],
        },
      ],
      [
        'marks MANDATORY inconsistently',
        {
          ...valid,
          slots: [
            { id: 's', site: 'Phase 1', prefix: '**MANDATORY** — ', groups: [{ uses: ['u1'], joiner: '', tail: '' }] },
          ],
        },
      ],
    ] as const)('%s', (message, entry) => {
      expect(check(entry as StationReferenceEntry).join('\n')).toContain(message);
    });
  });
});

/**
 * The registry is compared against the PRE-MIGRATION inventory captured from the
 * then-current agent-sync owner, never against itself. Every skill already moved
 * into the registry is held to it: its deployed file set and every load point's
 * site must be what the shipped instructions had before this change.
 */
describe('registry agrees with the pre-migration baseline (REQ-TEMPLATES-232)', () => {
  const migrated = entries().filter(([, entry]) => entry.files.length > 0);
  // The old prose also contains reminders/attributions, not additional reads.
  // Keep each exception explicit (never exempt an entire phase or derive the
  // expected sites from today's registry), so a deleted load point stays red.
  const reminders: Record<string, [string, string][]> = {
    'prospec-plan': [['NEVER', 'plan-verifier-rubric.md']],
    'prospec-tasks': [['Activation', 'tasks-format.md'], ['NEVER', 'tasks-verifier-rubric.md']],
    // Phase 5 attributes the existing tasks.md grouping to its Phase 4 format.
    'prospec-ff': [['Core Workflow > Phase 5: Autonomous Execution & Cascading (when cascading active)', 'tasks-format.md']],
    'prospec-review': [['Output Contract > Success Criteria', 'project-test-runner.md']],
    'prospec-verify': [['NEVER', 'verify-backfill.md']],
    // Parenthetical reminder explicitly says it is already read at Phase 4.5.
    'prospec-archive': [['Startup Loading', 'promotion-format.md']],
    // Precondition confirms the Startup Loading read has already happened.
    'prospec-learn': [['Entry Gate', 'promotion-format.md']],
  };

  it('covers every skill that deployed references before the migration', () => {
    const before = Object.entries(BASELINE.hosts.claude!.references)
      .filter(([, files]) => files.length > 0)
      .map(([skill]) => skill)
      .sort();
    expect(migrated.map(([skill]) => skill).sort()).toEqual(before);
    // …and the derived flag is that same set, with no hand-written second copy.
    expect(SKILL_DEFINITIONS.filter((s) => skillHasReferences(s.name)).map((s) => s.name).sort())
      .toEqual(before);
  });

  it.each(migrated.map(([skill]) => skill))('%s deploys the pre-migration file set', (skill) => {
    const expected = BASELINE.hosts.claude!.references[skill];
    expect(STATION_REFERENCES[skill]!.files.map((file) => file.outputName).sort()).toEqual(expected);
  });

  it.each(migrated.map(([skill]) => skill))('%s cites every load point where it did', (skill) => {
    const sites = BASELINE.prose_sites[skill]!;
    const represented = new Map<string, Set<string>>();
    const add = (site: string, reference: string) => {
      if (!represented.has(site)) represented.set(site, new Set());
      represented.get(site)!.add(reference);
    };
    for (const use of STATION_REFERENCES[skill]!.uses) {
      if (use.target.kind !== 'reference') continue;
      expect(sites[use.site] ?? [], `${skill}: ${use.id}`).toContain(use.target.reference);
      add(use.site, use.target.reference);
    }
    for (const slot of STATION_REFERENCES[skill]!.slots) {
      const rendered = slot.groups
        .flatMap((group) => group.uses)
        .map((id) => STATION_REFERENCES[skill]!.uses.find((use) => use.id === id)!)
        .flatMap((use) => (use.target.kind === 'reference' ? [use.target.reference] : []));
      for (const reference of rendered) {
        expect(sites[slot.site] ?? [], `${skill}: ${slot.id}`).toContain(reference);
        add(slot.site, reference);
      }
    }
    // Equality in both directions: iterating only current uses cannot detect a
    // phase deleted from the registry while the frozen prose still requires it.
    for (const [site, reference] of reminders[skill] ?? []) {
      expect(sites[site], `${skill}: frozen reminder ${site}`).toContain(reference);
    }
    const expected = Object.entries(sites)
      .map(([site, refs]) => [site, refs.filter((ref) =>
        !(reminders[skill] ?? []).some(([echoSite, echoRef]) => site === echoSite && ref === echoRef),
      ).sort()] as const)
      .filter(([, refs]) => refs.length > 0);
    expect(Object.fromEntries([...represented].map(([site, refs]) => [site, [...refs].sort()])))
      .toEqual(Object.fromEntries(expected));
  });
});

/**
 * The legacy startup inventory is derived from the literal `**MANDATORY**` marker,
 * and its recorded ceilings were measured without the one requirement declared
 * another way. The registry states that requirement AND keeps it out of the
 * marker-derived set, so neither half can be lost to the other.
 */
describe('startup-mandatory stays the legacy metric boundary (REQ-TESTS-116)', () => {
  const mandatory = (skill: string) =>
    STATION_REFERENCES[skill]!.uses.filter((use) => use.loading === 'startup-mandatory');

  it('keeps verify-backfill required but outside the marker-derived inventory', () => {
    const use = STATION_REFERENCES['prospec-verify']!.uses.find((u) => u.id === 'startup-verify-backfill')!;
    expect(use.loading).toBe('startup-conditional');
    expect(use.scales).toEqual(['backfill']);
    expect(use.conditionHint).toBeTruthy();
    expect(mandatory('prospec-verify')).toEqual([]);
  });

  it('declares the implement station project dependency the inventory measures', () => {
    const targets = mandatory('prospec-implement').map((use) => use.target);
    expect(targets).toContainEqual({ kind: 'project', path: '{{knowledge_base_path}}/_conventions.md' });
    expect(targets).toContainEqual({ kind: 'reference', reference: 'implementation-guide.md' });
  });

  it('marks exactly the stations whose Startup Loading carries a MANDATORY read', () => {
    const marked = Object.keys(STATION_REFERENCES).filter((skill) => mandatory(skill).length > 0).sort();
    expect(marked).toEqual([
      'prospec-design',
      'prospec-implement',
      'prospec-learn',
      'prospec-new-story',
      'prospec-promote-backfill',
      'prospec-review',
      'prospec-tasks',
    ]);
  });
});
