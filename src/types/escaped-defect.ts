import { z } from 'zod';

/**
 * Escaped-defect report schemas — validates escaped-defect-report.json
 *
 * Harvests the `introduced_by` registration convention that has existed since
 * issue #61 without any consumer: a bug-fix change naming the change whose gates
 * let the defect through makes per-gate escaped-defect rate computable, which is
 * the only ground-truth accuracy signal the pipeline has.
 *
 * Deliberately a separate shape from DriftReport: this is a historical aggregate
 * over the change ledger, not a drift check — it grades no current repo state and
 * never participates in `--strict` exit codes.
 */

export const ESCAPED_DEFECT_REPORT_FILENAME = 'escaped-defect-report.json';
export const ESCAPED_DEFECT_REPORT_VERSION = 1;

export const GateAccuracySchema = z.object({
  /** The gate's skill name as written in `quality_log`, e.g. `prospec-review`. */
  gate: z.string().min(1),
  /** Changes this gate recorded a PASS on. */
  passed: z.number().int().positive(),
  /** Of those, how many DISTINCT changes a later bug-fix blamed via `introduced_by`.
   *  Counted per change, not per blame event, so it can never exceed `passed`. */
  escaped: z.number().int().nonnegative(),
  /** escaped / passed, 0..1. Bounded because both sides count changes. */
  escaped_rate: z.number().min(0).max(1),
});

export const EscapedDefectSampleSchema = z.object({
  /** The bug-fix change carrying `introduced_by`. */
  fix_change: z.string().min(1),
  /** The change it blames. */
  introduced_by: z.string().min(1),
  /** Gates that recorded a PASS on the blamed change — the ones that missed it. */
  gates_passed: z.array(z.string().min(1)),
});

export const EscapedDefectReportSchema = z.object({
  version: z.literal(ESCAPED_DEFECT_REPORT_VERSION),
  generated_at: z.string().min(1),
  /** False when `.prospec/archive/` is absent (it is gitignored by design), so a
   *  reader can tell an honestly partial sample from a complete one. */
  archive_available: z.boolean(),
  /** False when NEITHER ledger directory exists — i.e. no records were read at
   *  all. Distinct from `sample_count: 0`, which means records were read and none
   *  registered `introduced_by`. Conflating the two would assert a fact about
   *  records the report never opened. */
  ledger_available: z.boolean(),
  /** Registered `introduced_by` samples found. Zero means "nothing registered
   *  yet" — NOT "no defects escaped"; `gates` is then empty rather than a row of
   *  fabricated 0% rates. */
  sample_count: z.number().int().nonnegative(),
  gates: z.array(GateAccuracySchema),
  samples: z.array(EscapedDefectSampleSchema),
  /** `introduced_by` values naming a change that is in neither ledger — surfaced,
   *  never silently dropped (a typo must not read as "no defect escaped"). */
  unresolved_references: z.array(EscapedDefectSampleSchema),
});

export type GateAccuracy = z.infer<typeof GateAccuracySchema>;
export type EscapedDefectSample = z.infer<typeof EscapedDefectSampleSchema>;
export type EscapedDefectReport = z.infer<typeof EscapedDefectReportSchema>;
