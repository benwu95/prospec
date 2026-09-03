import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrerequisiteError } from '../types/errors.js';
import {
  isStatusBefore,
  type QualityDimension,
  type VerifyGrade,
  type GateResult,
} from '../types/change.js';
import { DriftReportSchema } from '../types/drift-report.js';
import {
  JUDGMENT_DIMENSION_NAMES,
  MACHINE_DIMENSION_NAMES,
  JudgmentDimensionsInputSchema,
  type JudgmentDimensionInput,
} from '../types/station.js';
import {
  readChangeMetadata,
  writeChangeMetadataDoc,
  appendQualityLogEntry,
} from '../lib/change-metadata.js';
import { atomicWrite, readFileIfExists } from '../lib/fs-utils.js';
import { toInlineCodeSpan, trimTrailingNewlines } from '../lib/markdown-fences.js';
import {
  findUnsafeBlockField,
  isUnsafeRawLine,
  renderEvidenceSection,
  EVIDENCE_MARKER_PREFIX,
  type EvidenceBlock,
} from '../lib/delegated-evidence.js';
import { computeChangeDigest } from '../lib/drift-sources.js';
import {
  computeGrade,
  resultForGrade,
  gradeAdvancesStatus,
  isSelfVerified,
  applySelfVerifiedCap,
} from '../lib/verify-grade.js';
import { todayIso } from '../lib/date-utils.js';
import { assertExecutorLabel, normalizeExecutorLabel, readConfig } from '../lib/config.js';
import { resolveChange } from './change-resolver.js';

export interface VerifyRecordOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The reviewer's verdicts for the judgment dimensions (2/5, 3/5, 6). */
  judgmentDimensions: QualityDimension[];
  /**
   * Path to a JSON array of judgment verdicts that may also carry each
   * dimension's summary, repro and evidence — the richer alternative to the
   * verdict-only `judgmentDimensions`. The two are alternatives: one run has one
   * verdict source.
   */
  dimensionsPath?: string;
  /** Budget-counted WARN detail strings. */
  warnings: string[];
  /** Entry date; defaults to today. */
  date?: string;
}

export interface VerifyRecordResult {
  changeName: string;
  grade: VerifyGrade;
  result: GateResult;
  dimensions: QualityDimension[];
  warnings: string[];
  statusAdvanced: boolean;
  /** Whether the grade itself graduates (S/A) — lets the CLI tell "already
   *  verified" apart from "grade too low" without re-deriving the rule. */
  gradeGraduates: boolean;
  /** Grade-input exclusions applied (scale-aware, e.g. proven backfill). */
  excludedFromGrade: string[];
  /** Repo-relative `verify.md` path, when this run recorded judgment evidence. */
  evidencePath?: string;
  /**
   * Present when at least one grade-input judgment dimension was graded
   * `in-session`: grade S is then mechanically unattainable. Carries the
   * dimension names and the remedy so the CLI can surface both. A separate
   * channel from `warnings` on purpose — the cap prevents the top grade without
   * ever consuming grade A's WARN budget.
   */
  selfVerifiedCap?: { dimensions: string[]; remedy: string };
}

/**
 * Read and validate the richer judgment input. Every refusal here happens before
 * any byte reaches disk: a payload past its ceilings, or prose carrying the
 * evidence-block grammar, must leave both `metadata.yaml` and `verify.md`
 * exactly as they were.
 */
