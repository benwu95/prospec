import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  readConfig,
  resolveBasePaths,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
  resolveKnowledgeTokenBudget,
} from '../lib/config.js';
import { resolveLanguageScope, entryLanguageContext } from '../lib/language-policy.js';
import { renderTemplate } from '../lib/template.js';
import { projectStationDeployment } from '../lib/skill-reference-map.js';
import { escapeYamlScalar } from '../lib/yaml-utils.js';
import { mergeManagedDoc } from '../lib/content-merger.js';
import { atomicWrite, ensureDir, readFileIfExists } from '../lib/fs-utils.js';
import { computeUnlocalizedSkills } from './trigger-localization.js';
import { PrerequisiteError } from '../types/errors.js';
import { VALID_AGENTS } from '../types/config.js';
import { MINIMUM_CLI_VERSION } from '../types/version.js';
import { BREAK_GLASS_PREFIX } from '../types/status.js';
import {
  PLANNING_VERDICTS,
  PLAN_VERIFIER_DIMENSIONS,
  RELAYED_FIELD_MAX_CHARS,
  TASKS_VERIFIER_DIMENSIONS,
} from '../types/station.js';
import {
  SKILL_DEFINITIONS,
  AGENT_CONFIGS,
  HARNESS_CAPABILITY_KEYS,
  intersectCapabilities,
  mergeGroupInvocationGuidance,
  mergeGroupRenderFlags,
  renderFlagContext,
  skillHasReferences,
  type AgentConfig,
  type AgentSyncResult,
  type HarnessCapabilities,
  type SkillConfig,
  type StationReferenceFile,
} from '../types/skill.js';

export interface AgentSyncOptions {
  /** Specific CLI to sync (e.g., 'claude'). If undefined, sync all configured agents. */
  cli?: string;
  /** Working directory */
  cwd?: string;
}

export interface AgentSyncFullResult {
  /** Results per agent */
  agents: AgentSyncResult[];
  /** Total number of files generated */
  totalFiles: number;
  /** Non-fatal warnings (e.g., skill_triggers entries for unknown skills) */
  warnings: string[];
  /** Next-step suggestions (e.g., populate skill_triggers for a non-English language) */
  hints: string[];
}

/**
 * Execute the agent sync workflow:
 *
 * 1. Read config (.prospec.yaml must exist)
 * 2. Determine which agents to sync (--cli or all configured)
 * 3. Dedup by output signature: agents sharing the same (skillPath, configPath)
 *    — antigravity / codex / copilot all use the agents.md standard
 *    (.agents/skills + AGENTS.md) — collapse into one set of files
 * 4. For each unique output:
 *    a. Generate Skill files (SKILL.md) from templates
 *    b. Generate reference files for skills that have them
 *    c. Generate agent entry config (CLAUDE.md, AGENTS.md, etc.)
 * 5. Atomic writes, update rather than duplicate
 */
