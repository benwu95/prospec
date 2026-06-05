import * as path from 'node:path';
import { readConfig, resolveBasePaths } from '../lib/config.js';
import { renderTemplate } from '../lib/template.js';
import { atomicWrite, ensureDir } from '../lib/fs-utils.js';
import { PrerequisiteError } from '../types/errors.js';
import { VALID_AGENTS } from '../types/config.js';
import {
  SKILL_DEFINITIONS,
  AGENT_CONFIGS,
  type AgentConfig,
  type AgentSyncResult,
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
      '未配置任何 AI Agent',
      `請在 .prospec.yaml 的 agents 欄位中加入至少一個 agent（支援：${VALID_AGENTS.join('、')}），或執行 \`prospec init\` 重新初始化`,
    );
  }

  // 2. Determine which agents to sync
  let agentsToSync: string[];
  if (options.cli) {
    if (!configuredAgents.includes(options.cli as typeof configuredAgents[number])) {
      throw new PrerequisiteError(
        `Agent '${options.cli}' 未在 .prospec.yaml 中配置`,
        `已配置的 agents: ${configuredAgents.join(', ')}`,
      );
    }
    agentsToSync = [options.cli];
  } else {
    agentsToSync = [...configuredAgents];
  }

  // 3. Template context (shared across all agents)
  const templateContext = {
    project_name: config.project.name,
    base_dir: baseDir,
    knowledge_base_path: knowledgeBasePath,
    constitution_path: constitutionPath,
    tech_stack: config.tech_stack ?? {},
    skills: SKILL_DEFINITIONS.map((s) => ({
      name: s.name,
      description: s.description,
      type: s.type,
      hasReferences: s.hasReferences,
    })),
  };

  // 4. Group agents by output signature so agents sharing the same
  //    (skillPath, configPath) write the same files only once.
  const groups = new Map<string, { config: AgentConfig; names: string[] }>();
  for (const agentName of agentsToSync) {
    const agentConfig = AGENT_CONFIGS[agentName];
    if (!agentConfig) continue;

    const signature = `${agentConfig.skillPath}\n${agentConfig.configPath}`;
    const group = groups.get(signature);
    if (group) {
      group.names.push(agentName);
    } else {
      groups.set(signature, { config: agentConfig, names: [agentName] });
    }
  }

  // 5. Generate once per unique output; report the agents it serves.
  const results: AgentSyncResult[] = [];
  for (const { config: agentConfig, names } of groups.values()) {
    const result = await syncAgent(agentConfig, templateContext, cwd);
    result.agent = names.join(', ');
    results.push(result);
  }

  // 6. Compute totals
  const totalFiles = results.reduce(
    (sum, r) => sum + 1 + r.skillFiles.length + r.referenceFiles.length,
    0,
  );

  return { agents: results, totalFiles };
}

/**
 * Sync a single agent: generate skills + entry config.
 */
async function syncAgent(
  agentConfig: AgentConfig,
  templateContext: Record<string, unknown>,
  cwd: string,
): Promise<AgentSyncResult> {
  const skillFiles: string[] = [];
  const referenceFiles: string[] = [];

  await syncSkillsDirSkills(
    agentConfig,
    templateContext,
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
  cwd: string,
  skillFiles: string[],
  referenceFiles: string[],
): Promise<void> {
  for (const skill of SKILL_DEFINITIONS) {
    const skillDir = path.join(cwd, agentConfig.skillPath, skill.name);
    const skillFilePath = path.join(skillDir, 'SKILL.md');

    // Render skill template
    const content = renderTemplate(
      `skills/${skill.name}.hbs`,
      templateContext,
    );

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
 * Map skill names to their reference files.
 */
function getSkillReferences(skillName: string): SkillReference[] {
  const referenceMap: Record<string, SkillReference[]> = {
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
    ],
  };

  return referenceMap[skillName] ?? [];
}
