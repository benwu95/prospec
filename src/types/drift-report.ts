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
  // feature-map.yaml governance (skipped when the optional index is absent):
  // REQ-prefix legality (warn) and the feature→module edge (fail).
  'dangling-prefix',
  'feature-modules',
  // MCP README count veracity — a module README line declaring an MCP surface
  // count (e.g. "`src/x.ts` … registers N resources + M tools") that disagrees
  // with the code it names (warn). Scope is deliberately the MCP registration
  // pattern only — the id says `mcp-` so no reader mistakes it for a general
  // README-count gate (root-README badges/inventory counts are NOT covered).
  'mcp-readme-counts',
  // Review provenance — an implemented change that has no recorded review, or
  // whose recorded review predates the current code state (stale), fails (fail).
  // Turns "review must run before verify" from prose into a machine gate.
  // Non-implemented changes are exempt. Backfill is exempt only with
  // backfill-draft.md present (`scale` alone proves nothing) — same draft
  // gating as test-provenance below.
  'review-provenance',
  // Change metadata completeness — a change whose metadata.yaml is missing a
  // required field (name/created_at/status/scale), or that is verified/archived
  // yet records no /prospec-verify S/A grade in quality_log, fails (fail). Backs
  // the /prospec-archive Entry Gate so incomplete metadata cannot enter the
  // permanent record; in-progress changes are exempt from the grade rule.
  'metadata-completeness',
  // Knowledge size budget — an L1 file (index.md or a core convention) over the
  // per-file token budget, or a module README over its per-module token or line
  // budget, warns (warn). Thresholds come from knowledge.token_budget, defaulting
  // to DEFAULT_KNOWLEDGE_TOKEN_BUDGET; L0 agent config is deliberately out of
  // scope. Turns the long-declared-but-unenforced index.md layer budgets into a
  // machine check so the progressive-loading model cannot silently regrow.
  'knowledge-size',
  // Test provenance — an implemented change whose test run was never recorded,
  // whose recorded run predates the current code state (stale), or whose recorded
  // exit code is non-zero, fails (fail). Makes verify's test dimension a machine
  // verdict instead of an agent's self-report; the run itself happens in the
  // flag-gated `check --record-tests` write path, never in the pure check path.
  // Non-implemented changes are exempt. Backfill is exempt only from the
  // missing/stale branches, only with backfill-draft.md present (`scale` alone
  // proves nothing), and a recorded non-zero exit is NEVER exempt.
  'test-provenance',
  // Constitution severity — a Constitution principle whose heading carries no
  // RFC-2119 tag cannot be graded by weight, so it warns (warn). Pairs with the
  // `constitution` report section below: the rule inventory + severities are the
  // machine half of verify's Constitution audit; judging a violation stays LLM work.
  'constitution-severity',
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

/** RFC-2119 severities a Constitution principle heading may carry. */
export const CONSTITUTION_SEVERITIES = ['MUST', 'SHOULD', 'MAY'] as const;

export const ConstitutionRuleEntrySchema = z.object({
  name: z.string().min(1),
  /** null when the heading carries no RFC-2119 tag — never defaulted to a
   *  severity, so verify can see that this rule falls back to judgment grading. */
  severity: z.enum(CONSTITUTION_SEVERITIES).nullable(),
  has_verify_hint: z.boolean(),
  line: z.number().int().positive(),
});

/**
 * The machine-parsed Constitution rule inventory `/prospec-verify` grades against.
 * Verify must account for every entry (its audit is 1:1 with this list) and takes
 * each severity from here rather than re-reading the file, so no rule is skipped
 * and no severity is reassigned. Judging whether the code violates a rule is NOT
 * mechanizable and stays with the agent.
 */
export const ConstitutionInventorySchema = z.object({
  rules: z.array(ConstitutionRuleEntrySchema),
});

export const DriftReportSchema = z.object({
  version: z.literal(DRIFT_REPORT_VERSION),
  generated_at: z.string().min(1),
  structural: z.object({
    checks: z.array(DriftCheckResultSchema).min(1),
    findings: z.array(DriftFindingSchema),
    knowledge_health: KnowledgeHealthSchema.optional(),
    /** Absent when the Constitution is unreadable — the check then skips. */
    constitution: ConstitutionInventorySchema.optional(),
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
export type ConstitutionSeverity = (typeof CONSTITUTION_SEVERITIES)[number];
export type ConstitutionRuleEntry = z.infer<typeof ConstitutionRuleEntrySchema>;
export type ConstitutionInventory = z.infer<typeof ConstitutionInventorySchema>;
export type DriftReport = z.infer<typeof DriftReportSchema>;
