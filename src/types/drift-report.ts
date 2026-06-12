import { z } from 'zod';

/**
 * Drift report schemas — validates prospec-report.json (REQ-TYPES-027)
 *
 * The report is layered: `structural` carries the deterministic check
 * results; `semantic` is permanently `not-checked` — semantic consistency
 * belongs to /prospec-review and must never be presented as PASS here.
 *
 * The knowledge_health field shape is a FROZEN contract consumed by
 * downstream features (Knowledge Flywheel, MCP server) — changing it is
 * a breaking change.
 */

export const DRIFT_REPORT_FILENAME = 'prospec-report.json';
export const DRIFT_REPORT_VERSION = 1;

export const DRIFT_CHECK_IDS = [
  'req-references',
  'file-paths',
  'import-direction',
  'knowledge-health',
  'task-completion',
] as const;

export const DRIFT_CHECK_STATUSES = ['pass', 'warn', 'fail', 'skipped'] as const;

/** Findings only exist for problems — pass/skipped never produce findings. */
export const DRIFT_FINDING_SEVERITIES = ['warn', 'fail'] as const;

export const DriftFindingSchema = z.object({
  check: z.enum(DRIFT_CHECK_IDS),
  severity: z.enum(DRIFT_FINDING_SEVERITIES),
  source_path: z.string().min(1),
  line: z.number().int().positive().optional(),
  detail: z.string().min(1),
});

export const DriftCheckResultSchema = z
  .object({
    id: z.enum(DRIFT_CHECK_IDS),
    status: z.enum(DRIFT_CHECK_STATUSES),
    /** Required when status is skipped — honest skip, never a silent pass. */
    reason: z.string().min(1).optional(),
  })
  .refine((c) => c.status !== 'skipped' || c.reason !== undefined, {
    message: 'a skipped check must carry a reason',
  });

export const KnowledgeHealthModuleSchema = z.object({
  name: z.string().min(1),
  /** ISO timestamp of the module source's last git commit; null when unresolvable. */
  last_src_commit: z.string().nullable(),
  /** ISO timestamp of the module README's last git commit; null when the README is missing. */
  last_readme_commit: z.string().nullable(),
  stale: z.boolean(),
});

export const KnowledgeHealthSchema = z.object({
  modules: z.array(KnowledgeHealthModuleSchema),
  coverage: z.object({
    documented: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

export const DriftReportSchema = z.object({
  version: z.literal(DRIFT_REPORT_VERSION),
  generated_at: z.string().min(1),
  structural: z.object({
    checks: z.array(DriftCheckResultSchema).min(1),
    findings: z.array(DriftFindingSchema),
    knowledge_health: KnowledgeHealthSchema.optional(),
  }),
  semantic: z.object({
    /** Semantic consistency is /prospec-review's job — never graded here. */
    status: z.literal('not-checked'),
    note: z.string().optional(),
  }),
  summary: z.object({
    fail_count: z.number().int().nonnegative(),
    warn_count: z.number().int().nonnegative(),
    skipped_count: z.number().int().nonnegative(),
  }),
});

export type DriftCheckId = (typeof DRIFT_CHECK_IDS)[number];
export type DriftCheckStatus = (typeof DRIFT_CHECK_STATUSES)[number];
export type DriftFinding = z.infer<typeof DriftFindingSchema>;
export type DriftCheckResult = z.infer<typeof DriftCheckResultSchema>;
export type KnowledgeHealthModule = z.infer<typeof KnowledgeHealthModuleSchema>;
export type KnowledgeHealth = z.infer<typeof KnowledgeHealthSchema>;
export type DriftReport = z.infer<typeof DriftReportSchema>;
