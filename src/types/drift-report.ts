import { z } from 'zod';

/**
 * Drift report schemas — validates prospec-report.json (REQ-TYPES-027)
 *
 * The report is layered: `structural` carries the deterministic check
 * results; `semantic` is permanently `not-checked` — semantic consistency
 * belongs to prospec-review and must never be presented as PASS here.
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
  // Review provenance — an audited change that has no recorded review, or
  // whose recorded review predates the current code state (stale), fails (fail).
  // Turns "review must run before verify" from prose into a machine gate.
  // Audited statuses come from PROVENANCE_AUDITED_STATUSES (implemented AND
  // verified — the window between verify and archive is inside the scope);
  // earlier statuses are exempt and `archived` is unreachable, its bundle having
  // left `.prospec/changes/`. Backfill is exempt only with backfill-draft.md
  // present (`scale` alone proves nothing) — same draft gating as test-provenance
  // below.
  'review-provenance',
  // Change metadata completeness — a change whose metadata.yaml is missing a
  // required field (name/created_at/status/scale), or that is verified/archived
  // yet records no prospec-verify S/A grade in quality_log, fails (fail). Backs
  // the prospec-archive Entry Gate so incomplete metadata cannot enter the
  // permanent record; in-progress changes are exempt from the grade rule.
  'metadata-completeness',
  // Knowledge size budget — an L1 file (index.md or a core convention) over the
  // per-file token budget, or a module README over its per-module token or line
  // budget, warns (warn). Thresholds come from knowledge.token_budget, defaulting
  // to DEFAULT_KNOWLEDGE_TOKEN_BUDGET; L0 agent config is deliberately out of
  // scope. Turns the long-declared-but-unenforced index.md layer budgets into a
  // machine check so the progressive-loading model cannot silently regrow.
  'knowledge-size',
  // Test provenance — an audited change whose test run was never recorded,
  // whose recorded run predates the current code state (stale), or whose recorded
  // exit code is non-zero, fails (fail). Makes verify's test dimension a machine
  // verdict instead of an agent's self-report; the run itself happens in the
  // flag-gated `check --record-tests` write path, never in the pure check path.
  // Reads the same PROVENANCE_AUDITED_STATUSES registry as review-provenance, so
  // the two gates cannot cover different windows. Backfill is exempt only from the
  // missing/stale branches, only with backfill-draft.md present (`scale` alone
  // proves nothing), and a recorded non-zero exit is NEVER exempt.
  'test-provenance',
  // Constitution severity — a Constitution principle whose heading carries no
  // RFC-2119 tag cannot be graded by weight, so it warns (warn). Pairs with the
  // `constitution` report section below: the rule inventory + severities are the
  // machine half of verify's Constitution audit; judging a violation stays LLM work.
  'constitution-severity',
  // Artifact language — a change artifact whose PROSE carries no character in
  // the project's artifact language (fenced code blocks are stripped before the
  // test). Scope is the resolved language scope's nativePaths, lowercase `.md` only
  // (the collector's own glob), minus
  // the gitignored `.prospec/archive/**` copy and whatever the canonical scanner
  // filters (security patterns, build-artifact names, symlinked entries,
  // dotfiles, depth over 10) — a deliberate subset, enumerated in the collector.
  // Every finding is WARN-class: the fail tier for the committed record waits on
  // a shrink-only legacy exemption, because a gate that reds a project's
  // pre-existing artifacts on adoption day gets switched off, not satisfied.
  // Turns the Constitution's [MUST] Language Policy from a purely human audit
  // into a signal at every check. Detection is by Unicode script range keyed off
  // the language NAME, so a language absent from that table — every Latin-script
  // language, English included — makes this SKIP, with a reason naming the real
  // gap (a missing NAME→script mapping, or a declared Latin orthography).
  // FOUR recorded conditions likewise degrade the whole source to a skip rather
  // than reporting clean: a scope root outside the repository lexically or via
  // symlink, a scan that raises, and a file that cannot be read. Beyond those
  // four the sample is whatever the scanner returns, and a root that does not
  // resolve to an existing path is passed over as absent — the scanner's filters,
  // a non-resolving scope shape, and a root whose own PARENT is unreadable are
  // all indistinguishable from genuine absence.
  'artifact-language',
  // Spec counters — an active feature spec whose frontmatter `story_count` /
  // `req_count` disagrees with its own body warns (warn), one finding per
  // disagreeing field. The body counts REQ headings at ANY heading level
  // (`lib/spec-headings`, the same matcher archive writes with) outside
  // `## Deprecated Requirements`, and stories at both `## US-` and `### US-`.
  // Until now these counters had exactly one writer (`archive finalize`) and no
  // reader: a wrong value entered the trust zone silently and stayed. WARN-class
  // rather than fail: the value is normally corrected by the next
  // `archive finalize` — but NOT when that recount refuses to zero a declared
  // counter, in which case this warn persists until a human converges the spec.
  // Skips — never a vacuous pass — when the features directory is absent, holds no
  // spec, or holds none that parses, and a
  // frontmatter that declares neither counter is out of scope rather than a
  // finding (adding it is the writer's job, not the reader's).
  'spec-counters',
  // Delta-spec provenance — an audited change whose delta-spec was never
  // fingerprinted, or whose recorded fingerprint predates the current
  // delta-spec (stale), fails (fail). Deliberately NOT covered by
  // review-provenance: `computeChangeDigest` excludes `.prospec/`, so the one
  // artifact archive copies VERBATIM into the trust zone — the `**Spec:**`
  // landing block — sits outside every existing gate. A review round that
  // corrects a REQ's behavior without folding the correction back into the
  // block leaves both existing provenance checks green while archive reverts
  // the fix. Widening computeChangeDigest instead would red every review
  // baseline on any artifact edit, which is why `.prospec/` is excluded there
  // in the first place; this narrow fingerprint buys the coverage without that
  // cost. Reads the same PROVENANCE_AUDITED_STATUSES registry as the other two
  // gates, and skips — never a vacuous pass — for a scale that has no
  // delta-spec.
  'delta-spec-provenance',
  'unjustified-budget-override',
  // Canonical Doc Drift — a zero-LLM drift check that compares each present
  // canonical/no-authored-content init doc against the content its template
  // renders for this project. Resolves at actual locations and reuses init's
  // rendering path. Warns on divergence; skips if absent.
  'canonical-doc-drift',
  // Delta-spec landing fidelity — a MODIFIED delta-spec entry whose `**Spec:**`
  // landing block would drop an authored trust-zone `WHEN/THEN` bullet WITHOUT
  // declaring it under `**Dropped:**` fails (fail), naming the REQ and the bullet.
  // The `**Spec:**` block replaces the WHOLE REQ body verbatim at archive, so an
  // un-restated, undeclared bullet leaves the trust zone. archive already refuses
  // such a write fail-closed (REQ-CLI-034), but ONLY at the last station, after the
  // feature commit; this surfaces the SAME loss at every `prospec check` (plan,
  // review, verify, CI), deriving the undeclared set from the SAME `lib/landing-fidelity`
  // comparison archive uses — never a second implementation that could drift from it.
  // A declared drop passes (deliberate); a declaration matching no computed drop is a
  // stale declaration (warn), reusing archive's semantics; a non-empty `**Dropped:**`
  // block that parses to zero list items warns so a prose "none" is not mistaken for a
  // verified assertion. ADDED entries, entries with no `**Spec:**` block, and REQs with
  // no resolvable existing trust-zone body are excluded (nothing to overwrite). Unlike
  // the provenance gates this is NOT audit-scoped — it runs on every in-progress
  // change's delta-spec so the loss is caught before archive, and skips only when
  // `.prospec/changes/` is absent.
  'delta-spec-landing-fidelity',
  // REQ id uniqueness — a REQ id defined (as a heading) in more than one place
  // across the Feature Specs fails (fail), naming the id and every definition's
  // source_path and line. REQ ids are module-scoped but authored per feature, so
  // two features can independently number REQ-LIB-001 for different requirements;
  // req-references only proves a cited id is defined SOMEWHERE, never that it is
  // defined exactly once, so a collision entered the trust zone silently. Slices
  // are grouped with their parent feature (a REQ defined once, in main OR a slice,
  // is not a duplicate). Skips — never a vacuous pass — when the features
  // directory is absent or holds no parseable spec.
  'req-id-uniqueness',
  // Language Policy drift — the Constitution's Language Policy `**Description**:`
  // no longer matches the Description `languagePolicyRule` renders for the
  // project's resolved language scope (artifact_language + trust_zone_language,
  // whitespace-normalized), or still carries the pre-path-scoped seed wording,
  // warns (warn) — except the old ENGLISH seed in an English-only project, which
  // has nothing to migrate and passes. Checks the Constitution half of the entry
  // config's "generated from this same path set": `agent sync` regenerates
  // CLAUDE.md/AGENTS.md from the current scope on every run, but nothing ever
  // regenerated the Constitution, so this compares the Constitution against the
  // rule the current scope renders. The entry config itself is NOT read here — an
  // un-synced entry config is `agent sync`'s job, not this check's. WARN-class on
  // purpose: a fail tier would red, on adoption day, every
  // project whose owner reworded the seeded Description — a forced migration this
  // axis promises not to cause; the prospec-upgrade consent flow is the remedy.
  // Rationale/Verify are never compared (owner-authored). Skips — never a vacuous
  // pass — when the Constitution is unreadable, declares no Language Policy
  // principle, or that principle carries no `**Description**:` field (a free-text
  // rule is not judged). The comparison itself is `lib/language-policy`'s
  // `compareLanguagePolicy`, shared with `prospec upgrade`'s stale detector.
  'language-policy-drift',
] as const;

export const DRIFT_CHECK_STATUSES = ['pass', 'warn', 'fail', 'skipped'] as const;

/** Findings only exist for problems — pass/skipped never produce findings. */
export const DRIFT_FINDING_SEVERITIES = ['warn', 'fail'] as const;

