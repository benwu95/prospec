/**
 * Skill-related type definitions for prospec agent sync.
 *
 * Describes the structure of generated Skills and Agent configurations.
 */
import { VALID_AGENTS, type ValidAgent } from './config.js';

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
 * What an execution harness can do, declared per agent so a generated skill
 * states a fact instead of asking the running agent to judge its own harness.
 *
 * These describe the PLATFORM's capability, never runtime availability — a
 * capable harness can still have the primitive disabled for a given session,
 * which is why the consuming templates keep a runtime fallback on the capable
 * branch.
 */
export interface HarnessCapabilities {
  /** Spawn an independent sub-agent that does not share the caller's context. */
  canSpawnSubagent: boolean;
  /** Run agent work inside an isolated git worktree. */
  canWorktree: boolean;
  /** Run a task detached, so the session is not blocked while it runs. */
  canBackground: boolean;
}

/**
 * Canonical enumeration of the capability flags — every consumer derives from
 * it (the intersection reducer, the render-context builder) so a new flag
 * cannot reach some consumers and silently miss others.
 */
export const HARNESS_CAPABILITY_KEYS = [
  'canSpawnSubagent',
  'canWorktree',
  'canBackground',
] as const satisfies readonly (keyof HarnessCapabilities)[];

/**
 * Compile-time exhaustiveness: `satisfies` only checks each listed key is
 * valid, so a flag added to `HarnessCapabilities` but not listed above would
 * pass silently — and then never be visited by any loop over the list. This
 * makes that omission a type error instead.
 */
type AssertNever<T extends never> = T;
export type _CapabilityKeysAreExhaustive = AssertNever<
  Exclude<keyof HarnessCapabilities, (typeof HARNESS_CAPABILITY_KEYS)[number]>
>;

/**
 * Reduce several agents' capabilities to what ALL of them support.
 *
 * Agents that share one output signature (codex/copilot/antigravity all write
 * `.agents/skills` + `AGENTS.md`) read the same bytes, so the shared file must
 * not claim a capability any one of them lacks.
 */
export function intersectCapabilities(
  declared: readonly HarnessCapabilities[],
): HarnessCapabilities {
  // Built by looping the canonical key list (exhaustive per the type check
  // above), so the cast is filled before it is returned and a newly-added flag
  // cannot be left silently false.
  const result = {} as HarnessCapabilities;
  for (const key of HARNESS_CAPABILITY_KEYS) {
    // Empty declares nothing. The AND-identity would be all-true, which would
    // let a caller claim capabilities no agent backs.
    result[key] = declared.length > 0 && declared.every((c) => c[key]);
  }
  return result;
}

/**
 * The render-affecting flags of an `AgentConfig` — the subset a group of agents
 * that share one entry config (same `skillPath` + `configPath`) must MERGE
 * before rendering, because one file's bytes serve every member. Kept a
 * dedicated interface (extended by `AgentConfig`) so `keyof AgentRenderFlags` is
 * exactly the render-flag set the reducer registry below is mapped over — a new
 * flag with no merge rule is then a compile error, not a latent bug.
 */
