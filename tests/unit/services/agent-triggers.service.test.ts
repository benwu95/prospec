import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/agent-triggers.service.js';
import { computeUnlocalizedSkills, computeUnlocalized } from '../../../src/services/trigger-localization.js';
import { SKILL_DEFINITIONS } from '../../../src/types/skill.js';
import type { ProspecConfig } from '../../../src/types/config.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const cfg = (extra: Partial<ProspecConfig> = {}): ProspecConfig =>
  ({ project: { name: 't' }, ...extra }) as ProspecConfig;

describe('computeUnlocalizedSkills (single-source fill-missing set)', () => {
  it('returns every shipped skill when no skill_triggers exist', () => {
    const missing = computeUnlocalizedSkills(cfg());
    expect(missing.map((s) => s.name)).toEqual(SKILL_DEFINITIONS.map((s) => s.name));
  });

  it('sources each baseline verbatim from SKILL_DEFINITIONS (never a deployed SKILL.md)', () => {
    const missing = computeUnlocalizedSkills(cfg());
    for (const skill of SKILL_DEFINITIONS) {
      const entry = missing.find((s) => s.name === skill.name);
      expect(entry?.baseline).toEqual(skill.triggers);
    }
  });

  it('excludes a skill that has a non-empty skill_triggers entry', () => {
    const missing = computeUnlocalizedSkills(
      cfg({ skill_triggers: { 'prospec-explore': ['探索'] } }),
    );
    expect(missing.map((s) => s.name)).not.toContain('prospec-explore');
    expect(missing.length).toBe(SKILL_DEFINITIONS.length - 1);
  });

  it('treats an empty-array entry as unset (still a gap, cf. REQ-AGNT-019)', () => {
    const missing = computeUnlocalizedSkills(
      cfg({ skill_triggers: { 'prospec-explore': [] } }),
    );
    expect(missing.map((s) => s.name)).toContain('prospec-explore');
  });

  it('ignores an unknown skill key in skill_triggers', () => {
    const base = computeUnlocalizedSkills(cfg());
    const withUnknown = computeUnlocalizedSkills(
      cfg({ skill_triggers: { 'no-such-skill': ['x'] } }),
    );
    expect(withUnknown.map((s) => s.name)).toEqual(base.map((s) => s.name));
  });
});

describe('agent-triggers.service execute', () => {
  it('flags English (no artifact_language) as isEnglish', async () => {
    vol.fromJSON({ '/p/.prospec.yaml': 'project:\n  name: t\n' });
    const result = await execute({ cwd: '/p' });
    expect(result.isEnglish).toBe(true);
    expect(result.artifactLanguage).toBe('English');
  });

  it('returns only the fill-missing gap for a partially-localized non-English project', async () => {
    vol.fromJSON({
      '/p/.prospec.yaml':
        'project:\n  name: t\nartifact_language: Japanese\nskill_triggers:\n  prospec-explore:\n    - さがす\n',
    });
    const result = await execute({ cwd: '/p' });
    expect(result.isEnglish).toBe(false);
    expect(result.artifactLanguage).toBe('Japanese');
    expect(result.missing.map((s) => s.name)).not.toContain('prospec-explore');
    expect(result.missing.length).toBe(SKILL_DEFINITIONS.length - 1);
  });
});

describe('computeUnlocalized(config, kind) — the kind-parameterized single source (REQ-SERVICES-066)', () => {
  it("'triggers' is exactly what computeUnlocalizedSkills returns", () => {
    const config = { project: { name: 't' }, skill_triggers: { 'prospec-plan': ['計畫'] } } as ProspecConfig;
    expect(computeUnlocalized(config, 'triggers')).toEqual(computeUnlocalizedSkills(config));
  });

  it("'exclusions' reads skill_exclusions and sources each baseline from SKILL_DEFINITIONS.exclude", () => {
    const config = {
      project: { name: 't' },
      skill_exclusions: { 'prospec-review': ['臨時 PR 審查'], 'prospec-plan': [], unknown: ['x'] },
    } as unknown as ProspecConfig;
    const gaps = computeUnlocalized(config, 'exclusions');
    expect(gaps.map((g) => g.name)).not.toContain('prospec-review');
    expect(gaps.map((g) => g.name)).toContain('prospec-plan');
    expect(gaps).toHaveLength(SKILL_DEFINITIONS.length - 1);
    for (const gap of gaps) {
      const def = SKILL_DEFINITIONS.find((s) => s.name === gap.name)!;
      expect(gap.baseline).toEqual(def.exclude);
    }
  });

  it('execute reports the exclusions gap beside the triggers gap', async () => {
    vol.fromJSON({
      '/project/.prospec.yaml': [
        'project:',
        '  name: t',
        'artifact_language: Japanese',
        'skill_triggers:',
        '  prospec-explore: [調査]',
        'skill_exclusions:',
        '  prospec-explore: [除外]',
        '  prospec-plan: [除外]',
        '',
      ].join('\n'),
    });
    const result = await execute({ cwd: '/project' });
    expect(result.missing.map((m) => m.name)).not.toContain('prospec-explore');
    expect(result.missing.map((m) => m.name)).toContain('prospec-plan');
    expect(result.missingExclusions.map((m) => m.name)).not.toContain('prospec-explore');
    expect(result.missingExclusions.map((m) => m.name)).not.toContain('prospec-plan');
    expect(result.missingExclusions.map((m) => m.name)).toContain('prospec-review');
  });
});
