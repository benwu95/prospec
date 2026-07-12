import type { ProspecConfig } from '../types/config.js';
import { SKILL_DEFINITIONS } from '../types/skill.js';

/** A shipped skill that still lacks a native-language `skill_triggers` entry. */
export interface UnlocalizedSkill {
  /** Skill name, e.g. `prospec-explore`. */
  name: string;
  /** The English trigger baseline from SKILL_DEFINITIONS (the words to translate). */
  baseline: string[];
}

/**
 * The fill-missing gap set: skills lacking a NON-EMPTY `skill_triggers` entry
 * (`SKILL_DEFINITIONS \ localized`). An empty-array entry counts as unset
 * (cf. REQ-AGNT-019); unknown skill keys in `skill_triggers` are irrelevant to
 * the gap and ignored here (agent-sync warns on them separately).
 *
 * Single source of truth consumed by BOTH the agent-sync population hint
 * (REQ-AGNT-021) and `prospec agent triggers` (REQ-AGNT-036) — neither
 * re-derives the set (PB-007). Baselines come from SKILL_DEFINITIONS, never
 * from a deployed SKILL.md (whose frontmatter already merges custom words).
 */
export function computeUnlocalizedSkills(config: ProspecConfig): UnlocalizedSkill[] {
  const skillTriggers = config.skill_triggers ?? {};
  const localized = new Set(
    Object.entries(skillTriggers)
      .filter(([, words]) => words.length > 0)
      .map(([name]) => name),
  );
  return SKILL_DEFINITIONS.filter((s) => !localized.has(s.name)).map((s) => ({
    name: s.name,
    baseline: [...s.triggers],
  }));
}