export interface AgentRenderFlags {
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
 * Canonical enumeration of the render flags — the reducer loop and the
 * render-context builder both derive from it, mirroring
 * `HARNESS_CAPABILITY_KEYS`.
 */
export const RENDER_FLAG_KEYS = [
  'surfacesSkillFrontmatter',
] as const satisfies readonly (keyof AgentRenderFlags)[];

/**
 * Compile-time exhaustiveness twin of `_CapabilityKeysAreExhaustive`: a flag
 * added to `AgentRenderFlags` but not listed above would pass `satisfies`
 * silently and then never be visited by the reducer loop. This makes that
 * omission a type error too.
 */
export type _RenderFlagKeysAreExhaustive = AssertNever<
  Exclude<keyof AgentRenderFlags, (typeof RENDER_FLAG_KEYS)[number]>
>;

/** Reduce one render flag's values across a group's members to a single value. */
type RenderFlagReducer = (values: readonly boolean[]) => boolean;

/**
 * Each render flag DECLARES its own group-merge semantics — never a blanket
 * rule. The registry is mapped over `keyof AgentRenderFlags`, so adding a flag
 * there without a reducer here is a COMPILE error (a missing property), instead
 * of the next flag silently inheriting a default the way `surfacesSkillFrontmatter`
 * silently took `configs[0]`'s view.
 */
export const GROUP_RENDER_FLAG_REDUCERS: {
  readonly [K in keyof AgentRenderFlags]: RenderFlagReducer;
} = {
  // Slim only when EVERY member surfaces SKILL.md frontmatter; any member that
  // does not keeps the full table (the conservative side — the members that need
  // the table never lose their only skill listing). Empty declares nothing →
  // false → full, never `[].every() === true` → slim.
  surfacesSkillFrontmatter: (values) => values.length > 0 && values.every(Boolean),
};

/**
 * Reduce a group's members to the single `AgentRenderFlags` its shared entry
 * config renders, applying each flag's declared reducer.
 *
 * Agents that share one output signature (codex/copilot/antigravity all write
 * `.agents/skills` + `AGENTS.md`) read the same bytes, so the shared file's
 * render flags must reflect the whole group, never one member (`configs[0]`).
 */
export function mergeGroupRenderFlags(
  members: readonly AgentRenderFlags[],
): AgentRenderFlags {
  // Built by looping the canonical key list (exhaustive per the type check
  // above), so the cast is filled before it is returned.
  const result = {} as AgentRenderFlags;
  for (const key of RENDER_FLAG_KEYS) {
    result[key] = GROUP_RENDER_FLAG_REDUCERS[key](members.map((m) => m[key]));
  }
  return result;
}

/**
 * A host's supported explicit way to invoke a Skill. Skill names themselves
 * stay sigil-free (`prospec-<name>`); the profile only describes the host UI.
 */
export type InvocationProfile =
  | {
      readonly mode: 'sigil';
      readonly label: string;
      readonly invocationPrefix: '$' | '/';
    }
  | {
      readonly mode: 'name-or-browser';
      readonly label: string;
      readonly invocationInstruction: string;
    };

/** Every invocation mode must be accounted for by the shared renderer. */
export const INVOCATION_PROFILE_MODES = [
  'sigil',
  'name-or-browser',
] as const satisfies readonly InvocationProfile['mode'][];

/** A new InvocationProfile mode without a registry entry is a type error. */
export type _InvocationProfileModesAreExhaustive = AssertNever<
  Exclude<InvocationProfile['mode'], (typeof INVOCATION_PROFILE_MODES)[number]>
>;

/**
 * Host-labelled, template-ready guidance derived from an InvocationProfile.
 * The entry template owns the canonical `prospec-<name>` literal so its bare
 * identity cannot be accidentally coupled to one host's invocation syntax.
 */
export type InvocationGuidance =
  | {
      readonly agent: ValidAgent;
      readonly label: string;
      readonly invocationPrefix: '$' | '/';
    }
  | {
      readonly agent: ValidAgent;
      readonly label: string;
      readonly invocationInstruction: string;
    };

/** The minimal registry shape required by the shared guidance reducer. */
export interface InvocationProfileMember {
  readonly name: ValidAgent;
  readonly invocation: InvocationProfile;
}

function toInvocationGuidance(
  agent: ValidAgent,
  profile: InvocationProfile,
): InvocationGuidance {
  switch (profile.mode) {
    case 'sigil':
      return {
        agent,
        label: profile.label,
        invocationPrefix: profile.invocationPrefix,
      };
    case 'name-or-browser':
      return {
        agent,
        label: profile.label,
        invocationInstruction: profile.invocationInstruction,
      };
    default: {
      const unreachable: never = profile;
      return unreachable;
    }
  }
}

/**
 * Merge invocation guidance for one output-signature group. It is deliberately
 * conservative for empty input, removes repeated members, and iterates the
 * frozen ValidAgent order rather than trusting the caller's config order.
 */
export function mergeGroupInvocationGuidance(
  members: readonly InvocationProfileMember[],
): InvocationGuidance[] {
  const profilesByAgent = new Map<ValidAgent, InvocationProfile>();
  for (const member of members) {
    profilesByAgent.set(member.name, member.invocation);
  }

  return VALID_AGENTS.flatMap((agent) => {
    const profile = profilesByAgent.get(agent);
    return profile ? [toInvocationGuidance(agent, profile)] : [];
  });
}

/**
 * Agent configuration describing a target AI CLI platform.
 */
export interface AgentConfig extends AgentRenderFlags, InvocationProfileMember {
  /** Agent identifier (e.g., 'claude', 'antigravity', 'copilot', 'codex') */
  name: ValidAgent;
  /** Base path for Skill files relative to project root */
  skillPath: string;
  /** Path for the agent's entry configuration file */
  configPath: string;
  /**
   * What this harness can do. Injected into every skill render context by
   * `agent-sync`, so the generated SKILL.md states the capability rather than
   * asking the agent to determine it at runtime.
   */
  capabilities: HarnessCapabilities;
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
    triggers: ['new feature', 'requirement', 'user story'],
    type: 'Planning',
    cliDependency: 'prospec change story',
    hasReferences: true,
  },
  {
    name: 'prospec-plan',
    description: 'Plan Implementation - Convert User Story into technical implementation plan (plan.md) and change specification (delta-spec.md).',
    triggers: ['plan', 'architecture', 'technical plan'],
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
    triggers: ['review', 'code review', 'adversarial review', 'find bugs'],
    type: 'Execution',
    hasReferences: true,
  },
  {
    name: 'prospec-verify',
    description: 'Verify Implementation - Run 5+1 dimension audit (tasks, spec compliance, constitution, knowledge-implementation consistency, tests, design consistency) and assign quality grade (S/A/B/C/D).',
    triggers: ['verify', 'audit', 'quality check'],
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
    triggers: ['archive', 'spec sync', 'finalize change'],
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
    triggers: ['learn', 'promote lesson', 'playbook'],
    type: 'Lifecycle',
    hasReferences: true,
  },
  {
    name: 'prospec-quickstart',
    description: 'Quickstart Onboarding Finisher - localize skill triggers, re-sync agent config, prepare the knowledge scan, and chain into knowledge generation.',
    triggers: ['quickstart', 'onboard', 'bootstrap', 'get started'],
    type: 'Lifecycle',
    cliDependency: 'prospec quickstart',
    hasReferences: false,
    excludeFromEntryConfig: true,
  },
  {
    name: 'prospec-upgrade',
    description: "Prospec Version Upgrade Finisher - after `prospec upgrade` records the version, syncs agents, and reports gaps, work through the report's docs inventory: update init-created files whose format drifted and create missing ones (asking consent per file), then localize triggers for newly-added skills and re-sync.",
    triggers: ['upgrade prospec', 'prospec upgrade', 'migrate prospec version'],
    type: 'Lifecycle',
    cliDependency: 'prospec upgrade',
    hasReferences: false,
    excludeFromEntryConfig: true,
  },
];

