import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { PrerequisiteError } from '../types/errors.js';
import {
  isStatusBefore,
  type QualityDimension,
  type VerifyGrade,
  type GateResult,
} from '../types/change.js';
import {
  JUDGMENT_DIMENSION_NAMES,
  MACHINE_DIMENSION_NAMES,
  JudgmentDimensionsInputSchema,
  VerificationContextSchema,
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
  containsEvidenceMarker,
  EVIDENCE_MARKER_PREFIX,
  type EvidenceBlock,
} from '../lib/delegated-evidence.js';
import { assessCurrentDrift } from '../lib/drift-assessment.js';
import { adjudicateChangeCheck, mapCheckStatusToVerdict } from '../lib/change-gate.js';
import { auditConstitution } from '../lib/constitution-audit.js';
import type { DriftCheckId } from '../types/drift-report.js';
import {
  computeGrade,
  resultForGrade,
  gradeAdvancesStatus,
  isSelfVerified,
  applySelfVerifiedCap,
} from '../lib/verify-grade.js';
import { todayIso } from '../lib/date-utils.js';
import { resolveChange } from './change-resolver.js';
import { assessVerificationContext } from '../lib/verification-context.js';
import {
  assessRequirementCompliance,
  type RequirementAssessmentResult,
} from '../lib/requirement-assessment.js';
import { iterateDeltaEntries } from '../lib/landing-fidelity.js';
import { renderMarkdownTable } from '../lib/markdown-table.js';

export interface VerifyRecordOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The reviewer's verdicts for the judgment dimensions (2/5, 3/5, 6). */
  judgmentDimensions?: QualityDimension[];
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
  /** Summary of requirement coverage (e.g. '18/18'), if applicable. */
  coverageSummary?: string;
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
    if (d.constitution_rules) {
      for (const cr of d.constitution_rules) {
        if (cr.statement && containsEvidenceMarker(cr.statement)) {
          throw new PrerequisiteError(
            `Dimension ${d.name} constitution_rule "${cr.name}" statement carries \`${EVIDENCE_MARKER_PREFIX}\` — that marker is the evidence-block grammar`,
            `Remove or rephrase it in that rule's statement; nothing was written`,
          );
        }
      }
    }
    if (d.items) {
      for (const item of d.items) {
        if (item.evidence && containsEvidenceMarker(item.evidence)) {
          throw new PrerequisiteError(
            `Dimension ${d.name} item "${item.req_id}" evidence carries \`${EVIDENCE_MARKER_PREFIX}\` — that marker is the evidence-block grammar`,
            `Remove or rephrase it in that item's evidence; nothing was written`,
          );
        }
        if (item.repro && containsEvidenceMarker(item.repro)) {
          throw new PrerequisiteError(
            `Dimension ${d.name} item "${item.req_id}" repro carries \`${EVIDENCE_MARKER_PREFIX}\` — that marker is the evidence-block grammar`,
            `Remove or rephrase it in that item's repro; nothing was written`,
          );
        }
      }
    }
    if (d.scenario_findings) {
      for (const finding of d.scenario_findings) {
        if (containsEvidenceMarker(finding.summary)) {
          throw new PrerequisiteError(
            `Dimension ${d.name} scenario_finding "${finding.scenario_id}" summary carries \`${EVIDENCE_MARKER_PREFIX}\` — that marker is the evidence-block grammar`,
            `Remove or rephrase it in that finding's summary; nothing was written`,
          );
        }
        if (containsEvidenceMarker(finding.evidence)) {
          throw new PrerequisiteError(
            `Dimension ${d.name} scenario_finding "${finding.scenario_id}" evidence carries \`${EVIDENCE_MARKER_PREFIX}\` — that marker is the evidence-block grammar`,
            `Remove or rephrase it in that finding's evidence; nothing was written`,
          );
        }
      }
    }
  }
  return parsed.data;
}

