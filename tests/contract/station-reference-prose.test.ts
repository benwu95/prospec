import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import BASELINE from '../fixtures/station-reference-baseline.json' with { type: 'json' };
import { BUNDLED_TEMPLATES } from '../../src/lib/bundled-templates.js';
import { projectStationDeployment, renderStationReferenceSlot } from '../../src/lib/skill-reference-map.js';
import { getSkillReferences } from '../../src/services/agent-sync.service.js';
import {
  carriesTextAt,
  citesReferenceAt,
  parseSkillReferenceProse,
} from '../../src/lib/skill-reference-prose.js';
import { renderTemplate } from '../../src/lib/template.js';
import {
  AGENT_CONFIGS,
  SKILL_DEFINITIONS,
  STATION_REFERENCES,
  skillHasReferences,
} from '../../src/types/skill.js';

const frozen = (BASELINE as unknown as { slot_text: Record<string, string> }).slot_text;

/** The minimal context every skill template renders against in the contract suite. */
const CONTEXT = {
  project_name: 'p',
  base_dir: 'prospec',
  knowledge_base_path: 'prospec/ai-knowledge',
  constitution_path: 'prospec/CONSTITUTION.md',
  skill_path: '.claude/skills',
  skill_description: 'd',
  trigger_words: 't',
  minimum_cli_version: '2.2.0',
  artifact_language: 'English',
  trust_zone_language: 'English',
};

const rendered = new Map(
  SKILL_DEFINITIONS.map((skill) => [skill.name, renderTemplate(`skills/${skill.name}.hbs`, CONTEXT)]),
);

const withSlots = SKILL_DEFINITIONS.filter((skill) => STATION_REFERENCES[skill.name]!.slots.length > 0);

describe('registry-rendered reference maps (REQ-TEMPLATES-232)', () => {
  it.each(withSlots.map((skill) => skill.name))('%s renders each map at its own site', (name) => {
    const prose = parseSkillReferenceProse(rendered.get(name)!);
    for (const slot of STATION_REFERENCES[name]!.slots) {
      const text = renderStationReferenceSlot(name, slot.id);
      // Same text, at the site the registry names — a map that drifted to another
      // section is not a map the station reaches.
      expect(carriesTextAt(prose, slot.site, text), `${name}: ${slot.id}`).toBe(true);
      // …and it is the pre-migration text, not merely self-consistent.
      expect(text).toBe(frozen[`${name}/${slot.id}`]);
    }
  });

  it.each(withSlots.map((skill) => skill.name))('%s names each slot exactly once in its source', (name) => {
    const source = BUNDLED_TEMPLATES[`skills/${name}.hbs`]!;
    for (const slot of STATION_REFERENCES[name]!.slots) {
      const calls = source.split(`{{stationReferences "${name}" "${slot.id}"}}`).length - 1;
      expect(calls, `${name}: ${slot.id}`).toBe(1);
    }
  });

  it.each(withSlots.map((skill) => skill.name))('%s keeps no hand-written copy of a rendered map', (name) => {
    const source = BUNDLED_TEMPLATES[`skills/${name}.hbs`]!;
    for (const slot of STATION_REFERENCES[name]!.slots) {
      // The rendered text must exist ONLY as the helper call. A literal copy left
      // behind is the double-write this registry exists to remove.
      expect(source, `${name}: ${slot.id}`).not.toContain(renderStationReferenceSlot(name, slot.id));
    }
  });
});

describe('every declared load point is cited where it is declared (REQ-TEMPLATES-232)', () => {
  it.each(SKILL_DEFINITIONS.map((skill) => skill.name))('%s', (name) => {
    const prose = parseSkillReferenceProse(rendered.get(name)!);
    expect(prose.unclosedFence).toBe(false);
    expect(prose.duplicateSites).toEqual([]);
    for (const use of STATION_REFERENCES[name]!.uses) {
      if (use.target.kind !== 'reference') continue;
      expect(citesReferenceAt(prose, use.site, use.target.reference), `${name}: ${use.id}`).toBe(true);
    }
  });
});

/**
 * The services facade and the deployment it produces (REQ-AGNT-030). Both are
 * compared against the FROZEN pre-migration inventory, not against the registry
 * that now feeds them, so the delegation cannot be proved by asking the same
 * source twice.
 */
describe('agent-sync deploys the pre-migration reference set (REQ-AGNT-030)', () => {
  const baseline = BASELINE as unknown as {
    hosts: Record<string, { skill_path: string; references: Record<string, string[]> }>;
  };

  it('keeps the facade importable and free of a second table', () => {
    const source = readFileSync(new URL('../../src/services/agent-sync.service.ts', import.meta.url), 'utf8');
    expect(source).toContain('export function getSkillReferences');
    expect(source).toContain('export type SkillReference');
    // A literal template name here would mean the table came back.
    expect(source).not.toMatch(/templateName:/);
  });

  it.each(SKILL_DEFINITIONS.map((skill) => skill.name))('%s: facade equals the registry projection', (name) => {
    expect(getSkillReferences(name)).toEqual(projectStationDeployment(name));
  });

  it.each(Object.keys(baseline.hosts))('%s deploys exactly the pre-migration file names', (host) => {
    for (const [skill, expected] of Object.entries(baseline.hosts[host]!.references)) {
      expect(getSkillReferences(skill).map((ref) => ref.outputName).sort(), skill).toEqual(expected);
      expect(skillHasReferences(skill), skill).toBe(expected.length > 0);
    }
  });

  it('resolves the four hosts onto their two deployment roots', () => {
    const roots = Object.fromEntries(
      Object.entries(baseline.hosts).map(([host, value]) => [host, value.skill_path]),
    );
    expect(roots).toEqual({
      claude: AGENT_CONFIGS.claude.skillPath,
      codex: AGENT_CONFIGS.codex.skillPath,
      copilot: AGENT_CONFIGS.copilot.skillPath,
      antigravity: AGENT_CONFIGS.antigravity.skillPath,
    });
    expect(new Set(Object.values(roots)).size).toBe(2);
  });
});
