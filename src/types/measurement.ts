import { z } from 'zod';

/**
 * Token measurement schemas — validates measurement-report.json
 *
 * Field semantics are provider-neutral: provider-specific usage fields
 * (e.g. Anthropic cache_read_input_tokens, OpenAI cached_tokens, Gemini
 * cachedContentTokenCount) are mapped into TokenUsage by the benchmark
 * runner's provider adapters. Numbers are comparable only within the
 * same provider.
 */

export const DEFAULT_REPORT_FILENAME = 'measurement-report.json';

export const MEASUREMENT_PROVIDERS = ['anthropic', 'openai', 'google'] as const;
export const ASSEMBLY_STRATEGIES = ['full-dump', 'naive-rag', 'prospec'] as const;
export const MEASUREMENT_BASELINES = ['full-dump', 'naive-rag'] as const;
export const TASK_MEASUREMENT_STATUSES = ['ok', 'skipped', 'failed'] as const;

/** Agent → provider mapping (copilot/codex are measured via their model provider). */
export const AGENT_PROVIDER_MAP = {
  claude: 'anthropic',
  codex: 'openai',
  copilot: 'openai',
  antigravity: 'google',
} as const;

export const TokenUsageSchema = z.object({
  provider: z.enum(MEASUREMENT_PROVIDERS),
  /** Uncached input tokens billed at base rate. */
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  /** Input tokens served from the provider's prompt cache. */
  cache_read: z.number().int().nonnegative(),
  /** Cache write tokens; 0 for providers without write metering. */
  cache_write: z.number().int().nonnegative(),
});

export const PricingSchema = z.object({
  /** USD per million input tokens at base rate. */
  input_usd_per_mtok: z.number().nonnegative(),
  /** USD per million output tokens. */
  output_usd_per_mtok: z.number().nonnegative(),
  /** Cache read cost as a multiple of base input rate (e.g. 0.1). */
  cache_read_multiplier: z.number().nonnegative(),
  /** Cache write cost as a multiple of base input rate; 1 when no surcharge. */
  cache_write_multiplier: z.number().nonnegative(),
});

export const AssemblyMeasurementSchema = z.object({
  strategy: z.enum(ASSEMBLY_STRATEGIES),
  cold: TokenUsageSchema,
  warm: TokenUsageSchema,
});

export const TaskMeasurementSchema = z.object({
  task_id: z.string(),
  status: z.enum(TASK_MEASUREMENT_STATUSES),
  /** Required when status is skipped or failed. */
  reason: z.string().optional(),
  assemblies: z.array(AssemblyMeasurementSchema).default([]),
});

export const BaselineComparisonSchema = z.object({
  baseline: z.enum(MEASUREMENT_BASELINES),
  baseline_input_cold: z.number().int().nonnegative(),
  prospec_input_cold: z.number().int().nonnegative(),
  /** (baseline - prospec) / baseline over cold input tokens, 0..1. */
  input_saving_ratio: z.number(),
  baseline_output: z.number().int().nonnegative(),
  prospec_output: z.number().int().nonnegative(),
  /** Warm effective input cost — both sides warm so the comparison is symmetric. */
  baseline_effective_cost_usd: z.number().nonnegative(),
  prospec_effective_cost_usd: z.number().nonnegative(),
  effective_cost_saving_ratio: z.number(),
});

export const ProviderSummarySchema = z.object({
  measured_tasks: z.number().int().nonnegative(),
  skipped_tasks: z.number().int().nonnegative(),
  failed_tasks: z.number().int().nonnegative(),
  /** Aggregate warm cache hit rate of the prospec assembly, 0..1. */
  prospec_cache_hit_rate: z.number(),
  comparisons: z.array(BaselineComparisonSchema),
});

export const ProviderRunSchema = z.object({
  provider: z.enum(MEASUREMENT_PROVIDERS),
  model: z.string(),
  pricing: PricingSchema,
  aborted: z.boolean(),
  aborted_reason: z.string().optional(),
  spent_usd: z.number().nonnegative(),
  tasks: z.array(TaskMeasurementSchema),
  summary: ProviderSummarySchema,
});

export const MeasurementReportSchema = z.object({
  /** Corpus identifier, e.g. 'sdd-tasks-v1'. */
  corpus: z.string().min(1),
  /** Git commit of the repo snapshot the contexts were assembled from. */
  git_commit: z.string().min(1),
  generated_at: z.string(),
  runs: z.array(ProviderRunSchema).min(1),
});

export type MeasurementProvider = (typeof MEASUREMENT_PROVIDERS)[number];
export type AssemblyStrategy = (typeof ASSEMBLY_STRATEGIES)[number];
export type MeasurementBaseline = (typeof MEASUREMENT_BASELINES)[number];
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type Pricing = z.infer<typeof PricingSchema>;
export type AssemblyMeasurement = z.infer<typeof AssemblyMeasurementSchema>;
export type TaskMeasurement = z.infer<typeof TaskMeasurementSchema>;
export type BaselineComparison = z.infer<typeof BaselineComparisonSchema>;
export type ProviderSummary = z.infer<typeof ProviderSummarySchema>;
export type ProviderRun = z.infer<typeof ProviderRunSchema>;
export type MeasurementReport = z.infer<typeof MeasurementReportSchema>;