/** The evidence block a judgment verdict carries, or none when it carries no prose. */
function evidenceBlockFor(
  d: JudgmentDimensionInput,
  reqAssessment?: RequirementAssessmentResult,
): EvidenceBlock | undefined {
  const bodyParts: string[] = [];
  if (d.name === 'delta-spec-compliance' && d.context_id) {
    bodyParts.push(`**Context ID:** \`${d.context_id}\``);
  }
  if (d.summary !== undefined && d.summary.trim() !== '') {
    bodyParts.push(`**Summary:** ${d.summary}`);
  }
  if (d.repro !== undefined && d.repro.trim() !== '') {
    bodyParts.push(`**Repro:** ${toInlineCodeSpan(d.repro)}`);
  }
  if (d.evidence !== undefined && d.evidence.trim() !== '') {
    bodyParts.push(d.evidence);
  }
  if (d.name === 'delta-spec-compliance' && reqAssessment && reqAssessment.items.length > 0) {
    const tableRows = reqAssessment.items.map((item) => [
      item.req_id,
      item.result,
      item.evidence_kind,
      item.evidence ?? '',
      item.repro ? toInlineCodeSpan(item.repro) : '',
    ]);
    const table = renderMarkdownTable(
      ['REQ ID', 'Result', 'Kind', 'Evidence', 'Repro'],
      tableRows,
    );
    bodyParts.push(`#### Requirements Compliance\n\n${table}`);
  }
  if (d.name === 'delta-spec-compliance' && reqAssessment?.gapWarnings.length) {
    bodyParts.push(`#### Verification Limitations\n\n${reqAssessment.gapWarnings.join('\n\n')}`);
  }
  if (d.name === 'delta-spec-compliance' && d.scenario_findings && d.scenario_findings.length > 0) {
    const findingRows = d.scenario_findings.map((f) => [
      f.scenario_id,
      f.affected_req_ids.join(', '),
      f.spec_location,
      f.result,
      f.summary,
      f.evidence,
    ]);
    const findingTable = renderMarkdownTable(
      ['Scenario ID', 'Affected REQs', 'Spec Location', 'Result', 'Summary', 'Evidence'],
      findingRows,
    );
    bodyParts.push(`#### Scenario Deviation Findings\n\n${findingTable}`);
  }

  const body = bodyParts.join('\n\n').trim();
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
  if (options.dimensionsPath !== undefined && options.judgmentDimensions !== undefined && options.judgmentDimensions.length > 0) {
    throw new PrerequisiteError(
      'Both --dimension flags and a --dimensions file were supplied',
      'Pass the verdicts one way or the other — one verify run has one verdict source',
    );
  }
  const judgmentInput =
    options.dimensionsPath === undefined ? [] : readJudgmentInput(options.dimensionsPath);
  const judgmentVerdicts: QualityDimension[] =
    options.dimensionsPath === undefined
      ? (options.judgmentDimensions ?? [])
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

  // Scale policy FIRST — it shapes both the machine ledger and the warnings.
  // A PROVEN backfill (backfill-draft.md present) has no tasks.md by contract,
  // so 1/5 task-completion is not-applicable (never a vacuous PASS from the
  // repo-wide check, never a FAIL borrowed from a sibling change), and 3/5 +
  // 5/5 are recorded but excluded from the grade inputs.
  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const metadataInput = fs.readFileSync(metadataPath, 'utf8');
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

  const deltaVerdict = judgmentVerdicts.find((d) => d.name === 'delta-spec-compliance');
  const deltaInput = judgmentInput.find((d) => d.name === 'delta-spec-compliance');
  const suppliedDeltaVerdict = deltaInput?.result ?? deltaVerdict?.result;

  let liveContextAssessment: ReturnType<typeof assessVerificationContext> | undefined;
  let contextStatus: 'valid' | 'missing' = 'missing';
  let savedContextRecheck: (() => boolean) | undefined;

  if (deltaInput?.context_id !== undefined) {
    const contextPath = path.join(cwd, '.prospec', 'changes', changeName, 'verify-context.json');
    if (!fs.existsSync(contextPath)) {
      throw new PrerequisiteError(
        `Saved verification context not found for change "${changeName}" at ${contextPath}`,
        `Run \`prospec verify context --change ${changeName}\` before grading`,
      );
    }
    let savedContextJson: { context_id?: string };
    const savedContextBytes = fs.readFileSync(contextPath);
    try {
      savedContextJson = JSON.parse(savedContextBytes.toString('utf8'));
    } catch {
      throw new PrerequisiteError(
        `Saved verification context at ${contextPath} is not valid JSON`,
        `Re-run \`prospec verify context --change ${changeName}\``,
      );
    }
    if (savedContextJson?.context_id !== deltaInput.context_id) {
      throw new PrerequisiteError(
        `Saved verification context ID mismatch: expected "${deltaInput.context_id}", found "${savedContextJson?.context_id}" in ${contextPath}`,
        'Re-run verify context and re-grade with the matching context_id',
      );
    }

    liveContextAssessment = assessVerificationContext(cwd, changeName);
    if (liveContextAssessment.context.context_id !== deltaInput.context_id) {
      throw new PrerequisiteError(
        `Verification context is stale or changed since grading: graded context_id "${deltaInput.context_id}" does not match current repository/spec context_id "${liveContextAssessment.context.context_id}"`,
        'Inputs (spec, proposal, baseline, tests, or code) changed; re-run verify context and re-grade',
      );
    }
    if (!VerificationContextSchema.safeParse(savedContextJson).success ||
        !isDeepStrictEqual(savedContextJson, liveContextAssessment.context)) {
      throw new PrerequisiteError('Saved verification context integrity mismatch — nothing was written',
        'Re-run verify context and re-grade against its complete, unchanged projection');
    }
    savedContextRecheck = () => {
      try { return savedContextBytes.equals(fs.readFileSync(contextPath)); } catch { return false; }
    };
    if (!liveContextAssessment.recheck()) {
      throw new PrerequisiteError(
        'verification inputs changed or are unprovable — nothing was written',
        'Re-run verify context against stable current inputs',
      );
    }
    contextStatus = 'valid';
  }

  let baselineStatus: 'frozen' | 'late-capture' | 'missing' = 'missing';
  let currentRevisionNumber: number | undefined;
  let currentRevScenarios: Array<{ id: string }> | undefined;

  if (
    metadata.acceptance &&
    metadata.acceptance.revisions &&
    metadata.acceptance.revisions.length > 0 &&
    metadata.acceptance.current_revision
  ) {
    const currentRev = metadata.acceptance.revisions.find(
      (r) => r.revision === metadata.acceptance!.current_revision,
    );
    if (currentRev) {
      currentRevisionNumber = currentRev.revision;
      currentRevScenarios = currentRev.scenarios;
      baselineStatus = currentRev.origin === 'late-capture' ? 'late-capture' : 'frozen';
    }
  }

  if (deltaInput?.scenario_findings && deltaInput.scenario_findings.length > 0) {
    if (!currentRevScenarios || currentRevScenarios.length === 0) {
      throw new PrerequisiteError(
        'scenario_findings supplied but change has no acceptance baseline revisions',
        'Cannot evaluate scenario findings without a frozen acceptance baseline',
      );
    }
    const knownScenarioIds = new Set(currentRevScenarios.map((s) => s.id));
    for (const finding of deltaInput.scenario_findings) {
      if (!knownScenarioIds.has(finding.scenario_id)) {
        throw new PrerequisiteError(
          `unknown scenario_id "${finding.scenario_id}" in scenario_findings (expected one of: ${[...knownScenarioIds].join(', ')})`,
          'Ensure scenario findings reference valid frozen scenarios',
        );
      }
    }
  }

  const deltaPath = path.join(cwd, '.prospec', 'changes', changeName, 'delta-spec.md');
  const deltaExists = fs.existsSync(deltaPath);

  let reqAssessment: RequirementAssessmentResult | undefined;
  if (metadata.scale === 'quick') {
    reqAssessment = assessRequirementCompliance({
      scale: 'quick',
      deltaContent: '',
      items: deltaInput?.items,
      findings: deltaInput?.scenario_findings,
      suppliedVerdict: suppliedDeltaVerdict,
      baselineStatus,
      contextStatus,
    });
  } else {
    if (!deltaExists && (deltaInput?.items !== undefined || deltaInput?.context_id !== undefined)) {
      throw new PrerequisiteError(
        `delta-spec.md for change "${changeName}" cannot be read`,
        'Ensure delta-spec.md exists before recording verify',
      );
    }
    const deltaContent = deltaExists ? fs.readFileSync(deltaPath, 'utf8') : '';

    if (deltaInput?.scenario_findings) {
      const entries = iterateDeltaEntries(deltaContent);
      const formalReqIds = new Set(
        entries.filter((e) => ['ADDED', 'MODIFIED', 'REMOVED'].includes(e.section)).map((e) => e.reqId),
      );
      for (const finding of deltaInput.scenario_findings) {
        for (const reqId of finding.affected_req_ids) {
          if (!formalReqIds.has(reqId)) {
            throw new PrerequisiteError(
              `unknown REQ id "${reqId}" in scenario_finding "${finding.scenario_id}" (expected one of: ${[...formalReqIds].join(', ')})`,
            );
          }
        }
      }
    }

    reqAssessment = assessRequirementCompliance({
      scale: metadata.scale ?? 'standard',
      deltaContent,
      items: deltaInput?.items,
      findings: deltaInput?.scenario_findings,
      suppliedVerdict: suppliedDeltaVerdict,
      baselineStatus,
      contextStatus,
    });

  }
  if (deltaVerdict) {
    deltaVerdict.result = reqAssessment.verdict;
  }

  // Adjudicate current facts; a saved report is only an informational artifact.
  const assessment = await assessCurrentDrift(cwd);
  const { report } = assessment;

  const constitutionRules = report.structural.constitution?.rules ?? [];
  const constitutionInput = judgmentInput.find((d) => d.name === 'constitution');
  const graderConstitutionRules = constitutionInput?.constitution_rules;

  const resolveStatus = (checkId: string) =>
    adjudicateChangeCheck(report, checkId as DriftCheckId, changeName).status;

  const constitutionAudit = auditConstitution({
    rules: constitutionRules,
    resolveStatus,
    graderEntries: graderConstitutionRules,
  });

  const hasDeclaredChecks = constitutionAudit.machineLedger.length > 0;
  if (hasDeclaredChecks || graderConstitutionRules !== undefined) {
    if (constitutionAudit.violations.length > 0) {
      throw new PrerequisiteError(
        `Constitution audit anti-flip violation: ${constitutionAudit.violations.map((v) => v.reason).join('; ')}`,
        'Grader may only keep the machine verdict or add a WARN over a machine PASS for declared rules; nothing was written',
      );
    }
    const suppliedStatements = new Set(
      (graderConstitutionRules ?? [])
        .filter((r) => typeof r.statement === 'string' && r.statement.trim().length > 0)
        .map((r) => r.name),
    );
    const missingStatements = constitutionAudit.requiredStatements.filter(
      (name) => !suppliedStatements.has(name),
    );
    if (missingStatements.length > 0) {
      // The flag form (`--dimension constitution=PASS`) has no constitution_rules
      // channel, so a Constitution that declares checks can only be graded through
      // the file form — say so instead of an uncrossable count.
      const remedy =
        graderConstitutionRules === undefined
          ? `This Constitution declares checks, so the constitution dimension must be graded through the --dimensions file form — give each rule a constitution_rules[] entry with a non-empty statement (the --dimension flag form cannot carry them). Missing: ${missingStatements.join(', ')}. Nothing was written`
          : `Provide a non-empty statement for each non-mechanized rule, partial-coverage gap, and unadjudicated check. Missing: ${missingStatements.join(', ')}. Nothing was written`;
      throw new PrerequisiteError(
        `Constitution audit is missing a grader statement for ${missingStatements.length} rule(s): ${missingStatements.join(', ')}`,
        remedy,
      );
    }
  }

  // Gate A — the review-provenance Entry Gate, enforced here so the verify skill
  // no longer checks it by hand: a non-backfill change whose review-provenance,
  // adjudicated for THIS change, is not `pass` (review absent, stale, or the
  // change unprovable) is refused before any write. A sibling change's missing
  // review is not this change's problem. A proven backfill is guarded by the
  // not-applicable policy (the evaluator emits no finding for it), so it records.
  if (notApplicableMachine.length === 0) {
    const reviewGate = adjudicateChangeCheck(report, 'review-provenance', changeName);
    if (reviewGate.status !== 'pass') {
      throw new PrerequisiteError(
        reviewGate.status === 'unprovable'
          ? `review-provenance is unprovable for this change — ${reviewGate.reason}`
          : reviewGate.status === 'skipped'
            ? `review-provenance is skipped (${reviewGate.reason}) — this change has no provable review baseline`
            : 'review-provenance FAILs — this change has no current review baseline',
        'Run `prospec-review`, then `prospec check --record-review`, before recording the verify verdict',
      );
    }
  }

  const machineSkipReasons = new Map<string, string>();
  const machineDimensions: QualityDimension[] = MACHINE_DIMENSION_NAMES.map((name) => {
    if (notApplicableMachine.includes(name)) {
      return { name, result: 'not-applicable' as const, adjudicator: 'machine' as const };
    }
    const checkId = MACHINE_CHECK_FOR_DIMENSION[name]!;
    // Adjudicated for THIS change: task-completion and test-provenance are
    // change-scoped (a sibling's unchecked tasks or stale run never grade this
    // one), knowledge-health is repository-scoped and adopted as-is. A check
    // absent from the report, or a change the engine never enumerated, is an
    // honest gap — `not-adjudicated`, with the reason spelled into the warning.
    const verdict = adjudicateChangeCheck(report, checkId as DriftCheckId, changeName);
    if (verdict.reason !== undefined) {
      machineSkipReasons.set(name, verdict.reason);
    }
    const result = mapCheckStatusToVerdict(verdict.status);
    return { name, result, adjudicator: 'machine' as const };
  });

  // Gate D1 — a judgment dimension may not be graded more leniently than its
  // machine counterpart's finding. A report FAIL/WARN floors the judgment; a
  // report pass/skipped/absent sets no floor (a judgment may still be stricter).
  for (const d of judgmentVerdicts) {
    const checkId = JUDGMENT_MACHINE_COUNTERPART[d.name];
    if (checkId !== undefined) {
      const check = report.structural.checks.find((c) => c.id === checkId);
      if (check && (check.status === 'fail' || check.status === 'warn')) {
        const floor = check.status === 'fail' ? 2 : 1;
        if (verdictRank(d.result) < floor) {
          throw new PrerequisiteError(
            `judgment dimension "${d.name}" is declared "${d.result}" but the report's ${checkId} check reports "${check.status}" — a judgment cannot be more lenient than a machine finding`,
            `Grade "${d.name}" at least ${check.status === 'fail' ? 'FAIL' : 'WARN'}, or fix the violation and regenerate the report before recording`,
          );
        }
      }
    }
    if (d.name === 'constitution') {
      for (const entry of constitutionAudit.machineLedger) {
        if (entry.verdict === 'FAIL' && verdictRank(d.result) < 2) {
          throw new PrerequisiteError(
            `judgment dimension "${d.name}" is declared "${d.result}" but machine check "${entry.check_id}" for rule "${entry.rule_name}" reports "fail" — a judgment cannot be more lenient than a machine finding`,
            `Grade "${d.name}" at least FAIL, or fix the violation and regenerate the report before recording`,
          );
        }
        if (entry.verdict === 'WARN' && verdictRank(d.result) < 1) {
          throw new PrerequisiteError(
            `judgment dimension "${d.name}" is declared "${d.result}" but machine check "${entry.check_id}" for rule "${entry.rule_name}" reports "warn" — a judgment cannot be more lenient than a machine finding`,
            `Grade "${d.name}" at least WARN, or fix the violation and regenerate the report before recording`,
          );
        }
      }
    }
  }

  const dimensions: QualityDimension[] = [
    ...machineDimensions,
    ...judgmentVerdicts.map((d) => {
      if (d.name === 'delta-spec-compliance') {
        return {
          ...d,
          adjudicator: 'judgment' as const,
          ...(deltaInput?.context_id ? { context_id: deltaInput.context_id } : {}),
          ...(currentRevisionNumber ? { baseline_revision: currentRevisionNumber } : {}),
        };
      }
      return { ...d, adjudicator: 'judgment' as const };
    }),
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

  const constitutionNotAdjWarnings: string[] = constitutionAudit.machineLedger
    .filter((entry) => entry.verdict === 'not-adjudicated' && !excludedFromGrade.includes('constitution'))
    .map((entry) => `constitution: rule "${entry.rule_name}" check "${entry.check_id}" not-adjudicated — its check could not run`);

  const warnings = [
    ...options.warnings,
    ...notAdjudicatedWarnings,
    ...constitutionNotAdjWarnings,
    ...(backfillHonestyWarning ? [backfillHonestyWarning] : []),
    ...(reqAssessment && reqAssessment.gapWarnings.length > 0 ? reqAssessment.gapWarnings : []),
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

  let coverageSummaryStr: string | undefined;
  if (reqAssessment && reqAssessment.isApplicable && reqAssessment.expectedReqIds.length > 0) {
    const adjudicated = reqAssessment.items.filter((i) => i.result !== 'not-adjudicated').length;
    coverageSummaryStr = `${adjudicated}/${reqAssessment.expectedReqIds.length}`;
  }

  appendQualityLogEntry(doc, {
    skill: 'prospec-verify',
    date,
    result: gateResult,
    warnings,
    grade,
    dimensions,
    context_id: deltaInput?.context_id,
    baseline_revision: currentRevisionNumber,
    coverage_summary: coverageSummaryStr,
  });

  const blocks: EvidenceBlock[] = [];
  if (judgmentInput.length > 0) {
    for (const d of judgmentInput) {
      const block = evidenceBlockFor(
        { ...d, result: judgmentVerdicts.find((verdict) => verdict.name === d.name)!.result },
        d.name === 'delta-spec-compliance' ? reqAssessment : undefined,
      );
      if (block !== undefined) blocks.push(block);
    }
  } else if (reqAssessment && reqAssessment.isApplicable) {
    const deltaVerdict = judgmentVerdicts.find((d) => d.name === 'delta-spec-compliance');
    const block = evidenceBlockFor(
      {
        name: 'delta-spec-compliance',
        result: (deltaVerdict?.result ?? 'not-adjudicated') as JudgmentDimensionInput['result'],
        graded_by: (deltaVerdict?.graded_by ?? 'fresh-subagent') as 'fresh-subagent' | 'in-session',
      },
      reqAssessment,
    );
    if (block !== undefined) blocks.push(block);
  }

  for (const block of blocks) {
    const unsafe = findUnsafeBlockField(block);
    if (unsafe !== undefined) {
      throw new PrerequisiteError(
        `Block ${block.key} carries \`${EVIDENCE_MARKER_PREFIX}\` (or a line break) in its ${unsafe} — that marker is the evidence-block grammar`,
        'Remove or rephrase it; nothing was written',
      );
    }
  }

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
  if (
    !assessment.recheck() ||
    (liveContextAssessment !== undefined && !liveContextAssessment.recheck()) ||
    (savedContextRecheck !== undefined && !savedContextRecheck()) ||
    fs.readFileSync(metadataPath, 'utf8') !== metadataInput
  ) {
    throw new PrerequisiteError('verification inputs changed or are unprovable — nothing was written', 'Re-run verify against stable current inputs');
  }
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
    try {
      const existing = await readFileIfExists(verifyPath);
      const section = renderEvidenceSection(blocks, evidenceHeading);
      const head = existing.trim() === '' ? `# Verify Evidence: ${changeName}\n` : existing;
      await atomicWrite(verifyPath, `${trimTrailingNewlines(head)}\n\n${section}\n`);
      evidencePath = path.join('.prospec', 'changes', changeName, 'verify.md');
    } catch (error) {
      throw new PrerequisiteError(
        `metadata.yaml was updated with grade ${grade}, but writing verify.md failed (${error instanceof Error ? error.message : String(error)})`,
        'Re-run verify record to append the missing evidence; metadata has recorded this run',
      );
    }
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
    coverageSummary: coverageSummaryStr,
    ...(selfVerifiedCap !== undefined ? { selfVerifiedCap } : {}),
  };
}
