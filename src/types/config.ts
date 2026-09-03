import { z } from 'zod';

/**
 * CLI output verbosity level.
 */
export type LogLevel = 'quiet' | 'normal' | 'verbose';

/**
 * ProspecConfig schema — validates .prospec.yaml
 *
 * Uses Zod 4 unified `error` parameter for custom messages.
 */

const TechStackSchema = z.object({
  language: z.string().optional(),
  framework: z.string().optional(),
  package_manager: z.string().optional(),
  /** The project's test command, e.g. `pnpm test` or `pytest -q`. Read by
   *  `resolveTestCommand` for `check --record-tests`; when unset it falls back to
   *  `<package_manager> test` for a project whose package.json declares a test
   *  script. Tokenized on whitespace and run without a shell, so shell syntax
   *  (pipes, `&&`, redirection) is deliberately unsupported. */
  test_command: z.string().optional(),
}).optional();

/**
 * Knowledge module partitioning strategies.
 *
 * - auto: AI determines best strategy based on project structure
 * - architecture: Split by src/ top-level directories (CLI tools, libs)
 * - domain: Split by business domain (frontend/backend apps)
 * - package: Split by workspace packages (monorepos)
 */
export const KNOWLEDGE_STRATEGIES = ['auto', 'architecture', 'domain', 'package'] as const;
export type KnowledgeStrategy = typeof KNOWLEDGE_STRATEGIES[number];

// Field names align with the index.md progressive-loading layers (L1/L2) plus the
// three surfaces measure-all-load-surfaces added, the single taxonomy the
// knowledge-size drift check enforces:
//   l1_per_file      — max tokens for each L1 file (index.md and each core convention)
//   l2_per_module    — max tokens for each L2 module file (README and each sub-module)
//   readme_max_lines — max lines for each L2 module file
//   spec_per_file    — max tokens for each Feature Spec (and product.md)
//   demand_knowledge_per_file — max tokens for each load-on-demand knowledge file
//   skill_per_file   — max tokens for each generated SKILL.md (authoring projects)
//   reference_per_file — max tokens for each generated skill reference
const TokenBudgetSchema = z.object({
  l1_per_file: z.number().optional(),
  l2_per_module: z.number().optional(),
  readme_max_lines: z.number().optional(),
  spec_per_file: z.number().optional(),
  demand_knowledge_per_file: z.number().optional(),
  skill_per_file: z.number().optional(),
  reference_per_file: z.number().optional(),
  headroom: z.number().min(0).max(1).optional(),
}).optional();

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

/**
 * Single source of truth for the knowledge-size drift check thresholds and the
 * numbers declared in index.md's progressive-loading table. `knowledge.token_budget`
 * in .prospec.yaml overrides individual fields; anything unset falls back here.
 *
 * The L1/L2 values were calibrated by slim-knowledge-l1-l2 (#64). The four
 * load-surface values are derived from them rather than guessed:
 * `spec_per_file`/`skill_per_file` are 5x `l2_per_module` — a station loads one or
 * two Feature Specs plus its own instructions, and that trio should stay in the same
 * order of magnitude as the whole L1 layer; `reference_per_file` is half a skill,
 * since "the skill plus the references one phase reads" should fit inside one skill
 * budget; `demand_knowledge_per_file` is ~60% of the ~17.7k tokens at which the
 * lessons ledger's growth was noticed and compressed BY HAND (issue #119), so the
 * signal precedes the manual discovery it replaces.
 */
export const DEFAULT_KNOWLEDGE_TOKEN_BUDGET = {
  l1_per_file: 1800,
  l2_per_module: 1000,
  readme_max_lines: 100,
  spec_per_file: 5000,
  demand_knowledge_per_file: 10000,
  skill_per_file: 5000,
  reference_per_file: 2500,
  headroom: 0.85,
} as const;

/** Resolved token/line budget (DEFAULT_KNOWLEDGE_TOKEN_BUDGET overridden by config). */
export interface KnowledgeSizeBudget {
  /** max tokens per L1 file (index.md + each core convention) */
  l1_per_file: number;
  /** max tokens per L2 module file — the README and each extracted sub-module alike */
  l2_per_module: number;
  /** max lines per L2 module file */
  readme_max_lines: number;
  /** max tokens per Feature Spec file (and product.md) */
  spec_per_file: number;
  /** max tokens per load-on-demand knowledge file (lessons ledger, playbook, ...) */
  demand_knowledge_per_file: number;
  /** max tokens per generated SKILL.md — graded only where the project authors skills */
  skill_per_file: number;
  /** max tokens per generated skill reference — graded only where the project authors skills */
  reference_per_file: number;
  /** headroom threshold (0.0 to 1.0) before early warning is emitted */
  headroom: number;
}

/**
 * Which load surface a measured knowledge file belongs to. Every kind is graded by
 * `KNOWLEDGE_SIZE_RULES`, so a kind added without a rule is a compile error.
 */
