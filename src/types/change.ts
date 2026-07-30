import { z } from 'zod';

/**
 * ChangeMetadata schema — validates metadata.yaml in change directories
 *
 * State transitions: story → plan → tasks → implemented → verified → archived
 * (canonical source: prospec/ai-knowledge/_status-lifecycle.md)
 */

export const CHANGE_STATUSES = ['story', 'plan', 'tasks', 'implemented', 'verified', 'archived'] as const;

/** Process weight per change (BL-004). Absent on existing metadata means `standard`.
 *  `backfill` is a promotion-time scale set only by `/prospec-promote-backfill` (documents
 *  existing brownfield code); verify/archive branch on it like `quick`. */
export const CHANGE_SCALES = ['quick', 'standard', 'full', 'backfill'] as const;

/** Severity vocabulary shared with Entry/Exit gates and verify (no fourth state). */
export const GATE_RESULTS = ['PASS', 'WARN', 'FAIL'] as const;

/** /prospec-verify quality grade vocabulary (S/A graduate; B/C/D do not). */
export const VERIFY_GRADES = ['S', 'A', 'B', 'C', 'D'] as const;

/** A single verify dimension's outcome. Wider than `GATE_RESULTS`: a dimension
 *  that does not apply to this change's scale is reported `not-applicable`, which
 *  `/prospec-verify` mandates over PASS (a quick change has no delta-spec to
 *  compare, a backfill change has no tasks.md — an unchecked dimension must not
 *  read as a passed one). `not-adjudicated` is the distinct case where a dimension
 *  DOES apply but its machine adjudicator was unavailable (the drift engine could
 *  not run): claiming PASS would fake a verdict, and `not-applicable` would claim
 *  the dimension was moot. The gate `result` stays the three-state. */
export const DIMENSION_RESULTS = [...GATE_RESULTS, 'not-applicable', 'not-adjudicated'] as const;

/** Who decided a verify dimension: the deterministic drift engine, or the agent.
 *  Recorded per dimension so a later escaped-defect analysis can tell a machine
 *  verdict from a judgment call instead of guessing. */
export const DIMENSION_ADJUDICATORS = ['machine', 'judgment'] as const;

/** One /prospec-verify dimension outcome, for machine-aggregatable quality trends. */
export const QualityDimensionSchema = z.looseObject({
  name: z.string(),
  result: z.enum(DIMENSION_RESULTS),
  /** Optional keeps every pre-existing entry valid. */
  adjudicator: z.enum(DIMENSION_ADJUDICATORS).optional(),
});

/** Field shape shared by the strict (build) and loose (read) entry views below. */
const QualityLogEntryShape = {
  skill: z.string(),
  date: z.string(), // ISO 8601 date
  result: z.enum(GATE_RESULTS),
  // `.default([])` only ever ADDS this key (the metadata-format reference
  // requires it present, `[]` when empty) — it never drops caller data.
  warnings: z.array(z.string()).default([]),
  /** /prospec-verify grade; `result` stays the gate three-state, never a grade. */
  grade: z.enum(VERIFY_GRADES).optional(),
  /** /prospec-verify 5+1 dimension results. */
  dimensions: z.array(QualityDimensionSchema).optional(),
  /** /prospec-review criticals surfaced this round. */
  criticals_found: z.number().int().nonnegative().optional(),
  /** /prospec-review criticals auto-fixed this round. */
  criticals_fixed: z.number().int().nonnegative().optional(),
  /** /prospec-review majors surfaced this round (advisory, never counted in grade). */
  majors: z.number().int().nonnegative().optional(),
} as const;

/** Strict view — no index signature, so tsc's excess-property check still catches
 *  a typo'd key when a station BUILDS an entry (`prospec change log` / `verify record`
 *  construct entries from CLI input; a misspelled optional key must not silently
 *  become an unmodeled extra). Mirrors the NewChangeMetadataSchema precedent. */
export const NewQualityLogEntrySchema = z.object(QualityLogEntryShape);

/** One Entry/Exit gate record, appended per skill stage for cross-stage traceability.
 *  `result` is the gate three-state (PASS/WARN/FAIL). The structured fields below are
 *  optional and machine-aggregatable (BL — issue #61): verify writes `grade`+`dimensions`,
 *  review writes the critical/major counts. Absent keeps every existing entry valid.
 *  Loose: reads never strip unmodeled keys (see ChangeMetadataSchema). */
export const QualityLogEntrySchema = NewQualityLogEntrySchema.loose();

/** Machine-written review baseline (BL-066). `digest` fingerprints the reviewed
 *  code state; `date` is the ISO 8601 record date. */
export const ReviewProvenanceSchema = z.looseObject({
  digest: z.string(),
  date: z.string(), // ISO 8601 date
});

/** Machine-written test baseline (written by `prospec check --record-tests`).
 *  `command` is the test command that ran, `exit_code` its result (kept even when
 *  non-zero — a failing suite is the fact the check must see), `digest` fingerprints
 *  the code state it ran against, `date` is the ISO 8601 record date. */
export const TestProvenanceSchema = z.looseObject({
  command: z.string(),
  exit_code: z.number().int(),
  digest: z.string(),
  date: z.string(), // ISO 8601 date
});

