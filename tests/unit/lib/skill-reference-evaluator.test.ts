import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateSkillReferenceMap } from '../../../src/lib/drift-checker.js';
import type { SkillReferenceDeployment, SkillReferenceMapSource } from '../../../src/lib/drift-sources.js';
import { renderStationReferenceSlot } from '../../../src/lib/skill-reference-map.js';
import { STATION_REFERENCES } from '../../../src/types/skill.js';

const SKILL = 'prospec-tasks';
const SKILL_PATH = '.claude/skills';

/** The real deployed instructions — the bytes an agent actually reads. */
const deployedText = readFileSync(`${SKILL_PATH}/${SKILL}/SKILL.md`, 'utf8');
const deployedReferences = STATION_REFERENCES[SKILL]!.files.map((file) => file.outputName).sort();

function deployment(overrides: Partial<SkillReferenceDeployment> = {}): SkillReferenceDeployment {
  return {
    skill_path: SKILL_PATH,
    skill: SKILL,
    source_path: `${SKILL_PATH}/${SKILL}/SKILL.md`,
    text: deployedText,
    references: [...deployedReferences],
    ...overrides,
  };
}

const source = (deployments: SkillReferenceDeployment[]): SkillReferenceMapSource => ({
  available: true,
  deployments,
  roots: [SKILL_PATH],
  unreadableRoots: {},
});

const details = (src: SkillReferenceMapSource) =>
  evaluateSkillReferenceMap(src).findings.map((finding) => finding.detail);

describe('skill reference map evaluator (REQ-LIB-079)', () => {
  it('passes a deployment that still carries the registry map', () => {
    const result = evaluateSkillReferenceMap(source([deployment()]));
    expect(result.findings).toEqual([]);
    expect(result.result.status).toBe('pass');
  });

  it('fails a phase citation that was deleted while the startup summary survives', () => {
    // Strip every citation from the Phase 3 section only — the Startup Loading
    // summary still names the same file, which is exactly the shape that used to
    // pass unnoticed.
    const start = deployedText.indexOf('### Phase 3: Decompose by Architecture Layer');
    const end = deployedText.indexOf('### Phase 4', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = deployedText.slice(start, end);
    expect(section).toContain('references/tasks-format.md');
    const mutated =
      deployedText.slice(0, start) +
      section.replaceAll('references/tasks-format.md', 'the tasks format') +
      deployedText.slice(end);
    expect(mutated).not.toBe(deployedText);
    expect(mutated.slice(start, mutated.indexOf('### Phase 4', start))).not.toContain('references/tasks-format.md');
    expect(mutated).toContain(renderStationReferenceSlot(SKILL, 'startup-tasks-format'));

    const found = details(source([deployment({ text: mutated })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('references/tasks-format.md');
    expect(found[0]).toContain('Phase 3: Decompose by Architecture Layer');
  });

  it('R2-1: fails a phase whose reference path was renamed with a suffix', () => {
    const start = deployedText.indexOf('### Phase 3: Decompose by Architecture Layer');
    const end = deployedText.indexOf('### Phase 4', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = deployedText.slice(start, end);
    expect(section).toContain('references/tasks-format.md');
    const mutated = deployedText.slice(0, start) + section.replaceAll(
      'references/tasks-format.md', 'references/tasks-format.md.bak',
    ) + deployedText.slice(end);
    expect(mutated).not.toBe(deployedText);
    const result = evaluateSkillReferenceMap(source([deployment({ text: mutated })]));
    expect(result.result.status).toBe('fail');
    expect(result.findings.some((f) => f.detail.includes('Phase 3: Decompose'))).toBe(true);
  });

  it('fails a rendered map whose purpose text no longer matches the registry', () => {
    const slotText = renderStationReferenceSlot(SKILL, 'startup-tasks-format');
    const mutated = deployedText.replace(slotText, slotText.replace(' for tasks.md format', ' whenever'));
    expect(mutated).not.toBe(deployedText);
    expect(mutated).not.toContain(slotText);
    // The citation itself survives, so only the map-text guard can catch this.
    expect(mutated).toContain('references/tasks-format.md');

    const found = details(source([deployment({ text: mutated })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('startup-tasks-format');
  });

  it('fails a citation of a reference the registry does not declare', () => {
    const mutated = `${deployedText}\n## Extra\n\nRead \`references/invented.md\`.\n`;
    expect(mutated).toContain('references/invented.md');

    const found = details(source([deployment({ text: mutated })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('references/invented.md');
    expect(found[0]).toContain('does not declare');
  });

  it('fails a registered reference that was never deployed', () => {
    const references = deployedReferences.filter((name) => name !== 'tasks-format.md');
    expect(references).not.toContain('tasks-format.md');

    const found = details(source([deployment({ references })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('tasks-format.md is registered');
  });

  it('fails a deployed reference no load point claims', () => {
    const found = details(source([deployment({ references: [...deployedReferences, 'left-over.md'] })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('left-over.md is deployed');
  });

  it('fails a configured deployment whose SKILL.md could not be read', () => {
    const found = details(source([deployment({ text: null, references: [] })]));
    // The unreadable file is reported once; the reference set is not graded off
    // instructions nobody could read.
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('could not be read');
  });

  it('reports each root separately, so a synced host cannot mask an unsynced one', () => {
    const found = details(
      source([
        deployment(),
        deployment({ skill_path: '.agents/skills', source_path: '.agents/skills/prospec-tasks/SKILL.md', references: [] }),
      ]),
    );
    expect(found.every((detail) => detail.includes('.agents/skills'))).toBe(true);
    expect(found).toHaveLength(deployedReferences.length);
  });

  it('skips an unavailable source instead of certifying it', () => {
    const result = evaluateSkillReferenceMap({
      available: false,
      reason: 'source unavailable: no configured agent',
      deployments: [],
      roots: [],
      unreadableRoots: {},
    });
    expect(result.result.status).toBe('skipped');
    expect(result.result.reason).toMatch(/no configured agent/);
    expect(result.findings).toEqual([]);
  });

  it('leaves a skill the registry does not ship out of the verdict', () => {
    const found = details(
      source([deployment({ skill: 'my-house-style', text: 'Read `references/anything.md`.', references: ['anything.md'] })]),
    );
    expect(found).toEqual([]);
  });

  it('fails an unclosed fence rather than reading a truncated document', () => {
    const found = details(source([deployment({ text: `${deployedText}\n\`\`\`md\nunterminated\n` })]));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('code fence open');
  });
});