export async function execute(
  options: AgentSyncOptions,
): Promise<AgentSyncFullResult> {
  const cwd = options.cwd ?? process.cwd();

  // 1. Read config
  const config = await readConfig(cwd);
  const configuredAgents = config.agents ?? [];
  const basePaths = resolveBasePaths(config, cwd);
  const baseDir = path.relative(cwd, basePaths.baseDir);
  const knowledgeBasePath = path.relative(cwd, basePaths.knowledgePath);
  const constitutionPath = path.relative(cwd, basePaths.constitutionPath);

  if (configuredAgents.length === 0) {
    throw new PrerequisiteError(
      'No AI agent configured',
      `Add at least one agent to the agents field in .prospec.yaml (supported: ${VALID_AGENTS.join(', ')}), or run \`prospec init\` to re-initialize`,
    );
  }

  // 2. Determine which agents to sync
  let agentsToSync: string[];
  if (options.cli) {
    if (!configuredAgents.includes(options.cli as typeof configuredAgents[number])) {
      throw new PrerequisiteError(
        `Agent '${options.cli}' is not configured in .prospec.yaml`,
        `Configured agents: ${configuredAgents.join(', ')}`,
      );
    }
    agentsToSync = [options.cli];
  } else {
    agentsToSync = [...configuredAgents];
  }

  // 3. Resolve language + custom triggers; absent artifact_language means English
  const artifactLanguage = resolveArtifactLanguage(config);
  const languageScope = resolveLanguageScope(config, cwd);
  const skillTriggers = config.skill_triggers ?? {};
  const skillExclusions = config.skill_exclusions ?? {};
  const knownSkillNames = new Set(SKILL_DEFINITIONS.map((s) => s.name));
  const warnings: string[] = [];
  for (const key of Object.keys(skillTriggers)) {
    if (!knownSkillNames.has(key)) {
      warnings.push(`skill_triggers: unknown skill '${key}' ignored`);
    }
  }
  for (const key of Object.keys(skillExclusions)) {
    if (!knownSkillNames.has(key)) {
      warnings.push(`skill_exclusions: unknown skill '${key}' ignored`);
    }
  }
  const hints: string[] = [];
  if (!isDefaultArtifactLanguage(artifactLanguage)) {
    // Fill-missing gap set — computed via the shared single source (PB-007),
    // also consumed by `prospec agent triggers`. Naming the gap lets the user
    // fill just the newly-added skills after a CLI upgrade — never deleting
    // .prospec.yaml to force a full re-localization through init.
    // The hint's gap set stays the skill_triggers gap (REQ-AGNT-021); its wording
    // names both maps because the scaffold it points at prints both blocks.
    const missing = computeUnlocalizedSkills(config);
    const gapNames = missing.map((s) => s.name);
    if (missing.length === SKILL_DEFINITIONS.length) {
      // None localized yet — generic onboarding guidance (don't enumerate all).
      hints.push(
        `Native-language skill triggers and exclusions: run \`prospec agent triggers\` to get a ready-to-translate scaffold (skill_triggers + skill_exclusions blocks), translate each English baseline into ${artifactLanguage}, write it back with \`prospec agent triggers --write <file>\`, then re-run \`prospec agent sync\`.`,
      );
    } else if (gapNames.length > 0) {
      // Partially localized — name the skills still missing an entry in either map.
      hints.push(
        `These skills have no ${artifactLanguage} skill_triggers or skill_exclusions entry yet: ${gapNames.join(', ')}. Run \`prospec agent triggers\` to get their baselines, write them back with \`prospec agent triggers --write <file>\`, then re-run \`prospec agent sync\` — no need to re-init.`,
      );
    }
  }

  // 4. Trigger words are agent-independent — synthesize once per skill
  const triggerWordsBySkill = new Map(
    SKILL_DEFINITIONS.map((s) => [
      s.name,
      synthesizeTriggers(s, artifactLanguage, skillTriggers[s.name]),
    ]),
  );
  // One description exit for BOTH the entry-config registry and the SKILL.md
  // frontmatter — the localized `Not for:` clause reaches both or neither.
  const descriptionBySkill = new Map(
    SKILL_DEFINITIONS.map((s) => [s.name, renderSkillDescription(s, skillExclusions[s.name])]),
  );

  // 5. Template context (shared across all agents)
  const templateContext = {
    project_name: config.project.name,
    base_dir: baseDir,
    knowledge_base_path: knowledgeBasePath,
    constitution_path: constitutionPath,
    tech_stack: config.tech_stack ?? {},
    artifact_language: artifactLanguage,
    // The cli-first probe floor (issue #107): skills STOP when the installed
    // CLI is older — always a variable, never a hardcoded version literal.
    minimum_cli_version: MINIMUM_CLI_VERSION,
    // Language scope rendered into the entry config's Language Policy — the SAME
    // resolved path sets the seeded Constitution rule is generated from
    // (lib/language-policy), so L0 and the audited Constitution cannot declare
    // contradictory scopes. Named exceptions stay out of L0: the entry config
    // points at the Constitution rule for them, keeping this always-loaded file lean.
    ...entryLanguageContext(languageScope),
    // EVERY knowledge-size budget field, spread rather than hand-listed, so a new
    // threshold reaches the templates without a second edit here — they are
    // rendered into the knowledge-loading skill templates, resolved per-project
    // so a downstream reader sees real numbers and a source they can inspect,
    // never the internal DEFAULT_KNOWLEDGE_TOKEN_BUDGET symbol.
    ...resolveKnowledgeTokenBudget(config),
    // The delegated-payload ceilings, spread the same way and for the same
    // reason: the review/verify reference states real numbers a reader can act
    // on, and the numbers have exactly one source — the schema that enforces
    // them. A hardcoded literal in the template would be a second copy free to
    // drift from the refusal it documents.
    ...Object.fromEntries(
      Object.entries(RELAYED_FIELD_MAX_CHARS).map(([field, max]) => [
        `relayed_max_${field}`,
        max,
      ]),
    ),
    // The planning-verifier vocabulary the two rubrics and the plan/tasks/ff
    // skills render — projected from the schema `change log --verifier-report`
    // enforces, so the words the verifier is told to write are the words the
    // sink accepts (the `FLAW`/`FLAWS` split lived in a hand-typed literal).
    ...planningVerifierContext(),
    // Entry config (CLAUDE.md/AGENTS.md) is always-loaded Layer 0 — exclude
    // excludeFromEntryConfig skills so a one-shot onboarding skill costs no
    // recurring tokens. syncSkillsDirSkills still writes its SKILL.md (below),
    // so it stays invocable on demand.
    skills: SKILL_DEFINITIONS.filter((s) => !s.excludeFromEntryConfig).map((s) => ({
      name: s.name,
      description: descriptionBySkill.get(s.name),
      triggers: triggerWordsBySkill.get(s.name),
      type: s.type,
      hasReferences: skillHasReferences(s.name),
    })),
  };

  // 6. Group agents by output signature so agents sharing the same
  //    (skillPath, configPath) write the same files only once.
  const groups = new Map<string, { configs: AgentConfig[]; names: string[] }>();
  for (const agentName of agentsToSync) {
    // agentsToSync may include an unvalidated --cli value, so index through a
    // string view and keep the runtime guard (AGENT_CONFIGS' literal keys are
    // still compile-checked against VALID_AGENTS at its definition).
    const agentConfig = (AGENT_CONFIGS as Record<string, AgentConfig | undefined>)[agentName];
    if (!agentConfig) continue;

    const signature = `${agentConfig.skillPath}\n${agentConfig.configPath}`;
    const group = groups.get(signature);
    if (group) {
      group.names.push(agentName);
      group.configs.push(agentConfig);
    } else {
      groups.set(signature, { configs: [agentConfig], names: [agentName] });
    }
  }

  // 7. Generate once per unique output; report the agents it serves.
  const results: AgentSyncResult[] = [];
  for (const { configs, names } of groups.values()) {
    // One file serves the whole group, so its capability claims AND its render
    // flags must hold for EVERY member — merged across the group, never the
    // first or last member's view (issue #95 fixed capabilities; issue #134
    // fixed the render flags the same way).
    const capabilities = intersectCapabilities(configs.map((c) => c.capabilities));
    const renderFlags = mergeGroupRenderFlags(configs);
    const invocationGuidance = mergeGroupInvocationGuidance(configs);
    const result = await syncAgent(
      configs[0]!,
      {
        ...templateContext,
        ...harnessCapabilityContext(capabilities),
        ...renderFlagContext(renderFlags),
        invocation_guidance: invocationGuidance,
      },
      triggerWordsBySkill,
      descriptionBySkill,
      cwd,
    );
    result.agent = names.join(', ');
    results.push(result);
  }

  // 8. Compute totals
  const totalFiles = results.reduce(
    (sum, r) => sum + 1 + r.skillFiles.length + r.referenceFiles.length,
    0,
  );

  return { agents: results, totalFiles, warnings, hints };
}

