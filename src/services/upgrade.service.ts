import {
  readConfig,
  writeConfig,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
} from '../lib/config.js';
import type { ProspecConfig } from '../types/config.js';
import { PROSPEC_VERSION } from '../types/version.js';
import {
  execute as agentSyncExecute,
  type AgentSyncFullResult,
} from './agent-sync.service.js';
import { SKILL_DEFINITIONS } from '../types/skill.js';

export interface UpgradeOptions {
  cwd?: string;
}

export interface UpgradeReport {
  /** prospec version recorded before this upgrade ('unknown' if never stamped). */
  versionFrom: string;
  /** prospec version after this upgrade (the running CLI version). */
  versionTo: string;
  /** Skills with no skill_triggers entry — what /prospec-upgrade localizes (non-English only). */
  missingTriggers: string[];
}

export interface UpgradeResult {
  /** Version delta + trigger gaps consumed by the /prospec-upgrade skill. */
  report: UpgradeReport;
  /** The agent-sync result — carries hints (missing triggers) and warnings. */
  agentSync: AgentSyncFullResult;
  /** The slash command the user runs next in their AI agent. */
  nextStep: string;
}

/**
 * Execute the upgrade workflow (zero-LLM, deterministic):
 *
 * 1. Record the running prospec version in `.prospec.yaml` `version` and rewrite
 *    it canonically (comment-preserving writeConfig = "format to latest").
 * 2. Re-run agent sync (zone-1 generated files; carries trigger hints).
 * 3. Build a report (version delta, skills missing triggers) for the
 *    `/prospec-upgrade` skill, which handles the consent-gated doc-format updates.
 *
 * It deliberately does NOT touch any `prospec/ai-knowledge/` doc or CONSTITUTION —
 * init-created doc format updates require user consent and are the skill's job.
 */
export async function execute(options: UpgradeOptions): Promise<UpgradeResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Read config — throws ConfigNotFound on an uninitialized project, the same
  //    guard every post-init command relies on (upgrade is not in INIT_COMMANDS).
  const config = await readConfig(cwd);
  const artifactLanguage = resolveArtifactLanguage(config);

  // 2. Record the running prospec version + rewrite .prospec.yaml canonically.
  const versionFrom = config.version ?? 'unknown';
  config.version = PROSPEC_VERSION;
  await writeConfig(config, cwd);

  // 3. Re-sync agent config (zone-1 generated files + trigger hints/warnings).
  const agentSync = await agentSyncExecute({ cwd });

  // 4. Build the upgrade report for the /prospec-upgrade skill.
  const report: UpgradeReport = {
    versionFrom,
    versionTo: PROSPEC_VERSION,
    missingTriggers: detectMissingTriggers(config, artifactLanguage),
  };

  return {
    report,
    agentSync,
    nextStep: '/prospec-upgrade',
  };
}

/**
 * Skills with no `skill_triggers` entry — what `/prospec-upgrade` localizes for a
 * non-English project. English projects use the English baseline, so nothing is
 * "missing"; the concept applies only to a non-default artifact language.
 */
export function detectMissingTriggers(
  config: ProspecConfig,
  artifactLanguage: string,
): string[] {
  if (isDefaultArtifactLanguage(artifactLanguage)) return [];
  const localized = config.skill_triggers ?? {};
  return SKILL_DEFINITIONS.filter((s) => {
    const entry = localized[s.name];
    return !entry || entry.length === 0;
  }).map((s) => s.name);
}
