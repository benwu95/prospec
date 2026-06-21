import * as path from 'node:path';
import { checkbox, input, Separator } from '@inquirer/prompts';
import { AlreadyExistsError, ConfigInvalid } from '../types/errors.js';
import type { ProspecConfig } from '../types/config.js';
import { DEFAULT_BASE_DIR, DEFAULT_ARTIFACT_LANGUAGE, VALID_AGENTS } from '../types/config.js';
import { INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR } from '../types/knowledge.js';
import { writeConfig } from '../lib/config.js';
import { fileExists, ensureDir, atomicWrite } from '../lib/fs-utils.js';
import { PROSPEC_VERSION } from '../types/version.js';
import { CANONICAL_CONVENTION_DOCS } from '../types/canonical-docs.js';
import { detectTechStack } from '../lib/detector.js';
import type { TechStackResult } from '../lib/detector.js';
export type { TechStackResult };
import { exampleRulesFor, languagePolicyRule } from '../lib/constitution-rules.js';
export { isDefaultArtifactLanguage } from '../lib/config.js';
import { detectAgents } from '../lib/agent-detector.js';
import type { AgentInfo } from '../lib/agent-detector.js';
import { renderTemplate } from '../lib/template.js';

export interface InitOptions {
  name?: string;
  agents?: string[];
  language?: string;
  cwd?: string;
}

export interface InitResult {
  projectName: string;
  techStack: TechStackResult;
  agentInfos: AgentInfo[];
  selectedAgents: string[];
  artifactLanguage: string;
  createdFiles: string[];
}

/**
 * Execute the init workflow:
 *
 * 1. Check if .prospec.yaml already exists → AlreadyExistsError
 * 2. Detect tech stack from project files
 * 3. Detect installed AI CLI tools
 * 4. Prompt for agent selection (or use --agents flag)
 * 5. Write .prospec.yaml
 * 6. Create directory structure
 * 7. Render template files
 */