function readJudgmentInput(dimensionsPath: string): JudgmentDimensionInput[] {
  if (!fs.existsSync(dimensionsPath)) {
    throw new PrerequisiteError(
      `Dimensions file not found: ${dimensionsPath}`,
      'Write the judgment verdicts as a JSON array and pass its path via --dimensions',
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(dimensionsPath, 'utf-8'));
  } catch {
    throw new PrerequisiteError(
      `Dimensions file is not valid JSON: ${dimensionsPath}`,
      'Emit the verdicts as a JSON array of {name, result, summary?, repro?, evidence?}',
    );
  }
  const parsed = JudgmentDimensionsInputSchema.safeParse(json);
  if (!parsed.success) {
    // Name the dimension, not its array index: the refusal names the dimension
    // and the failing field (REQ-CLI-029), and "constitution.graded_by" is
    // actionable where "0.graded_by" is not.
    const entries = Array.isArray(json) ? (json as unknown[]) : [];
    const issueLabel = (issuePath: PropertyKey[]): string => {
      const [head, ...rest] = issuePath;
      if (typeof head === 'number') {
        const entry = entries[head];
        const name =
          entry !== null &&
          typeof entry === 'object' &&
          typeof (entry as { name?: unknown }).name === 'string'
            ? (entry as { name: string }).name
            : undefined;
        if (name !== undefined) return [name, ...rest].map(String).join('.');
      }
      return issuePath.map(String).join('.');
    };
    throw new PrerequisiteError(
      `Judgment dimensions failed validation: ${parsed.error.issues
        .map((i) => `${issueLabel(i.path)}: ${i.message}`)
        .join('; ')}`,
      'Each entry needs name, result (PASS|WARN|FAIL|not-applicable|not-adjudicated) and graded_by (fresh-subagent|in-session); executor/spend are optional; summary and repro are bounded, evidence is not',
    );
  }
  // Guard the block AS IT WILL BE RENDERED, not field by field: the anchor, the
  // heading and every raw line of the body all reach verify.md verbatim, so a
  // marker or a line break in any of them re-parses as block structure. `repro`
  // is emitted as an inline code span, which no marker line can match, but it
  // rides inside the body here and is covered along with it.
  for (const d of parsed.data) {
    const block = evidenceBlockFor(d);
    const unsafe = block === undefined ? undefined : findUnsafeBlockField(block);
    if (unsafe !== undefined) {
      throw new PrerequisiteError(
        `Dimension ${d.name} carries \`${EVIDENCE_MARKER_PREFIX}\` (or a line break) in its ${unsafe === 'key' ? 'name' : unsafe === 'heading' ? 'result' : 'summary or evidence'} — that marker is the evidence-block grammar`,
        `Remove or rephrase it in that dimension's prose; nothing was written`,
      );
    }
  }
  return parsed.data;
}

/** The evidence block a judgment verdict carries, or none when it carries no prose. */
function evidenceBlockFor(d: JudgmentDimensionInput): EvidenceBlock | undefined {
  const body = [
    ...(d.summary === undefined ? [] : [`**Summary:** ${d.summary}`]),
    ...(d.repro === undefined ? [] : [`**Repro:** ${toInlineCodeSpan(d.repro)}`]),
    ...(d.evidence === undefined ? [] : ['', d.evidence]),
  ]
    .join('\n')
    .trim();
  if (body === '') return undefined;
  return { key: d.name, heading: `${d.name} — ${d.result}`, body };
}

/** drift-check id → verify dimension name (the machine ledger's fact sources). */
const MACHINE_CHECK_FOR_DIMENSION: Record<string, string> = {
  'task-completion': 'task-completion',
  knowledge: 'knowledge-health',
  tests: 'test-provenance',
};

/**
 * Judgment dimension → the drift check that machine-grades the same subject.
 * A judgment verdict may not be more lenient than its machine counterpart's
 * finding (Gate D1): a machine FAIL/WARN floors the judgment, since a
 * deterministically-detected violation cannot be hand-waved to PASS. The reverse
 * (machine PASS, judgment stricter) is legitimate — a judgment sees what the
 * machine cannot. Only `constitution` has a clean counterpart today.
 */
const JUDGMENT_MACHINE_COUNTERPART: Record<string, string> = {
  constitution: 'constitution-severity',
};

/** Strictness rank; not-applicable/not-adjudicated read as below PASS (ungraded). */
function verdictRank(result: string): number {
  return result === 'FAIL' ? 2 : result === 'WARN' ? 1 : result === 'PASS' ? 0 : -1;
}

/**
 * `prospec verify record` — the S/A/B/C/D decision table executed as code.
 *
 * Machine dimensions (1/5, 4/5, 5/5) are SELF-SOURCED from `prospec-report.json`
 * — the CLI never accepts an LLM's relay of an engine verdict. Judgment
 * dimensions (2/5, 3/5, 6) arrive as input. Scale policy is applied here:
 * a PROVEN backfill (backfill-draft.md present) excludes constitution + tests
 * from the grade inputs (recorded, informational); an unproven `scale:
 * backfill` grades as standard and records the honesty WARN. Grade S/A appends
 * the quality_log entry AND advances `status: verified` in one atomic write.
 */
