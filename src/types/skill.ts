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
  /**
   * Whether the agent's runtime auto-injects each `SKILL.md` frontmatter
   * (name + description + triggers) into the session context. When true, the
   * entry config's skill registry is redundant with the native mechanism and is
   * rendered as a slim pointer instead of the full per-skill table; when false,
   * the entry config keeps the full table (the only place the agent sees skills).
   */
  surfacesSkillFrontmatter: boolean;
}

/**
 * Predefined Skill definitions (17 Skills total; prospec-quickstart and
 * prospec-upgrade are excludeFromEntryConfig — deployed as a SKILL.md but not
 * listed in the entry config, so 15 appear in CLAUDE.md/AGENTS.md).
 */
export const SKILL_DEFINITIONS: SkillConfig[] = [
  {
    name: 'prospec-explore',
    description: 'Explore - Requirement exploration, problem investigation, and solution comparison partner.',
    triggers: ['explore', 'compare', 'investigate', 'unsure', 'clarify'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-new-story',
    description: 'New Story - Create change requests by guiding User Story and acceptance criteria definition.',
    triggers: ['new feature', 'requirement', 'story', 'I want to'],
    type: 'Planning',
    cliDependency: 'prospec change story',
    hasReferences: true,
  },
  {
    name: 'prospec-plan',
    description: 'Plan Implementation - Convert User Story into technical implementation plan (plan.md) and change specification (delta-spec.md).',
    triggers: ['plan', 'architecture'],
    type: 'Planning',
    cliDependency: 'prospec change plan',
    hasReferences: true,
  },
  {
    name: 'prospec-design',
    description: 'Design Phase - Generate visual and interaction specs from proposal (Generate Mode) or extract specs from existing design tools (Extract Mode). Supports pencil/Figma/Penpot/HTML platforms.',
    triggers: ['design', 'UI spec', 'generate design', 'extract design'],
    type: 'Planning',
    hasReferences: true,
  },
  {
    name: 'prospec-tasks',
    description: 'Break Down Tasks - Decompose implementation plan into an actionable task checklist (tasks.md).',
    triggers: ['break down', 'tasks', 'task list', 'work items', 'how to split'],
    type: 'Planning',
    cliDependency: 'prospec change tasks',
    hasReferences: true,
  },
  {
    name: 'prospec-ff',
    description: 'Fast-Forward Planning - Generate complete planning artifacts in one pass (Story → Plan → Tasks).',
    triggers: ['fast-forward', 'ff', 'all at once'],
    type: 'Planning',
    cliDependency: 'prospec change story + plan + tasks',
    hasReferences: true,
  },
  {
    name: 'prospec-implement',
    description: 'Implementation - Execute tasks from the task list, implementing features one by one.',
    triggers: ['implement', 'start coding', 'write code'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-review',
    description: 'Adversarial Code Review → Fix Loop - Between implement and verify, an independent fresh-context reviewer audits the whole change diff; verifier-confirmed criticals are auto-fixed, majors are proposed, and a spec-aware lens checks delta-spec/dependency-direction.',
    triggers: ['review', 'code review', 'adversarial review', 'find bugs', 'critical'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-verify',
    description: 'Verify Implementation - Run 5+1 dimension audit (tasks, spec compliance, constitution, knowledge-implementation consistency, tests, design consistency) and assign quality grade (S/A/B/C/D).',
    triggers: ['verify', 'audit', 'quality', 'done'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-knowledge-generate',
    description: 'Generate AI Knowledge - Read raw-scan.md, analyze project structure, autonomously decide module boundaries, and produce Recipe-First module READMEs and index.',
    triggers: ['generate knowledge', 'analyze project', 'module split'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-archive',
    description: 'Archive Changes - Archive completed changes, generate summary, sync requirements to feature specs, and gate archiving on Knowledge sync.',
    triggers: ['archive', 'clean up', 'wrap up', 'spec sync'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-knowledge-update',
    description: 'Incremental Knowledge Update - Parse delta-spec.md to identify affected modules, scan source code, and update module README, index.md, and module-map.yaml incrementally.',
    triggers: ['knowledge update', 'incremental update', 'sync knowledge', 'update docs'],
    type: 'Lifecycle',
    hasReferences: false,
  },
  {
    name: 'prospec-backfill-spec',
    description: 'Backfill Spec - Reverse-extract a behavioral Feature Spec draft from existing brownfield code (source = code, not a design tool) for features/capabilities with no spec coverage. Records behavior, never intent; stages a draft for human verify-and-promote and never writes the trust zone.',
    triggers: ['backfill spec', 'spec from code', 'brownfield', 'document existing code'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-promote-backfill',
    description: 'Promote Backfill - Formalize a reviewed backfill-draft.md into the backfill change scaffold (proposal.md + delta-spec.md + metadata.yaml with scale: backfill, status: implemented) so brownfield behavior can graduate through verify → archive. A light scale like quick — no hollow plan.md/tasks.md; the single, repeatable draft→scaffold step; never writes the trust zone.',
    triggers: ['promote backfill', 'formalize backfill', 'backfill to delta-spec', 'promote draft'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-learn',
    description: 'Feedback Promotion Pipeline - Collect session corrections, repeated verify FAILs and recurring review criticals into a version-controlled lessons ledger; score them with an explicit, reproducible rule (frequency + impact modules); and promote - only with explicit human approval - across three tiers (accumulating ledger -> team playbook -> Constitution rule).',
    triggers: ['learn', 'promote lesson', 'feedback', 'playbook'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-quickstart',
    description: 'Quickstart Onboarding Finisher - localize skill triggers, re-sync agent config, prepare the knowledge scan, and chain into knowledge generation.',
    triggers: ['quickstart', 'setup', 'bootstrap', 'onboard', 'get started'],
    type: 'Lifecycle',
    cliDependency: 'prospec quickstart',
    hasReferences: false,
    excludeFromEntryConfig: true,
  },
  {
    name: 'prospec-upgrade',
    description: "Prospec Version Upgrade Finisher - after `prospec upgrade` records the version, syncs agents, and reports gaps, work through the report's docs inventory: update init-created files whose format drifted and create missing ones (asking consent per file), then localize triggers for newly-added skills and re-sync.",
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
    // Claude Code auto-injects each .claude/skills/*/SKILL.md frontmatter into
    // the session's available-skills reminder → the entry registry is redundant.
    surfacesSkillFrontmatter: true,
  },
  codex: {
    name: 'codex',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
  },
  copilot: {
    name: 'copilot',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
  },
  antigravity: {
    name: 'antigravity',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
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
  /**
   * `prospec-*` skill directories removed as orphans — a shipped skill that was
   * renamed or dropped leaves a stale SKILL.md that would keep participating in
   * dispatch. Non-`prospec-` directories (the user's own skills) are never swept.
   */
  removedSkills: string[];
}
