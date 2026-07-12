import { describe, it, expect, vi } from 'vitest';
import { parse } from 'yaml';
import { formatAgentTriggersOutput } from '../../src/cli/formatters/agent-triggers-output.js';
import { computeUnlocalizedSkills } from '../../src/services/trigger-localization.js';
import { SKILL_DEFINITIONS } from '../../src/types/skill.js';
import type { ProspecConfig } from '../../src/types/config.js';

/**
 * The scaffold is emitted by string concatenation of raw baseline words. Guard
 * that the full emitted block is valid YAML AND round-trips every baseline
 * verbatim — so a future baseline containing a YAML-special token (`: `, a
 * leading `-`/`#`, a bool-like scalar) that breaks the paste-ready block turns
 * this red instead of shipping a silently-malformed scaffold.
 */
describe('agent triggers scaffold emits valid, round-tripping YAML', () => {
  it('parses back to skill_triggers with every baseline verbatim', () => {
    const missing = computeUnlocalizedSkills({ project: { name: 't' } } as ProspecConfig);
    const chunks: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(((chunk: unknown) => {
        chunks.push(String(chunk));
        return true;
      }) as typeof process.stdout.write);
    try {
      formatAgentTriggersOutput(
        { artifactLanguage: 'Japanese', isEnglish: false, missing },
        'normal',
      );
    } finally {
      spy.mockRestore();
    }

    const parsed = parse(chunks.join('')) as {
      skill_triggers?: Record<string, string[]>;
    };
    expect(parsed.skill_triggers).toBeDefined();
    for (const skill of SKILL_DEFINITIONS) {
      expect(parsed.skill_triggers?.[skill.name]).toEqual(skill.triggers);
    }
  });
});