/** A module name as written to `related_modules` — the plain name, matching a
 *  `module-map.yaml` entry. Rejects the markdown emphasis and stray whitespace a
 *  producer picks up when it forwards a rendered table cell (`**types**`) verbatim:
 *  downstream module derivation resolves this value as a directory, so decoration
 *  silently targets a module that does not exist. Deliberately a rejection rule, not
 *  a whitelist pattern — other projects name modules in ways a regex would misjudge. */
export const BareModuleNameSchema = z
  .string()
  .min(1, 'must not be empty')
  .refine((v) => v === v.trim(), 'must not have leading or trailing whitespace')
  // `_` is NOT rejected — snake_case module names (`user_profile`) are legitimate,
  // and underscore emphasis only reads as such when it wraps the whole token.
  .refine((v) => !/[*`~]/.test(v), 'must be a bare module name, without markdown emphasis');

/** Field shape shared by the strict (build) and loose (read) views below. */
const ChangeMetadataShape = {
  name: z.string(),
  created_at: z.string(), // ISO 8601
  status: z.enum(CHANGE_STATUSES),
  // Written by new-story after user-confirmed complexity assessment (BL-004).
  // Optional keeps existing metadata valid; absent reads as `standard`.
  scale: z.enum(CHANGE_SCALES).optional(),
  related_modules: z.array(BareModuleNameSchema).optional(),
  description: z.string().optional(),
  // Entry/Exit gate trail (BL-003).
  quality_log: z.array(QualityLogEntrySchema).optional(),
  // Machine-written review baseline (written by `prospec check --record-review`
  // when `/prospec-review` completes). `digest` is a content fingerprint of the
  // reviewed code state; the review-provenance drift check recomputes it and
  // flags the change stale when it no longer matches. Optional keeps existing
  // metadata valid and marks a change that has not been reviewed yet.
  review_provenance: ReviewProvenanceSchema.optional(),
  // Machine-written test baseline (written by `prospec check --record-tests` when
  // `/prospec-verify` records the run). The test-provenance drift check recomputes
  // the digest and flags the change stale when it no longer matches, or failed when
  // `exit_code` is non-zero. Deliberately NOT part of the metadata-completeness
  // required-field floor: adding it there would retroactively fail every change
  // archived before this field existed.
  test_provenance: TestProvenanceSchema.optional(),
  // Escaped-defect registration (issue #61): on a bug-fix change, names the change
  // that missed the defect (its change-name string), so per-gate escaped-defect rate
  // can be tracked. Optional keeps existing metadata valid; a convention + example
  // live in `_status-lifecycle.md`. No referential-integrity check by design.
  introduced_by: z.string().optional(),
} as const;

/** Strict view — no index signature, so tsc's excess-property check still
 *  catches a typo'd key in an object literal. Use it when BUILDING metadata;
 *  the loose `ChangeMetadataSchema` below is for validating what was READ. */
export const NewChangeMetadataSchema = z.object(ChangeMetadataShape);

/**
 * The change `metadata.yaml` contract, enforced at read AND write by
 * `lib/change-metadata.ts` — the single entry point every SDD station goes
 * through. (`archive.service` and `lib/drift-sources.ts` read leniently on
 * purpose: both scan every change directory and must report a malformed
 * record rather than throw on it.)
 *
 * Loose at every level (here and in the nested entry schemas), and that is
 * load-bearing rather than incidental: metadata legitimately carries keys this
 * schema does not model (`archived_at`, historical `quality_grade`), and
 * validation is a gate, never a rewrite. Stripping them would make the parsed
 * value diverge from the file, so a caller doing read → modify → write would
 * silently drop them. The one deliberate divergence is `warnings`, whose
 * `.default([])` only ever ADDS the key the format reference requires.
 */
export const ChangeMetadataSchema = NewChangeMetadataSchema.loose();

export type ChangeMetadata = z.infer<typeof ChangeMetadataSchema>;
/** The shape a station constructs from scratch — see NewChangeMetadataSchema. */
export type NewChangeMetadata = z.infer<typeof NewChangeMetadataSchema>;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

/**
 * True when `current` precedes `target` in the lifecycle order. Used to keep
 * status advances forward-only — re-running a planning command on an already
 * advanced change must not silently regress its status.
 */
export function isStatusBefore(
  current: string | undefined,
  target: ChangeStatus,
): boolean {
  const currentIndex =
    current === undefined ? -1 : CHANGE_STATUSES.indexOf(current as ChangeStatus);
  return currentIndex < CHANGE_STATUSES.indexOf(target);
}
export type ChangeScale = (typeof CHANGE_SCALES)[number];
export type QualityLogEntry = z.infer<typeof QualityLogEntrySchema>;
/** The shape a station constructs from scratch — see NewQualityLogEntrySchema. */
export type NewQualityLogEntry = z.infer<typeof NewQualityLogEntrySchema>;
export type QualityDimension = z.infer<typeof QualityDimensionSchema>;
export type VerifyGrade = (typeof VERIFY_GRADES)[number];
export type ReviewProvenance = z.infer<typeof ReviewProvenanceSchema>;
export type TestProvenance = z.infer<typeof TestProvenanceSchema>;
export type DimensionAdjudicator = (typeof DIMENSION_ADJUDICATORS)[number];
export type GateResult = (typeof GATE_RESULTS)[number];
