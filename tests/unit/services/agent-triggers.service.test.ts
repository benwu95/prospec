import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/agent-triggers.service.js';
import { computeUnlocalizedSkills } from '../../../src/services/trigger-localization.js';
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
