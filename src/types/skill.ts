/**
 * Skill-related type definitions for prospec agent sync.
 *
 * Describes the structure of generated Skills and Agent configurations.
 */
import type { ValidAgent } from './config.js';

/**
 * Skill type categorization.
 *
 * - Planning: Depends on CLI commands to create scaffolds, then AI fills content
 * - Execution: Pure AI workflow, no CLI dependency
 * - Lifecycle: Auxiliary tools (explore has no CLI dependency)
 */
export type SkillType = 'Planning' | 'Execution' | 'Lifecycle';

/**
 * Skill configuration describing a single prospec-* Skill.
 */
export interface SkillConfig {
  /** Skill name (e.g., 'prospec-explore') */
  name: string;
  /** Skill description (shown in AI context) */
  description: string;
  /** English trigger-word baseline rendered into the SKILL.md frontmatter */
  triggers: string[];
  /** Skill type categorization */
  type: SkillType;
  /** CLI command this Skill depends on (e.g., 'prospec change story') */
  cliDependency?: string;
  /** Whether this Skill has reference files in references/ subdirectory */
  hasReferences: boolean;
  /**
   * Exclude this Skill from the always-loaded agent entry config
   * (CLAUDE.md/AGENTS.md) while still deploying its SKILL.md on disk (invocable
   * on demand). Absent = false = listed normally. Reserved for self-terminating
   * one-shot flows (onboarding, migration, repair) whose permanent Layer-0 token
   * cost is not justified by once-per-project use. See `_conventions.md`.
   */
  excludeFromEntryConfig?: boolean;
}

/**
 * Agent configuration describing a target AI CLI platform.
 */
export interface AgentConfig {
  /** Agent identifier (e.g., 'claude', 'antigravity', 'copilot', 'codex') */
  name: string;
  /** Base path for Skill files relative to project root */
  skillPath: string;
  /** Path for the agent's entry configuration file */
  configPath: string;
}

/**
 * Predefined Skill definitions (17 Skills total; prospec-quickstart and
 * prospec-upgrade are excludeFromEntryConfig — deployed as a SKILL.md but not
 * listed in the entry config, so 15 appear in CLAUDE.md/AGENTS.md).
 */
