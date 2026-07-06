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
}).optional();

export const KNOWLEDGE_FILE_TYPES = [
  'readme', 'endpoints', 'components', 'screens',
] as const;

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

// Field names align with the index.md progressive-loading layers (L1/L2), the
// single taxonomy the knowledge-size drift check enforces:
//   l1_per_file     — max tokens for each L1 file (index.md and each core convention)
//   l2_per_module   — max tokens for each L2 module README
//   readme_max_lines — max lines for each module README
const TokenBudgetSchema = z.object({
  l1_per_file: z.number().optional(),
  l2_per_module: z.number().optional(),
  readme_max_lines: z.number().optional(),
}).optional();

export type TokenBudget = z.infer<typeof TokenBudgetSchema>;

/**
 * Single source of truth for the knowledge-size drift check thresholds and the
 * numbers declared in index.md's progressive-loading table. `knowledge.token_budget`
 * in .prospec.yaml overrides individual fields; anything unset falls back here.
 */
export const DEFAULT_KNOWLEDGE_TOKEN_BUDGET = {
  l1_per_file: 1500,
  l2_per_module: 400,
  readme_max_lines: 100,
} as const;

const KnowledgeSchema = z.object({
  base_path: z.string().optional(),
  additional_core_conventions: z.array(z.string()).optional(),
  files: z.array(z.enum(KNOWLEDGE_FILE_TYPES)).optional(),
  strategy: z.enum(KNOWLEDGE_STRATEGIES).optional(),
  token_budget: TokenBudgetSchema,
}).optional();

export const DEFAULT_BASE_DIR = 'prospec';

/** Artifact language assumed when `.prospec.yaml` has no `artifact_language`. */
export const DEFAULT_ARTIFACT_LANGUAGE = 'English';

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
      version: z.string().optional(),
    }),
    tech_stack: TechStackSchema,
    paths: z.object({
      base_dir: z.string().optional(),
    }).catchall(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    agents: z.array(z.enum(VALID_AGENTS)).optional(),
    knowledge: KnowledgeSchema,
    artifact_language: z.string().optional(),
    skill_triggers: z.record(z.string(), z.array(z.string())).optional(),
  })
  .passthrough();

export type ProspecConfig = z.infer<typeof ProspecConfigSchema>;
export type TechStack = z.infer<typeof TechStackSchema>;
