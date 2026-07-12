import {
  readConfig,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
} from '../lib/config.js';
import {
  computeUnlocalizedSkills,
  type UnlocalizedSkill,
} from './trigger-localization.js';

export interface AgentTriggersOptions {
  /** Working directory (defaults to process.cwd()). */
  cwd?: string;
}

export interface AgentTriggersResult {
  /** Resolved artifact language (English when `.prospec.yaml` sets none). */
  artifactLanguage: string;
  /** Whether the artifact language is the default English (no localization needed). */
  isEnglish: boolean;
  /** Skills still lacking a native-language `skill_triggers` entry, with English baselines. */
  missing: UnlocalizedSkill[];
}

/**
 * Compute the trigger-localization scaffold data for `prospec agent triggers`:
 * the fill-missing skill set (baselines sourced from SKILL_DEFINITIONS, never
 * reverse-derived from a deployed SKILL.md) plus the resolved artifact language.
 *
 * The CLI formatter turns a non-empty gap under a non-English language into a
 * paste-ready `skill_triggers:` YAML scaffold; English or an already-complete
 * project renders an informational message instead of a misleading scaffold.
 */
export async function execute(
  options: AgentTriggersOptions,
): Promise<AgentTriggersResult> {
  const config = await readConfig(options.cwd);
  const artifactLanguage = resolveArtifactLanguage(config);
  return {
    artifactLanguage,
    isEnglish: isDefaultArtifactLanguage(artifactLanguage),
    missing: computeUnlocalizedSkills(config),
  };
}