/**
 * Agent configuration definitions for all supported AI CLI platforms.
 *
 * `capabilities` is a dated vendor-documentation survey (2026-07-30), not a
 * runtime probe. Each agent names the document it was read from and each flag
 * names the surface that backs it, so a re-surveyor can re-check the same place
 * instead of trusting folklore. Re-survey before relying on an old value.
 */
export const AGENT_CONFIGS: Record<ValidAgent, AgentConfig> = {
  claude: {
    name: 'claude',
    skillPath: '.claude/skills',
    configPath: 'CLAUDE.md',
    // Claude Code auto-injects each .claude/skills/*/SKILL.md frontmatter into
    // the session's available-skills reminder → the entry registry is redundant.
    surfacesSkillFrontmatter: true,
    // Source: https://code.claude.com/docs/en/agent-sdk/slash-commands
    invocation: {
      mode: 'sigil',
      label: 'Claude Code',
      invocationPrefix: '/',
    },
    // Source: Claude Code tool reference (Agent + Bash tool schemas).
    capabilities: {
      // Agent tool spawns an independent sub-agent with its own context.
      canSpawnSubagent: true,
      // Agent tool parameter `isolation: "worktree"` — the only surveyed
      // harness with first-class git-worktree isolation.
      canWorktree: true,
      // Bash tool parameter `run_in_background`, plus tracked background tasks.
      canBackground: true,
    },
  },
  codex: {
    name: 'codex',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
    // Source: https://learn.chatgpt.com/docs/build-skills
    invocation: {
      mode: 'sigil',
      label: 'Codex',
      invocationPrefix: '$',
    },
    // Source: learn.chatgpt.com/docs/agent-configuration/subagents + Codex CLI docs.
    capabilities: {
      // `/spawn` subagents (default/worker/explorer), GA March 2026.
      canSpawnSubagent: true,
      // No native worktree support — openai/codex#12862 is still open.
      canWorktree: false,
      // `/background` detaches the session; `codex exec` runs unattended.
      canBackground: true,
    },
  },
  copilot: {
    name: 'copilot',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
    // Source: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features
    invocation: {
      mode: 'sigil',
      label: 'GitHub Copilot',
      invocationPrefix: '/',
    },
    // Source: docs.github.com/en/copilot/how-tos/copilot-cli (custom agents,
    // sub-agent orchestration) + code.visualstudio.com/docs/agents/agent-types/copilot-cli.
    capabilities: {
      // Custom `.agent.md` agents run as subagents; `/fleet` runs them in parallel.
      canSpawnSubagent: true,
      // Worktree isolation for a Copilot CLI session is created by VS Code, not
      // by the CLI — nothing the CLI harness can request for itself.
      canWorktree: false,
      // Background agents / parallel autonomous local sessions.
      canBackground: true,
    },
  },
  antigravity: {
    name: 'antigravity',
    skillPath: '.agents/skills',
    configPath: 'AGENTS.md',
    surfacesSkillFrontmatter: false,
    // Source: https://antigravity.google/docs/skills
    invocation: {
      mode: 'name-or-browser',
      label: 'Antigravity',
      invocationInstruction: 'Mention the bare Skill name or select it from the Skills browser.',
    },
    // Source: antigravity.google/docs/cli/subagents.
    capabilities: {
      // `invoke_subagent` for custom agents declaring `subagent: true`.
      canSpawnSubagent: true,
      // Subagents get workspace isolation; git worktrees are not documented
      // there — absence of evidence, so the conservative value.
      canWorktree: false,
      // Asynchronous background Tasks, surfaced by `/tasks` and `/agents`.
      canBackground: true,
    },
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