export const KNOWLEDGE_SIZE_KINDS = [
  'l1',
  'l2',
  'spec',
  'demand-knowledge',
  'skill',
  'reference',
] as const;
export type KnowledgeSizeKind = (typeof KNOWLEDGE_SIZE_KINDS)[number];

export interface KnowledgeSizeRule {
  /** budget field the item's token count is graded against */
  tokenKey: keyof KnowledgeSizeBudget;
  /** budget field the item's line count is graded against; absent → lines are not graded */
  lineKey?: keyof KnowledgeSizeBudget;
  /** how a finding names this surface */
  label: string;
  /** the named convergence path an over-budget file of this kind should take */
  remedy: string;
}

/**
 * The one place a load surface's budget field, finding label and convergence path
 * are bound together. A WARN whose remedy is "please compress" is a signal nobody
 * can act on, so each kind names what to do instead (issue #135).
 */
export const KNOWLEDGE_SIZE_RULES = {
  l1: {
    tokenKey: 'l1_per_file',
    label: 'L1 file',
    remedy: 'trim it, or move detail down into the L2 file that owns it',
  },
  l2: {
    tokenKey: 'l2_per_module',
    lineKey: 'readme_max_lines',
    label: 'L2 file',
    remedy: 'extract a content-rich, independent sub-area into a linked `{sub-module}.md` before lossy trimming',
  },
  spec: {
    tokenKey: 'spec_per_file',
    label: 'Feature Spec',
    remedy: 'split it into per-story slices under `specs/features/{feature}/`, or retire superseded stories',
  },
  'demand-knowledge': {
    tokenKey: 'demand_knowledge_per_file',
    label: 'load-on-demand knowledge file',
    remedy: "run prospec-learn's Staleness Sweep to retire entries that are mechanized, no longer applicable, or contradicted",
  },
  skill: {
    tokenKey: 'skill_per_file',
    label: 'skill instruction file',
    remedy: 'move phase-specific prose out of the skill body into an on-demand reference',
  },
  reference: {
    tokenKey: 'reference_per_file',
    label: 'skill reference',
    remedy: 'split it by phase, or fold the rarely-read part back into the skill that owns it',
  },
} satisfies Record<KnowledgeSizeKind, KnowledgeSizeRule>;

const KnowledgeSchema = z.object({
  base_path: z.string().optional(),
  additional_core_conventions: z.array(z.string()).optional(),
  strategy: z.enum(KNOWLEDGE_STRATEGIES).optional(),
  token_budget: TokenBudgetSchema,
  generated_artifacts: z.array(z.string()).optional(),
}).optional();

export const DEFAULT_BASE_DIR = 'prospec';

/** Artifact language assumed when `.prospec.yaml` has no `artifact_language`. */
export const DEFAULT_ARTIFACT_LANGUAGE = 'English';

/**
 * Whether a resolved artifact language collapses to the built-in default
 * (case-insensitive). Lives in this leaf module — its only input is the
 * constant above — so both `lib` and the `cli` formatters can reach it without
 * a cli→lib import (lib/config re-exports it for existing callers).
 */
export function isDefaultArtifactLanguage(language: string): boolean {
  return language.trim().toLowerCase() === DEFAULT_ARTIFACT_LANGUAGE.toLowerCase();
}

export const VALID_AGENTS = ['claude', 'codex', 'copilot', 'antigravity'] as const;

/** The canonical supported-agent vocabulary. */
export type ValidAgent = (typeof VALID_AGENTS)[number];

export const ProspecConfigSchema = z
  .object({
    // The prospec version the project uses — stamped by `prospec init` and
    // refreshed by `prospec upgrade`. A legacy `version: "1.0"` reads as a stale
    // version and is bumped to the current prospec version on first upgrade.
    version: z.string().optional(),
    project: z.object({
      name: z.string({ error: 'project.name is a required field' }),
    }),
    tech_stack: TechStackSchema,
    paths: z.object({
      base_dir: z.string().optional(),
    }).optional(),
    exclude: z.array(z.string()).optional(),
    agents: z.array(z.enum(VALID_AGENTS)).optional(),
    knowledge: KnowledgeSchema,
    artifact_language: z.string().optional(),
    trust_zone_language: z.string().optional(),
    skill_triggers: z.record(z.string(), z.array(z.string())).optional(),
    // Executor label vocabulary — the labels `verify record` and `check --record-review`
    // validate `executor` against when declared. prospec assigns them no meaning
    // (no model or vendor is known to the CLI); absent means every executor value
    // stays a free string. An empty array would refuse every value, so it is invalid.
    executors: z.array(z.string().min(1)).min(1).optional(),
  })
  .loose();

export type ProspecConfig = z.infer<typeof ProspecConfigSchema>;
export type TechStack = z.infer<typeof TechStackSchema>;