/**
 * Compose the frontmatter trigger words for one skill:
 * English baseline, plus the user's custom words from `skill_triggers`;
 * when the artifact language is not English and no custom words exist,
 * append a semantic-match hint instead.
 */
export function synthesizeTriggers(
  skill: Pick<SkillConfig, 'triggers'>,
  artifactLanguage: string,
  customTriggers: string[] | undefined,
): string {
  // Returns the human-readable trigger string used verbatim in markdown
  // (entry.md). YAML-scalar escaping is NOT applied here — it is applied only
  // at the SKILL.md frontmatter render site, so backslashes/quotes don't leak
  // into the markdown context that reuses this same value.
  const baseline = skill.triggers.join(', ');
  const custom = (customTriggers ?? []).map((t) => t.trim()).filter(Boolean);
  if (custom.length > 0) {
    return `${baseline}, ${custom.join(', ')}`;
  }
  if (!isDefaultArtifactLanguage(artifactLanguage)) {
    return `${baseline} — or equivalent terms in ${artifactLanguage}`;
  }
  return baseline;
}

/**
 * The description both exits render: the single-source `description`, plus a
 * ` Not for: <phrases>.` clause only when the project localized exclusions for
 * this skill. The English `exclude` baseline is never rendered — the English
 * boundary already lives in the description — so an absent or empty entry is a
 * byte-identical no-op.
 */