/** A knowledge-size finding is either strictly over its budget, or within budget
 *  but past the headroom band (a pressure signal). */
export const KNOWLEDGE_SIZE_FINDING_TIERS = ['over', 'headroom'] as const;
export const KNOWLEDGE_SIZE_FINDING_UNITS = ['tokens', 'lines'] as const;

/**
 * The structured facts behind a `knowledge-size` finding's prose `detail`, so a
 * consumer can group by surface/tier without parsing the sentence. Present ONLY
 * on knowledge-size findings, and optional/additive — an absent value never
 * invalidates a report, so older reports still parse.
 */
export const KnowledgeSizeFindingSchema = z.object({
  /** The load-surface label (KNOWLEDGE_SIZE_RULES.label), e.g. "skill reference". */
  surface: z.string().min(1),
  /** The budget key graded against, e.g. "reference_per_file" / "readme_max_lines". */
  budget_key: z.string().min(1),
  budget: z.number().int().positive(),
  actual: z.number().int().nonnegative(),
  unit: z.enum(KNOWLEDGE_SIZE_FINDING_UNITS),
  tier: z.enum(KNOWLEDGE_SIZE_FINDING_TIERS),
  /** Convergence hint — absent for the headroom (pressure) tier. */
  remedy: z.string().min(1).optional(),
});

