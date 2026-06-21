import * as path from 'node:path';
import {
  readConfig,
  resolveBasePaths,
  resolveArtifactLanguage,
  isDefaultArtifactLanguage,
} from '../lib/config.js';
import { renderTemplate } from '../lib/template.js';
import { escapeYamlScalar } from '../lib/yaml-utils.js';
import { atomicWrite, ensureDir } from '../lib/fs-utils.js';
import { PrerequisiteError } from '../types/errors.js';
import { VALID_AGENTS } from '../types/config.js';
import {
  SKILL_DEFINITIONS,
  AGENT_CONFIGS,
  type AgentConfig,
  type AgentSyncResult,
  type SkillConfig,
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
  const skillTriggers = config.skill_triggers ?? {};
  const knownSkillNames = new Set(SKILL_DEFINITIONS.map((s) => s.name));
  const warnings: string[] = [];
  for (const key of Object.keys(skillTriggers)) {
    if (!knownSkillNames.has(key)) {
      warnings.push(`skill_triggers: unknown skill '${key}' ignored`);
    }
  }
  const hints: string[] = [];
  if (!isDefaultArtifactLanguage(artifactLanguage)) {
    // A skill is localized only with a non-empty skill_triggers entry (empty
    // arrays count as unset, cf. REQ-AGNT-019). Naming the gap lets the user fill
    // just the newly-added skills after a CLI upgrade — never deleting
    // .prospec.yaml to force a full re-localization through init.
    const localized = new Set(
      Object.entries(skillTriggers)
        .filter(([, words]) => words.length > 0)
        .map(([name]) => name),
    );
    const missing = SKILL_DEFINITIONS.filter((s) => !localized.has(s.name));
    if (missing.length === SKILL_DEFINITIONS.length) {
      // None localized yet — generic onboarding guidance (don't enumerate all).
      hints.push(
        `Native-language skill triggers: ask your AI agent to translate each skill's English trigger baseline into ${artifactLanguage}, add them under skill_triggers in .prospec.yaml, then re-run \`prospec agent sync\`.`,
      );
    } else if (missing.length > 0) {
      // Partially localized — name the skills still missing triggers.
      hints.push(
        `These skills have no ${artifactLanguage} skill_triggers entry yet: ${missing
          .map((s) => s.name)
          .join(', ')}. Add their triggers under skill_triggers in .prospec.yaml, then re-run \`prospec agent sync\` — no need to re-init.`,
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

  // 5. Template context (shared across all agents)
  const templateContext = {
    project_name: config.project.name,
    base_dir: baseDir,
    knowledge_base_path: knowledgeBasePath,
    constitution_path: constitutionPath,
    tech_stack: config.tech_stack ?? {},
    artifact_language: artifactLanguage,
    // Entry config (CLAUDE.md/AGENTS.md) is always-loaded Layer 0 — exclude
    // excludeFromEntryConfig skills so a one-shot onboarding skill costs no
    // recurring tokens. syncSkillsDirSkills still writes its SKILL.md (below),
    // so it stays invocable on demand.
    skills: SKILL_DEFINITIONS.filter((s) => !s.excludeFromEntryConfig).map((s) => ({
      name: s.name,
      description: s.description,
      triggers: triggerWordsBySkill.get(s.name),
      type: s.type,
      hasReferences: s.hasReferences,
    })),
  };

  // 6. Group agents by output signature so agents sharing the same
  //    (skillPath, configPath) write the same files only once.
  const groups = new Map<string, { config: AgentConfig; names: string[] }>();
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
    } else {
      groups.set(signature, { config: agentConfig, names: [agentName] });
    }
  }

  // 7. Generate once per unique output; report the agents it serves.
  const results: AgentSyncResult[] = [];
  for (const { config: agentConfig, names } of groups.values()) {
    const result = await syncAgent(agentConfig, templateContext, triggerWordsBySkill, cwd);
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
 * Sync a single agent: generate skills + entry config.
 */
async function syncAgent(
  agentConfig: AgentConfig,
  templateContext: Record<string, unknown>,
  triggerWordsBySkill: Map<string, string>,
  cwd: string,
): Promise<AgentSyncResult> {
  const skillFiles: string[] = [];
  const referenceFiles: string[] = [];

  await syncSkillsDirSkills(
    agentConfig,
    templateContext,
    triggerWordsBySkill,
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

  return {
    agent: agentConfig.name,
    configFile,
    skillFiles,
    referenceFiles,
  };
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
      trigger_words: escapeYamlScalar(triggerWordsBySkill.get(skill.name) ?? ''),
    });

    await ensureDir(skillDir);
    await atomicWrite(skillFilePath, content);
    skillFiles.push(
      path.join(agentConfig.skillPath, skill.name, 'SKILL.md'),
    );

    // Generate reference files if applicable
    if (skill.hasReferences) {
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
  const content = renderTemplate('agent-configs/entry.md.hbs', {
    ...templateContext,
    skill_path: agentConfig.skillPath,
  });

  const configFilePath = path.join(cwd, agentConfig.configPath);
  await ensureDir(path.dirname(configFilePath));
  await atomicWrite(configFilePath, content);

  return agentConfig.configPath;
}

interface SkillReference {
  templateName: string;
  outputName: string;
  title: string;
}

/**
 * Map skill names to their reference files. The map is fully static, so it is
 * built once and cached rather than reallocated on every call.
 */
let referenceMapCache: Record<string, SkillReference[]> | null = null;
function getSkillReferences(skillName: string): SkillReference[] {
  referenceMapCache ??= {
    'prospec-new-story': [
      {
        templateName: 'proposal-format.hbs',
        outputName: 'proposal-format.md',
        title: 'Proposal Format',
      },
    ],
    'prospec-plan': [
      {
        templateName: 'plan-format.hbs',
        outputName: 'plan-format.md',
        title: 'Plan Format',
      },
      {
        templateName: 'delta-spec-format.hbs',
        outputName: 'delta-spec-format.md',
        title: 'Delta Spec Format',
      },
    ],
    'prospec-design': [
      {
        templateName: 'design-spec-format.hbs',
        outputName: 'design-spec-format.md',
        title: 'Design Spec Format',
      },
      {
        templateName: 'interaction-spec-format.hbs',
        outputName: 'interaction-spec-format.md',
        title: 'Interaction Spec Format',
      },
      {
        templateName: 'adapter-pencil.hbs',
        outputName: 'adapter-pencil.md',
        title: 'Platform Adapter: pencil.dev',
      },
      {
        templateName: 'adapter-figma.hbs',
        outputName: 'adapter-figma.md',
        title: 'Platform Adapter: Figma',
      },
      {
        templateName: 'adapter-penpot.hbs',
        outputName: 'adapter-penpot.md',
        title: 'Platform Adapter: Penpot',
      },
      {
        templateName: 'adapter-html.hbs',
        outputName: 'adapter-html.md',
        title: 'Platform Adapter: HTML',
      },
    ],
    'prospec-tasks': [
      {
        templateName: 'tasks-format.hbs',
        outputName: 'tasks-format.md',
        title: 'Tasks Format',
      },
    ],
    'prospec-ff': [
      {
        templateName: 'proposal-format.hbs',
        outputName: 'proposal-format.md',
        title: 'Proposal Format',
      },
      {
        templateName: 'plan-format.hbs',
        outputName: 'plan-format.md',
        title: 'Plan Format',
      },
      {
        templateName: 'delta-spec-format.hbs',
        outputName: 'delta-spec-format.md',
        title: 'Delta Spec Format',
      },
      {
        templateName: 'tasks-format.hbs',
        outputName: 'tasks-format.md',
        title: 'Tasks Format',
      },
    ],
    'prospec-implement': [
      {
        templateName: 'implementation-guide.hbs',
        outputName: 'implementation-guide.md',
        title: 'Implementation Guide',
      },
    ],
    'prospec-review': [
      {
        templateName: 'review-format.hbs',
        outputName: 'review-format.md',
        title: 'Review Severity Contract and review.md Format',
      },
      {
        templateName: 'review-lenses-content.hbs',
        outputName: 'review-lenses-content.md',
        title: 'Review Lens Criteria (security / performance / maintainability)',
      },
    ],
    'prospec-verify': [
      {
        templateName: 'debug-recovery-format.hbs',
        outputName: 'debug-recovery-format.md',
        title: 'Debug & Recovery Triage Reference',
      },
    ],
    'prospec-archive': [
      {
        templateName: 'archive-format.hbs',
        outputName: 'archive-format.md',
        title: 'Archive Summary Format',
      },
      {
        templateName: 'feature-spec-format.hbs',
        outputName: 'feature-spec-format.md',
        title: 'Feature Spec Format',
      },
      {
        templateName: 'product-spec-format.hbs',
        outputName: 'product-spec-format.md',
        title: 'Product Spec Format',
      },
      {
        templateName: 'promotion-format.hbs',
        outputName: 'promotion-format.md',
        title: 'Feedback Promotion Rule and Ledger Format',
      },
    ],
    'prospec-backfill-spec': [
      {
        templateName: 'feature-boundary-criteria.hbs',
        outputName: 'feature-boundary-criteria.md',
        title: 'Feature Boundary Criteria',
      },
    ],
    'prospec-promote-backfill': [
      {
        templateName: 'proposal-format.hbs',
        outputName: 'proposal-format.md',
        title: 'Proposal Format',
      },
      {
        templateName: 'delta-spec-format.hbs',
        outputName: 'delta-spec-format.md',
        title: 'Delta Spec Format',
      },
    ],
    'prospec-learn': [
      {
        templateName: 'promotion-format.hbs',
        outputName: 'promotion-format.md',
        title: 'Feedback Promotion Rule and Ledger Format',
      },
    ],
  };

  return referenceMapCache[skillName] ?? [];
}