export function renderSkillDescription(
  skill: Pick<SkillConfig, 'description'>,
  localizedExclusions: string[] | undefined,
): string {
  // collapse inner whitespace too: the entry-config exit is raw markdown, so a line break
  // inside a phrase would otherwise mint a new line in the always-loaded file
  const phrases = (localizedExclusions ?? []).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (phrases.length === 0) return skill.description;
  return `${skill.description} Not for: ${phrases.join('; ')}.`;
}

/** Verdict enum and dimension lists as the rubric prose renders them. */
export function planningVerifierContext(): Record<string, string> {
  return {
    planning_verdicts: PLANNING_VERDICTS.map((v) => `"${v}"`).join(' | '),
    break_glass_prefix: BREAK_GLASS_PREFIX,
    plan_verifier_dimensions: PLAN_VERIFIER_DIMENSIONS.map((d) => `\`${d}\``).join(', '),
    tasks_verifier_dimensions: TASKS_VERIFIER_DIMENSIONS.map((d) => `\`${d}\``).join(', '),
  };
}

/**
 * Expand resolved capabilities into the `snake_case` render keys the skill
 * templates branch on (`{{#if can_spawn_subagent}}`).
 */
function harnessCapabilityContext(
  capabilities: HarnessCapabilities,
): Record<string, boolean> {
  // Derived from the canonical key list, not hand-mapped: a flag added to
  // `HarnessCapabilities` reaches the templates instead of stopping at a
  // forgotten literal. `canSpawnSubagent` → `can_spawn_subagent`.
  return Object.fromEntries(
    HARNESS_CAPABILITY_KEYS.map((key) => [
      key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
      capabilities[key],
    ]),
  );
}

/**
 * Sync a single agent: generate skills + entry config.
 */
async function syncAgent(
  agentConfig: AgentConfig,
  templateContext: Record<string, unknown>,
  triggerWordsBySkill: Map<string, string>,
  descriptionBySkill: Map<string, string>,
  cwd: string,
): Promise<AgentSyncResult> {
  const skillFiles: string[] = [];
  const referenceFiles: string[] = [];

  await syncSkillsDirSkills(
    agentConfig,
    templateContext,
    triggerWordsBySkill,
    descriptionBySkill,
    cwd,
    skillFiles,
    referenceFiles,
  );

  // Generate entry config
  const configFile = await generateEntryConfig(
    agentConfig,
    templateContext,
    cwd,
  );

  // Sweep orphaned prospec-* skill dirs (renamed/removed skills leave a stale
  // SKILL.md that would keep participating in dispatch).
  const removedSkills = sweepOrphanSkillDirs(agentConfig.skillPath, cwd);

  return {
    agent: agentConfig.name,
    configFile,
    skillFiles,
    referenceFiles,
    removedSkills,
  };
}

/**
 * Remove `prospec-*` skill directories under `skillPath` that are not in the
 * current `SKILL_DEFINITIONS` — orphans left by a renamed or dropped shipped
 * skill. The `prospec-` prefix is RESERVED for shipped skills: only
 * `prospec-`-prefixed dirs are candidates, so a user skill under any other name
 * (and any non-directory entry) is always preserved. A dir named `prospec-*`
 * that is not a current skill IS removed by design — the removed names are
 * returned and surfaced by the caller (never a silent delete), so a user must
 * not squat the reserved `prospec-` prefix for their own skill.
 */
function sweepOrphanSkillDirs(skillPath: string, cwd: string): string[] {
  const skillsDir = path.join(cwd, skillPath);
  if (!fs.existsSync(skillsDir)) return [];
  const known = new Set(SKILL_DEFINITIONS.map((s) => s.name));
  const removed: string[] = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith('prospec-')) continue; // non-prospec = user skill, preserve
    if (known.has(entry.name)) continue;
    fs.rmSync(path.join(skillsDir, entry.name), { recursive: true, force: true });
    removed.push(entry.name);
  }
  return removed.sort();
}