export const SKILL_DEFINITIONS: SkillConfig[] = [
  {
    name: 'prospec-explore',
    description: 'Exploration mode — acts as a thinking partner to clarify requirements, investigate problems, and compare solutions.',
    triggers: ['explore', 'compare', 'investigate', 'unsure', 'clarify'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-new-story',
    description: 'Create a new change request. Guides the user through describing the requirement and calls prospec change story to create a structured proposal.md and metadata.yaml.',
    triggers: ['new feature', 'requirement', 'story', 'I want to', 'change'],
    type: 'Planning',
    cliDependency: 'prospec change story',
    hasReferences: true,
  },
  {
    name: 'prospec-plan',
    description: 'Generate an implementation plan from a change request. Reads proposal.md, related module AI Knowledge, and the Constitution to produce a structured plan.md and delta-spec.md.',
    triggers: ['plan', 'design architecture', 'how to implement'],
    type: 'Planning',
    cliDependency: 'prospec change plan',
    hasReferences: true,
  },
  {
    name: 'prospec-design',
    description: 'Design phase — generate visual and interaction specs from a proposal (Generate Mode) or extract specs from existing design tools (Extract Mode). Supports pencil/Figma/Penpot/HTML platforms.',
    triggers: ['design', 'UI spec', 'generate design', 'extract design'],
    type: 'Planning',
    hasReferences: true,
  },
  {
    name: 'prospec-tasks',
    description: 'Break an implementation plan into an actionable task checklist, ordered by architecture layer, in checkbox format with complexity estimates and parallelization markers.',
    triggers: ['break down', 'tasks', 'task list', 'work items', 'how to split'],
    type: 'Planning',
    cliDependency: 'prospec change tasks',
    hasReferences: true,
  },
  {
    name: 'prospec-ff',
    description: 'Fast-forward — generate all planning artifacts (story → plan → tasks) in one pass. Suited for moving fast when requirements are clear.',
    triggers: ['fast-forward', 'ff', 'all at once', 'quick plan'],
    type: 'Planning',
    cliDependency: 'prospec change story + plan + tasks',
    hasReferences: true,
  },
  {
    name: 'prospec-implement',
    description: 'Implement tasks from tasks.md one by one. Reads the task list, implements in order, and checks off each completed checkbox.',
    triggers: ['implement', 'start coding', 'write code', 'execute tasks'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-review',
    description: 'Adversarial code review → fix loop. Between implement and verify, an independent fresh-context reviewer audits the whole change diff; verifier-confirmed criticals are auto-fixed, majors are proposed, and a spec-aware lens checks delta-spec REQs, dependency direction, and module conventions.',
    triggers: ['review', 'code review', 'adversarial review', 'find bugs', 'critical'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-verify',
    description: 'Verify the implementation against specs and plan. Runs full Constitution validation, tasks.md completion, spec consistency, and test pass rate.',
    triggers: ['verify', 'check', 'audit', 'quality', 'done', 'grade'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-knowledge-generate',
    description: 'Generate AI Knowledge. Reads raw-scan.md, analyzes project structure, autonomously decides module boundaries, and produces module READMEs and the index.',
    triggers: ['knowledge', 'generate knowledge', 'analyze project', 'module split'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-archive',
    description: 'Archive completed changes. Scans the changes directory, moves verified changes to archive, generates summary.md, and gates archiving on Knowledge sync.',
    triggers: ['archive', 'clean up', 'wrap up', 'spec sync'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-knowledge-update',
    description: 'Incrementally update AI Knowledge. Parses delta-spec.md to identify affected modules, scans source code, then updates module READMEs, index.md, and module-map.yaml.',
    triggers: ['knowledge update', 'incremental update', 'sync knowledge', 'update docs'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-backfill-spec',
    description: 'Backfill a behavioral Feature Spec draft from existing brownfield code (source = code, not a design tool) for features/capabilities with no spec coverage. Records behavior, never intent; stages a draft for human verify-and-promote and never writes the trust zone.',
    triggers: ['backfill spec', 'spec from code', 'brownfield', 'backfill', 'document existing code'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-promote-backfill',
    description: 'Formalize a reviewed backfill-draft.md into the backfill change scaffold (proposal + delta-spec + metadata with scale: backfill, status: implemented) so brownfield behavior can graduate through verify → archive. A light scale like quick — no hollow plan/tasks; the single, repeatable draft→scaffold step; never writes the trust zone.',
    triggers: ['promote backfill', 'formalize backfill', 'backfill to delta-spec', 'scaffold backfill', 'promote draft'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-learn',
    description: 'Feedback promotion pipeline. Collects session corrections, repeated verify FAILs, and recurring review criticals into a version-controlled lessons ledger; scores them with an explicit, reproducible rule (frequency + impacted modules); and promotes — only with explicit human approval — across three tiers (accumulating ledger → team playbook → Constitution rule).',
    triggers: ['learn', 'promote lesson', 'feedback', 'playbook'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-quickstart',
    description: 'One-command onboarding finisher. After `prospec quickstart` scaffolds the project, this Skill localizes skill triggers to the configured language, re-syncs agent config, prepares the knowledge scan, and chains into knowledge generation. Excluded from the always-loaded entry config (one-time use).',
    triggers: ['quickstart', 'setup', 'bootstrap', 'onboard', 'get started'],
    type: 'Lifecycle',
    cliDependency: 'prospec quickstart',
    hasReferences: false,
    excludeFromEntryConfig: true,
  },
  {
    name: 'prospec-upgrade',
    description: 'Upgrade Prospec to a new CLI version. After `prospec upgrade` refreshes the canonical (shipped) docs and emits a report with a docs inventory, this Skill translates triggers for newly-added skills (fill-missing only), migrates outdated init-doc formats, and creates docs the inventory marks missing — each with user confirmation and a diff/content preview — then re-syncs. Never auto-writes the curated trust zone. Excluded from the always-loaded entry config (periodic one-time use).',
    triggers: ['upgrade', 'upgrade prospec', 'migrate version', 'version bump'],
    type: 'Lifecycle',
    cliDependency: 'prospec upgrade',
    hasReferences: false,
    excludeFromEntryConfig: true,
  },
];

/**
 * Agent configuration definitions for all supported AI CLI platforms.
 */
export const AGENT_CONFIGS: Record<ValidAgent, AgentConfig> = {
  claude: {
    name: 'claude',
    skillPath: '.claude/skills',
    configPath: 'CLAUDE.md',
  },
  codex: {
    name: 'codex',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
  },
  copilot: {
    name: 'copilot',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
  },
  antigravity: {
    name: 'antigravity',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
  },
};

/**
 * Result of generating files for a single agent.
 */
export interface AgentSyncResult {
  /** Agent name */
  agent: string;
  /** Entry config file path */
  configFile: string;
  /** Generated Skill file paths */
  skillFiles: string[];
  /** Generated reference file paths */
  referenceFiles: string[];
}
