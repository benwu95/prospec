import { z } from 'zod';
import { DIMENSION_ADJUDICATORS, DIMENSION_RESULTS } from './change.js';

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
 * Ceilings on the fields a delegated reviewer or grader RELAYS back to the
 * orchestrating context. `evidence` is deliberately absent from this set: it is
 * written to the artifact (`review.md`, `verify.md`) by the CLI and never
 * returned, so no length of it costs the orchestrator anything — which is why
 * an over-long `summary` is a refusal rather than a style note, and the fix is
 * always "move the prose into `evidence`".
 *
 * `id` and `lens` are in the set for a reason the first version of it missed:
 * both are printed into the round digest the orchestrating agent reads and acts
 * on, and `id` is additionally emitted as a RAW LINE — it anchors the evidence
 * block. Left unbounded and multi-line they let a finding forge digest lines
 * (including a fabricated `repro:` the review loop is told to run) and forge a
 * second block under another finding's anchor, which last-wins parsing then
 * adopts. Every field rendered outside a table cell belongs here.
 *
 * A round's relayed size is this ceiling times the number of findings. Findings
 * are never dropped or merged to fit a budget: the ceiling bounds each
 * finding's prose, never the set of defects reported.
 */
export const RELAYED_FIELD_MAX_CHARS = {
  id: 100,
  location: 300,
  summary: 500,
  repro: 600,
  lens: 100,
} as const;

type RelayedField = keyof typeof RELAYED_FIELD_MAX_CHARS;

/**
 * A relayed string: non-empty, single-line, and refused past its ceiling with
 * the actual length named.
 *
 * Single-line is not cosmetic. A relayed field is rendered either as one table
 * cell — and the cell writer collapses line breaks, so a multi-line value would
 * come back different than it went in — or as a raw line in an artifact and in
 * the round digest, where a line break forges structure: an extra digest line
 * carrying a `repro:` the loop would run, or a second evidence block under
 * another finding's anchor. Refusing it is what makes both surfaces honest.
 */
function relayedString(field: RelayedField, label: string = field) {
  const ceiling = RELAYED_FIELD_MAX_CHARS[field];
  return z
    .string()
    .min(1)
    .max(ceiling, {
      error: (issue) =>
        `${label} is ${String(issue.input).length} characters; the relayed-field ceiling is ${ceiling} — move the prose into \`evidence\`, which has no ceiling`,
    })
    .refine((v) => !/[\r\n]/.test(v), {
      error: `${label} must be a single line — it is rendered as one table cell or one raw line; put anything longer in \`evidence\``,
    });
}

/**
 * One review finding as the reviewer reports it. `id` is the finding's stable
 * identity across rounds — code edits shift line numbers, so whether a finding
 * is "the same one as last round" is the reviewer's call, never inferred from
 * the location string: an id no row carries opens a new row, unless the row it
 * would land on carries no id either (the pre-ids shape, which that id adopts).
 * A finding without an `id` is keyed by (location, lens) against the rows that
 * predate the round, minus any the round names by id.
 *
 * `repro` and `evidence` split what used to be one blob: the command a reader
 * runs to see the defect travels back with the finding, the prose that argued
 * for it lands in `review.md`. Hence the two cross-field rules below — a
 * critical without a `repro` leaves the orchestrator nothing to verify with,
 * and evidence without an `id` has no anchor to be written under.
 */
export const ReviewFindingSchema = z
  .object({
    /** Stable identity across rounds; reuse the prior round's id to update a row.
     *  Relayed AND rendered as a raw line (it anchors the evidence block), so it
     *  carries the same single-line ceiling as every other relayed field. */
    id: relayedString('id').optional(),
    /** file:line (or file section) the finding anchors to — display, not identity. */
    location: relayedString('location'),
    severity: z.enum(REVIEW_SEVERITIES),
    /** Review lens that surfaced it (e.g. correctness, security, test-quality).
     *  Printed into the round digest, so relayed and bounded like the rest. */
    lens: relayedString('lens'),
    /** Bookkeeping state the reviewer assigns (open / fixed / wontfix / …). */
    status: z.string().min(1).default('open'),
    /** One-line description shown in the review.md table. */
    summary: relayedString('summary'),
    /** A re-runnable command that shows the defect — a failing-test invocation,
     *  or a read/grep probe that displays the cited code. Re-run after the fix,
     *  it is also what shows the fix worked. */
    repro: relayedString('repro').optional(),
    /** Full evidence prose, written to review.md's evidence section by the
     *  merge. Uncapped — it never enters a return payload. */
    evidence: z.string().min(1).optional(),
  })
  .check((ctx) => {
    const f = ctx.value;
    if (f.severity === 'critical' && f.repro === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: f,
        path: ['repro'],
        message:
          'a critical finding must carry `repro` — the orchestrating context confirms the defect exists by running that command, not by reading relayed prose',
      });
    }
    if (f.id === undefined && (f.repro !== undefined || f.evidence !== undefined)) {
      ctx.issues.push({
        code: 'custom',
        input: f,
        path: ['id'],
        message:
          'a finding carrying `repro` or `evidence` must carry `id` — the artifact anchors its evidence block by that id, so evidence without one has nowhere to land',
      });
    }
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

/**
 * One judgment dimension's verdict as the grader reports it — the richer of the
 * two input forms `verify record` accepts (the other is the repeatable
 * `--dimension name=result` flag, which carries the verdict alone).
 *
 * Deliberately built on the SAME ceilings as a review finding: both stations
 * delegate to a fresh context and both get the prose back, so a second set of
 * numbers here would be a second payload contract to keep in step.
 */
export const JudgmentDimensionInputSchema = z.object({
  /** Rendered as the block anchor AND its heading — a raw line, so bounded.
   *  Shares the `id` ceiling (it plays the same structural role) but is refused
   *  under its OWN name: a message reading "id is 101 characters" would send the
   *  caller looking for a field its payload does not have. */
  name: relayedString('id', 'name'),
  result: z.enum(DIMENSION_RESULTS),
  /** One-line verdict rationale — relayed, so bounded. */
  summary: relayedString('summary').optional(),
  /** The command that re-establishes this verdict. */
  repro: relayedString('repro').optional(),
  /** Full grading evidence, written to verify.md. Uncapped — never relayed. */
  evidence: z.string().min(1).optional(),
});
export type JudgmentDimensionInput = z.infer<typeof JudgmentDimensionInputSchema>;

/** The `--dimensions` payload: one verify run's judgment verdicts. */
export const JudgmentDimensionsInputSchema = z.array(JudgmentDimensionInputSchema);

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