/**
 * Generate skills for an agent: one SKILL.md per skill under the agent's
 * skillPath, plus a references/ subdir for skills that declare references.
 *
 * Structure:
 *   .claude/skills/prospec-explore/SKILL.md
 *   .claude/skills/prospec-new-story/SKILL.md
 *   .claude/skills/prospec-new-story/references/proposal-format.md
 */
async function syncSkillsDirSkills(
  agentConfig: AgentConfig,
  templateContext: Record<string, unknown>,
  triggerWordsBySkill: Map<string, string>,
  descriptionBySkill: Map<string, string>,
  cwd: string,
  skillFiles: string[],
  referenceFiles: string[],
): Promise<void> {
  for (const skill of SKILL_DEFINITIONS) {
    const skillDir = path.join(cwd, agentConfig.skillPath, skill.name);
    const skillFilePath = path.join(skillDir, 'SKILL.md');

    // Render skill template with its synthesized frontmatter trigger words.
    // Escape here (and only here) — this value lands inside a double-quoted
    // YAML scalar in the SKILL.md frontmatter.
    const content = renderTemplate(`skills/${skill.name}.hbs`, {
      ...templateContext,
      skill_description: escapeYamlScalar(descriptionBySkill.get(skill.name) ?? skill.description),
      trigger_words: escapeYamlScalar(triggerWordsBySkill.get(skill.name) ?? ''),
    });

    await ensureDir(skillDir);
    await atomicWrite(skillFilePath, content);
    skillFiles.push(
      path.join(agentConfig.skillPath, skill.name, 'SKILL.md'),
    );

    // Generate reference files if applicable
    if (skillHasReferences(skill.name)) {
      const refs = getSkillReferences(skill.name);
      for (const ref of refs) {
        const refDir = path.join(skillDir, 'references');
        const refFilePath = path.join(refDir, ref.outputName);

        const refContent = renderTemplate(
          `skills/references/${ref.templateName}`,
          templateContext,
        );

        await ensureDir(refDir);
        await atomicWrite(refFilePath, refContent);
        referenceFiles.push(
          path.join(
            agentConfig.skillPath,
            skill.name,
            'references',
            ref.outputName,
          ),
        );
      }
    }
  }
}

/**
 * Generate the agent entry configuration file.
 */
async function generateEntryConfig(
  agentConfig: AgentConfig,
  templateContext: Record<string, unknown>,
  cwd: string,
): Promise<string> {
  const generated = renderTemplate('agent-configs/entry.md.hbs', {
    ...templateContext,
    skill_path: agentConfig.skillPath,
    // `surfaces_skill_frontmatter` is supplied by the caller via
    // `renderFlagContext(mergeGroupRenderFlags(configs))` — the group-merged
    // value, never this single member's flag. Reading `agentConfig`'s flag here
    // would reintroduce the `configs[0]` desync (issue #134).
  });

  const configFilePath = path.join(cwd, agentConfig.configPath);
  // Refresh only the auto block and preserve the user block — or migrate an
  // unmanaged (hand-written) file's content into the user block — instead of
  // clobbering it (REQ-AGNT-008 / REQ-AGNT-023).
  const existing = await readFileIfExists(configFilePath);
  const merged = mergeManagedDoc(generated, existing);
  await ensureDir(path.dirname(configFilePath));
  await atomicWrite(configFilePath, merged);

  return agentConfig.configPath;
}

/**
 * The shape a reference deploys in. Structurally the registry's own
 * `StationReferenceFile`, re-exported here so the long-standing
 * `agent-sync.service` import path keeps working.
 */
export type SkillReference = StationReferenceFile;

/**
 * The references a skill deploys — a compatibility facade over
 * `STATION_REFERENCES` (REQ-AGNT-030). It owns NO table of its own: the registry
 * is the single source for which files a station carries, what each one is read
 * for and where, and a second map here is exactly the double-write this delegation
 * removed.
 */
export function getSkillReferences(skillName: string): SkillReference[] {
  return projectStationDeployment(skillName);
}