export const DriftFindingSchema = z.object({
  check: z.enum(DRIFT_CHECK_IDS),
  severity: z.enum(DRIFT_FINDING_SEVERITIES),
  source_path: z.string().min(1),
  line: z.number().int().positive().optional(),
  detail: z.string().min(1),
  /** knowledge-size findings only — structured facts behind `detail` (additive, optional). */
  knowledge_size: KnowledgeSizeFindingSchema.optional(),
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
  /**
   * Newest git commit across the module's extracted sub-module `.md` siblings —
   * absent when the module has none, never a fabricated timestamp. Additive: the
   * keys above keep their names and meanings. Since REQ-LIB-015 this and
   * `last_readme_commit` are reported for continuity but no longer drive `stale`
   * (see `last_verified` below) — they are NOT the freshness reference anymore.
   */
  last_sub_module_commit: z.string().optional(),
  stale: z.boolean(),
  /**
   * ISO timestamp the module's knowledge was last explicitly confirmed current
   * (`module-map.yaml` `last_verified`); absent when the module declares none.
   * Additive to the frozen keys above — since REQ-LIB-015, this is what `stale`
   * is computed against (source commit vs `last_verified`); the two commit-time
   * keys are reported for continuity but no longer drive the verdict.
   */
  last_verified: z.string().optional(),
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
 * The machine-parsed Constitution rule inventory `prospec-verify` grades against.
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
  /**
   * Repository-input snapshot at report generation; null means unprovable.
   * The report is a display artifact. Verify/archive assess live inputs instead
   * of trusting this stamp. Optional so older reports remain readable.
   */
  change_digest: z.string().nullable().optional(),
  snapshot: z.object({
    fingerprint_version: z.string(),
    scope: z.string(),
    head: z.string().optional(),
    reason: z.string().optional(),
  }).optional(),
  structural: z.object({
    checks: z.array(DriftCheckResultSchema).min(1),
    findings: z.array(DriftFindingSchema),
    knowledge_health: KnowledgeHealthSchema.optional(),
    /** Absent when the Constitution is unreadable — the check then skips. */
    constitution: ConstitutionInventorySchema.optional(),
  }),
  semantic: z.object({
    /** Semantic consistency is prospec-review's job — never graded here. */
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
export type KnowledgeSizeFinding = z.infer<typeof KnowledgeSizeFindingSchema>;
export type DriftCheckResult = z.infer<typeof DriftCheckResultSchema>;
export type KnowledgeHealthModule = z.infer<typeof KnowledgeHealthModuleSchema>;
export type KnowledgeHealth = z.infer<typeof KnowledgeHealthSchema>;
export type ConstitutionSeverity = (typeof CONSTITUTION_SEVERITIES)[number];
export type ConstitutionRuleEntry = z.infer<typeof ConstitutionRuleEntrySchema>;
export type ConstitutionInventory = z.infer<typeof ConstitutionInventorySchema>;
export type DriftReport = z.infer<typeof DriftReportSchema>;

/** Repository content capture; Git cleanliness and HEAD are diagnostic only. */
export interface InputSnapshot {
  digest: string | null;
  clean: boolean | null;
  head?: string;
  reason?: string;
}

/** Read-only adjudication and its observation-bound write precondition. */
export interface CurrentDriftAssessment {
  report: DriftReport;
  snapshot: InputSnapshot;
  recheck: () => boolean;
}