export async function execute(options: VerifyRecordOptions): Promise<VerifyRecordResult> {
  const cwd = options.cwd ?? process.cwd();
  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change is being verified?',
  );

  // The richer input form, read and validated FIRST: every refusal it carries
  // must precede the metadata write.
  if (options.dimensionsPath !== undefined && options.judgmentDimensions.length > 0) {
    throw new PrerequisiteError(
      'Both --dimension flags and a --dimensions file were supplied',
      'Pass the verdicts one way or the other — one verify run has one verdict source',
    );
  }
  const judgmentInput =
    options.dimensionsPath === undefined ? [] : readJudgmentInput(options.dimensionsPath);
  const judgmentVerdicts: QualityDimension[] =
    options.dimensionsPath === undefined
      ? options.judgmentDimensions
      : judgmentInput.map((d) => ({
          name: d.name,
          result: d.result,
          graded_by: d.graded_by,
          ...(d.executor !== undefined ? { executor: d.executor } : {}),
          ...(d.spend !== undefined ? { spend: d.spend } : {}),
        }));

  // Judgment input must cover exactly the judgment dimensions — no relays of
  // machine dimensions, no missing verdicts.
  const judgmentNames = judgmentVerdicts.map((d) => d.name);
  const expected = [...JUDGMENT_DIMENSION_NAMES].sort();
  const gotSorted = [...judgmentNames].sort();
  if (JSON.stringify(gotSorted) !== JSON.stringify(expected)) {
    throw new PrerequisiteError(
      `Judgment dimensions must be exactly [${expected.join(', ')}] (got: ${judgmentNames.join(', ') || 'none'})`,
      'Pass one --dimension per judgment dimension; a dimension that does not apply is result not-applicable, never omitted. Machine dimensions are read from the report — do not pass them',
    );
  }

  // A judgment verdict MUST declare its grading context — the honesty layer that
  // makes the in-session grade cap enforceable. Refused before any byte reaches
  // disk, the same stance as refusing a stale report. The `--dimensions <file>`
  // form already requires it at the schema layer; this covers the flag form.
  const ungraded = judgmentVerdicts.filter((d) => d.graded_by === undefined).map((d) => d.name);
  if (ungraded.length > 0) {
    throw new PrerequisiteError(
      `Judgment dimension(s) missing graded_by: ${ungraded.join(', ')}`,
      'Declare the grading context: pass --graded-by <fresh-subagent|in-session> (flag form), or set each entry\'s graded_by (--dimensions file). Nothing was written',
    );
  }

  // Executor labels are validated against the project's declared vocabulary — the
  // same refuse-before-write band. Config is read ONLY when a verdict carries an
  // executor, so a run without one never gains a .prospec.yaml dependency.
  // Both forms land the SAME bytes for the same label (`check --record-review` does
  // the same), so the two provenance writers stay byte-comparable. A label that is
  // empty once normalized is refused, mirroring the flag parser: an empty executor is
  // omitted, never written. Normalized copies — the caller's objects are not mutated.
  const normalizedVerdicts: QualityDimension[] = judgmentVerdicts.map((d) =>
    d.executor === undefined ? d : { ...d, executor: normalizeExecutorLabel(d.executor) },
  );
  const blank = normalizedVerdicts.filter((d) => d.executor === '').map((d) => d.name);
  if (blank.length > 0) {
    throw new PrerequisiteError(
      `Judgment dimension(s) carry a blank executor: ${blank.join(', ')}`,
      'An executor label must be non-empty — omit the field instead of leaving it blank. Nothing was written',
    );
  }
  if (normalizedVerdicts.some((d) => d.executor !== undefined)) {
    const config = await readConfig(cwd);
    for (const d of normalizedVerdicts) assertExecutorLabel(config, d.executor);
  }

  // Scale policy FIRST — it shapes both the machine ledger and the warnings.
  // A PROVEN backfill (backfill-draft.md present) has no tasks.md by contract,
  // so 1/5 task-completion is not-applicable (never a vacuous PASS from the
  // repo-wide check, never a FAIL borrowed from a sibling change), and 3/5 +
  // 5/5 are recorded but excluded from the grade inputs.
  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);
  let excludedFromGrade: string[] = [];
  let notApplicableMachine: string[] = [];
  let backfillHonestyWarning: string | undefined;
  if (metadata.scale === 'backfill') {
    const draftPresent = fs.existsSync(
      path.join(cwd, '.prospec', 'changes', changeName, 'backfill-draft.md'),
    );
    if (draftPresent) {
      excludedFromGrade = ['constitution', 'tests'];
      notApplicableMachine = ['task-completion'];
    } else {
      backfillHonestyWarning =
        '`scale: backfill` claimed but no backfill-draft.md — graded as standard';
    }
  }

  // Machine ledger — read from the report file, never from the caller.
  const reportPath = path.join(cwd, 'prospec-report.json');
  if (!fs.existsSync(reportPath)) {
    throw new PrerequisiteError(
      'prospec-report.json not found — machine dimensions cannot be adjudicated',
      'Run `prospec check --record-tests`, then `prospec check --json`, before recording the verify verdict',
    );
  }
  const report = DriftReportSchema.parse(
    JSON.parse(fs.readFileSync(reportPath, 'utf-8')),
  );

  // Freshness guard: a report generated before the current code state (e.g.
  // review fix-loop edits landed after `prospec check --json`) must never feed
  // the machine ledger. When the current digest is not computable (not a git
  // repo) freshness is unadjudicable and the guard skips honestly — the same
  // policy the provenance checks apply.
  const currentDigest = computeChangeDigest(cwd);
  if (currentDigest !== null && report.change_digest !== currentDigest) {
    throw new PrerequisiteError(
      'prospec-report.json does not match the current code state — the code changed after the report was generated (or the report carries no change digest)',
      'Re-run `prospec check --record-tests` then `prospec check --json` so the machine dimensions grade the current code, and record the verify verdict again',
    );
  }

  // Gate A — the review-provenance Entry Gate, enforced here so the verify skill
  // no longer checks it by hand: a non-backfill change whose report review-provenance
  // FAILs (review absent or stale) is refused before any write. A proven backfill's
  // check is `skipped`, so this never fires for it; a `pass` or absent check records.
  if (report.structural.checks.find((c) => c.id === 'review-provenance')?.status === 'fail') {
    throw new PrerequisiteError(
      'review-provenance FAILs — this change has no current review baseline',
      'Run `prospec-review`, then `prospec check --record-review`, before recording the verify verdict',
    );
  }

  const machineSkipReasons = new Map<string, string>();
  const machineDimensions: QualityDimension[] = MACHINE_DIMENSION_NAMES.map((name) => {
    if (notApplicableMachine.includes(name)) {
      return { name, result: 'not-applicable' as const, adjudicator: 'machine' as const };
    }
    const checkId = MACHINE_CHECK_FOR_DIMENSION[name]!;
    const check = report.structural.checks.find((c) => c.id === checkId);
    if (!check) {
      // A check id absent from the report (older engine) is an honest gap.
      return { name, result: 'not-adjudicated' as const, adjudicator: 'machine' as const };
    }
    if (check.reason !== undefined) {
      machineSkipReasons.set(name, check.reason);
    }
    const result =
      check.status === 'pass'
        ? ('PASS' as const)
        : check.status === 'warn'
          ? ('WARN' as const)
          : check.status === 'fail'
            ? ('FAIL' as const)
            : ('not-adjudicated' as const);
    return { name, result, adjudicator: 'machine' as const };
  });

  // Gate D1 — a judgment dimension may not be graded more leniently than its
  // machine counterpart's finding. A report FAIL/WARN floors the judgment; a
  // report pass/skipped/absent sets no floor (a judgment may still be stricter).
  for (const d of normalizedVerdicts) {
    const checkId = JUDGMENT_MACHINE_COUNTERPART[d.name];
    if (checkId === undefined) continue;
    const check = report.structural.checks.find((c) => c.id === checkId);
    if (!check || (check.status !== 'fail' && check.status !== 'warn')) continue;
    const floor = check.status === 'fail' ? 2 : 1;
    if (verdictRank(d.result) < floor) {
      throw new PrerequisiteError(
        `judgment dimension "${d.name}" is declared "${d.result}" but the report's ${checkId} check reports "${check.status}" — a judgment cannot be more lenient than a machine finding`,
        `Grade "${d.name}" at least ${check.status === 'fail' ? 'FAIL' : 'WARN'}, or fix the violation and regenerate the report before recording`,
      );
    }
  }

  const dimensions: QualityDimension[] = [
    ...machineDimensions,
    ...normalizedVerdicts.map((d) => ({ ...d, adjudicator: 'judgment' as const })),
  ];

  // A not-adjudicated machine dimension is itself a WARN — spell its warning
  // string out so the recorded warnings are the complete budget ledger (there
  // is no exemption class to park it in post-#107). A dimension EXCLUDED from
  // the grade inputs is informational, so its warning must not consume the
  // budget either.
  // The recorded warnings ARE the ledger — embed the check's own skip reason
  // instead of pointing at a report that is overwritten by the next check run.
  const notAdjudicatedWarnings = machineDimensions
    .filter((d) => d.result === 'not-adjudicated' && !excludedFromGrade.includes(d.name))
    .map((d) => {
      const reason = machineSkipReasons.get(d.name);
      return `${d.name}: not-adjudicated — its check could not run (${reason ?? 'no skip reason recorded in the report'})`;
    });

  const warnings = [
    ...options.warnings,
    ...notAdjudicatedWarnings,
    ...(backfillHonestyWarning ? [backfillHonestyWarning] : []),
  ];

  const gradeInputs = dimensions.filter((d) => !excludedFromGrade.includes(d.name));
  // The cap scans the FULL judgment set, not only the grade inputs: a scale
  // policy (proven backfill) excludes a dimension's VERDICT from the grade, but
  // its grading context is still a self-verification — REQ-CLI-029 caps on ANY
  // judgment dimension graded in-session.
  const judgmentDimensions = dimensions.filter((d) => d.adjudicator === 'judgment');
  const grade = applySelfVerifiedCap(computeGrade(gradeInputs, warnings), judgmentDimensions);
  const gateResult = resultForGrade(grade);
  // A separate signal from the WARN ledger: naming the in-session dimensions and
  // the remedy, surfaced whenever a judgment dimension was self-verified — which
  // is exactly when the cap put S out of reach.
  const inSessionDimensions = judgmentDimensions
    .filter((d) => d.graded_by === 'in-session')
    .map((d) => d.name);
  const selfVerifiedCap = isSelfVerified(judgmentDimensions)
    ? {
        dimensions: inSessionDimensions,
        remedy:
          'Grade S is unattainable while a judgment dimension is graded in-session. Re-grade it in fresh context, then re-run `prospec verify record`.',
      }
    : undefined;
  const date = options.date ?? todayIso();

  appendQualityLogEntry(doc, {
    skill: 'prospec-verify',
    date,
    result: gateResult,
    warnings,
    grade,
    dimensions,
  });

  const blocks = judgmentInput.flatMap((d) => {
    const block = evidenceBlockFor(d);
    return block === undefined ? [] : [block];
  });

  // The heading this run would write is machine-derived (a parsed ISO date and a
  // grade from a closed enum), so this is a backstop rather than an input gate —
  // but it belongs BEFORE the metadata write like every other refusal: a run that
  // cannot produce its artifact must not leave a `quality_log` entry behind.
  const evidenceHeading = `## ${date} — grade ${grade}`;
  if (blocks.length > 0 && isUnsafeRawLine(evidenceHeading)) {
    throw new PrerequisiteError(
      `The verify.md section heading "${evidenceHeading}" is not a single marker-free line`,
      'Pass a plain ISO date via --date; nothing was written',
    );
  }

  let statusAdvanced = false;
  if (gradeAdvancesStatus(grade) && isStatusBefore(metadata.status, 'verified')) {
    doc.set('status', 'verified');
    statusAdvanced = true;
  }

  // metadata.yaml FIRST, verify.md second. `metadata.yaml` is the authoritative
  // record — the grade, the dimensions, the status advance — and `verify.md` is
  // the evidence beside it. Writing the artifact first meant an I/O failure on
  // the authoritative write left a dated, graded evidence section for a run that
  // has no `quality_log` entry at all; this order can only ever leave a recorded
  // run whose evidence is missing, which reads as what it is.
  await writeChangeMetadataDoc(metadataPath, doc, changeName);

  // The judgment evidence goes to `verify.md`, never to `metadata.yaml`: the
  // metadata records the verdict, the artifact records why. Appended — a
  // re-verify after fixes must not erase the reasoning that graded it lower,
  // the same append semantics `quality_log` already has.
  //
  // Each run's section is opened by the shared section MARKER, not by its
  // `## {date} — grade {G}` heading alone: grader evidence legitimately quotes a
  // previous run, and a heading-delimited section let that quotation forge a
  // phantom dated grade entry in an audit artifact. The marker cannot be forged
  // because `findUnsafeBlockField` refuses it in every field that reaches a raw
  // line — which is also what makes the shared reference's claim that BOTH
  // artifacts carry this grammar true rather than aspirational.
  let evidencePath: string | undefined;
  if (blocks.length > 0) {
    const verifyPath = path.join(cwd, '.prospec', 'changes', changeName, 'verify.md');
    const existing = await readFileIfExists(verifyPath);
    const section = renderEvidenceSection(blocks, evidenceHeading);
    const head = existing.trim() === '' ? `# Verify Evidence: ${changeName}\n` : existing;
    await atomicWrite(verifyPath, `${trimTrailingNewlines(head)}\n\n${section}\n`);
    evidencePath = path.join('.prospec', 'changes', changeName, 'verify.md');
  }

  return {
    changeName,
    grade,
    result: gateResult,
    dimensions,
    warnings,
    statusAdvanced,
    gradeGraduates: gradeAdvancesStatus(grade),
    excludedFromGrade,
    evidencePath,
    ...(selfVerifiedCap !== undefined ? { selfVerifiedCap } : {}),
  };
}
