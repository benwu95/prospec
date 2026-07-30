import { z } from 'zod';
import { DIMENSION_ADJUDICATORS } from './change.js';

/**
 * Station I/O contracts for the cli-first delegation commands (issue #107).
 *
 * Skills supply judgment output (findings, lessons, dimension verdicts) as
 * structured input; the CLI performs the deterministic bookkeeping. These
 * schemas are the boundary: everything they model is LLM judgment, everything
 * downstream of a successful parse is mechanical.
 */

// --- review merge (`prospec review merge`) ---

/** Review finding severities, weakest → strongest; the merge takes the max. */
export const REVIEW_SEVERITIES = ['minor', 'major', 'critical'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

/**
 * One review finding as the reviewer reports it. `id` is the finding's stable
 * identity across rounds — code edits shift line numbers, so whether a finding
 * is "the same one as last round" is the reviewer's call, never inferred from
 * the location string. A finding without an `id` is keyed by (location, lens).
 */
export const ReviewFindingSchema = z.object({
  /** Stable identity across rounds; reuse the prior round's id to update a row. */
  id: z.string().min(1).optional(),
  /** file:line (or file section) the finding anchors to — display, not identity. */
  location: z.string().min(1),
  severity: z.enum(REVIEW_SEVERITIES),
  /** Review lens that surfaced it (e.g. correctness, security, test-quality). */
  lens: z.string().min(1),
  /** Bookkeeping state the reviewer assigns (open / fixed / wontfix / …). */
  status: z.string().min(1).default('open'),
  /** One-line description shown in the review.md table. */
  summary: z.string().min(1),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

/** The `--findings` payload: one review round's findings. */
export const ReviewFindingsInputSchema = z.array(ReviewFindingSchema);

// --- verify record (`prospec verify record`) ---

/**
 * Verify's 5+1 dimension registry — canonical name + who adjudicates it.
 * Machine dimensions are sourced by the CLI from the drift report and
 * test_provenance; judgment dimensions arrive as reviewer input. 3/5 is mixed —
 * the rule inventory is machine-supplied but the graded half is the violation
 * judgment, so it is registered as `judgment` (matching the skill contract).
 */
export const VERIFY_DIMENSIONS = [
  { name: 'task-completion', adjudicator: 'machine' },
  { name: 'delta-spec-compliance', adjudicator: 'judgment' },
  { name: 'constitution', adjudicator: 'judgment' },
  { name: 'knowledge', adjudicator: 'machine' },
  { name: 'tests', adjudicator: 'machine' },
  { name: 'design', adjudicator: 'judgment' },
] as const satisfies ReadonlyArray<{
  name: string;
  adjudicator: (typeof DIMENSION_ADJUDICATORS)[number];
}>;

export type VerifyDimensionName = (typeof VERIFY_DIMENSIONS)[number]['name'];

export const JUDGMENT_DIMENSION_NAMES = VERIFY_DIMENSIONS.filter(
  (d) => d.adjudicator === 'judgment',
).map((d) => d.name);

export const MACHINE_DIMENSION_NAMES = VERIFY_DIMENSIONS.filter(
  (d) => d.adjudicator === 'machine',
).map((d) => d.name);

// --- learn upsert (`prospec learn upsert`) ---

/** Promotion-routing labels the ledger tracks (promotion-format reference). */
export const LESSON_KINDS = ['convention', 'playbook', 'constitution'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

/**
 * One lesson upsert. `key` is the deterministic ledger key the skill assigns —
 * semantic matching ("is this the same lesson?") is the LLM step; given the
 * key, the upsert (frequency increment, source_changes union, scoring) is
 * mechanical.
 */
export const LessonInputSchema = z.object({
  key: z.string().min(1),
  description: z.string().min(1),
  kind: z.enum(LESSON_KINDS),
  /** The change (or session) this occurrence came from; unioned, never duplicated. */
  source_change: z.string().min(1),
  /** Module names looked up from module-map; unioned across occurrences. */
  impact_modules: z.array(z.string().min(1)).default([]),
});
export type LessonInput = z.infer<typeof LessonInputSchema>;

// --- validate (`prospec validate <kind>`) ---

/**
 * Artifact kinds `prospec validate` grades. `slug` and `promote-scaffold` are
 * complete machine verdicts; `backfill-draft` and `design-spec` report the
 * structural subset only (sections, headers, NEEDS-CLARIFICATION count and
 * locations) — ratio-exemption classification and component-set extraction are
 * semantic judgment and stay in the skill.
 */
export const VALIDATE_KINDS = [
  'slug',
  'backfill-draft',
  'promote-scaffold',
  'design-spec',
] as const;
export type ValidateKind = (typeof VALIDATE_KINDS)[number];