export async function execute(options: InitOptions): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const configPath = path.join(cwd, '.prospec.yaml');

  // 1. Check existing config
  if (fileExists(configPath)) {
    throw new AlreadyExistsError('.prospec.yaml');
  }

  // 2. Detect tech stack
  const techStack = detectTechStack(cwd);

  // 3. Detect agents
  const agentInfos = detectAgents();

  // 4. Resolve project name
  const projectName = options.name ?? path.basename(cwd);

  // 5. Select agents
  let selectedAgents: string[];
  if (options.agents) {
    // CI/CD mode: use provided agents list — validate up front so a bad value
    // fails here (naming the offender) instead of surfacing as ConfigInvalid on
    // the NEXT readConfig of a freshly written .prospec.yaml.
    const known = VALID_AGENTS as readonly string[];
    const unknown = options.agents.filter((a) => !known.includes(a));
    if (unknown.length > 0) {
      throw new ConfigInvalid(
        `unknown agent(s): ${unknown.join(', ')} — supported: ${VALID_AGENTS.join(', ')}`,
      );
    }
    selectedAgents = options.agents;
  } else {
    // Interactive mode: prompt with checkbox
    selectedAgents = await promptAgentSelection(agentInfos);
  }

  // 6. Prompt for base directory
  let baseDir: string;
  if (options.agents) {
    // CI/CD mode: use default
    baseDir = DEFAULT_BASE_DIR;
  } else {
    baseDir = await input({
      message: 'Prospec artifacts directory:',
      default: DEFAULT_BASE_DIR,
    });
  }

  // 6b. Resolve artifact language (documents written by AI; code stays English)
  let artifactLanguage: string;
  if (options.language !== undefined) {
    artifactLanguage = options.language;
  } else if (options.agents) {
    // CI/CD mode: no prompt
    artifactLanguage = DEFAULT_ARTIFACT_LANGUAGE;
  } else {
    artifactLanguage = await input({
      message: 'Primary language for AI-generated documents:',
      default: DEFAULT_ARTIFACT_LANGUAGE,
    });
  }
  artifactLanguage = artifactLanguage.trim() || DEFAULT_ARTIFACT_LANGUAGE;

  // 7. Build config
  const config: ProspecConfig = {
    version: PROSPEC_VERSION,
    project: {
      name: projectName,
    },
    ...(hasTechStack(techStack)
      ? { tech_stack: techStack }
      : {}),
    paths: { base_dir: baseDir },
    artifact_language: artifactLanguage,
    exclude: ['*.env*', '*credential*', '*secret*', 'node_modules', '.git'],
    agents: selectedAgents.length > 0 ? selectedAgents as ProspecConfig['agents'] : undefined,
    knowledge: {
      base_path: `${baseDir}/ai-knowledge`,
    },
  };

  // 8. Resolve paths
  const knowledgePath = path.join(cwd, baseDir, 'ai-knowledge');
  const modulesPath = path.join(knowledgePath, 'modules');
  const specsPath = path.join(cwd, baseDir, 'specs');

  // 9. Render ALL template contents up front. A render failure aborts before any
  // file is written, so init never leaves a partially-scaffolded project behind.
  const templateContext = {
    project_name: projectName,
    tech_stack: hasTechStack(techStack) ? techStack : undefined,
    agents: selectedAgents,
    base_dir: baseDir,
    artifact_language: artifactLanguage,
    example_rules: [languagePolicyRule(artifactLanguage), ...exampleRulesFor(techStack)],
    index_table_header: INDEX_TABLE_HEADER,
    index_table_separator: INDEX_TABLE_SEPARATOR,
  };

  const artifacts: { path: string; content: string; label: string }[] = [
    { path: path.join(cwd, baseDir, 'CONSTITUTION.md'), content: renderTemplate('init/constitution.md.hbs', templateContext), label: `${baseDir}/CONSTITUTION.md` },
    { path: path.join(cwd, 'AGENTS.md'), content: renderTemplate('init/agents.md.hbs', templateContext), label: 'AGENTS.md' },
    { path: path.join(knowledgePath, '_conventions.md'), content: renderTemplate('init/conventions.md.hbs', templateContext), label: `${baseDir}/ai-knowledge/_conventions.md` },
    { path: path.join(knowledgePath, '_index.md'), content: renderTemplate('init/index.md.hbs', templateContext), label: `${baseDir}/ai-knowledge/_index.md` },
    ...CANONICAL_CONVENTION_DOCS.map((doc) => ({
      path: path.join(knowledgePath, doc.output),
      content: renderTemplate(doc.template, templateContext),
      label: `${baseDir}/ai-knowledge/${doc.output}`,
    })),
    { path: path.join(specsPath, '.gitkeep'), content: '', label: `${baseDir}/specs/.gitkeep` },
  ];

  // 10. Create directories (idempotent) and write each artifact ONLY if it does
  // not already exist — per-file skip-if-exists (cf. knowledge-init.service). The
  // step-1 gate only lets init run fully when .prospec.yaml is absent; in that
  // window the other artifacts (curated trust-zone CONSTITUTION.md /
  // _conventions.md / _index.md included) may still be present, so an
  // unconditional write would clobber them. Skipping existing files rebuilds only
  // what is missing; refreshing stale canonical docs is `prospec upgrade`'s job.
  await ensureDir(modulesPath);
  await ensureDir(specsPath);
  const writtenLabels: string[] = [];
  for (const artifact of artifacts) {
    if (fileExists(artifact.path)) continue;
    await atomicWrite(artifact.path, artifact.content);
    writtenLabels.push(artifact.label);
  }

  // 11. Write .prospec.yaml LAST — its presence is the "init completed" marker
  // the step-1 guard keys on, so a failure before here leaves a re-runnable state
  // rather than a half-initialized project that AlreadyExistsError would block.
  await writeConfig(config, cwd);

  const createdFiles = ['.prospec.yaml', ...writtenLabels];

  return {
    projectName,
    techStack,
    agentInfos,
    selectedAgents,
    artifactLanguage,
    createdFiles,
  };
}

async function promptAgentSelection(agentInfos: AgentInfo[]): Promise<string[]> {
  const choices = agentInfos.map((agent) => ({
    name: agent.detected
      ? `${agent.name} (detected)`
      : `${agent.name} (not installed)`,
    value: agent.id,
    checked: agent.detected,
  }));

  return checkbox({
    message: 'Select AI Assistants to configure:',
    choices: [
      new Separator('─── Available AI CLI Tools ───'),
      ...choices,
    ],
  });
}

function hasTechStack(ts: TechStackResult): boolean {
  return !!(ts.language || ts.framework || ts.package_manager);
}
