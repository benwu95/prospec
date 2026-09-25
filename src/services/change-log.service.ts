import * as fs from 'node:fs';
import * as path from 'node:path';
import { PLAN_DECISION_OPTIONS, type NewQualityLogEntry, type GateResult, type PlanDecisionOption } from '../types/change.js';
import { PrerequisiteError } from '../types/errors.js';
import {
  VERIFIER_REPORT_SCHEMAS,
  isVerifierReportSkill,
  planningVerdictToGateResult,
} from '../types/station.js';
import { PLAN_SIGNOFF_REMEDIES } from '../types/status.js';
import {
  readChangeMetadata,
  writeChangeMetadataDoc,
  appendQualityLogEntry,
  isReviewRoundCountsEntry,
  latestStampedVerifierEntry,
  latestVerifierEntry,
  verifierGateResultOf,
} from '../lib/change-metadata.js';
import { atomicWrite } from '../lib/fs-utils.js';
import { checkCandidateSet, parseDecision } from '../lib/artifact-validators.js';
import { CANDIDATES_DIR, DECISION_FILE, readCandidateFiles } from '../lib/plan-candidates.js';
import { todayIso } from '../lib/date-utils.js';
import { resolveChange } from './change-resolver.js';

export interface ChangeLogOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The entry to append; `date` defaults to today (bare ISO 8601 date).
   *  One of `entry` / `verifierReport` — never both. */
  entry?: Omit<NewQualityLogEntry, 'date'> & { date?: string };
  /**
   * The planning verifier's report file (plan / tasks station): validated
   * against the skill's schema in `VERIFIER_REPORT_SCHEMAS`, then turned into the
   * entry (`FLAWS` → `FAIL`; warnings = the payload's plus one line per non-PASS
   * dimension). The formal sink for a verdict the rubric used to ask the agent to
   * relay by hand.
   */
  verifierReport?: { skill: string; path: string; date?: string };
  /**
   * A human's plan sign-off (`--signoff <option>`): refused unless the latest plan
   * verifier result is PASS/WARN and the option is the recommendation plan.md and that
   * verifier audited; on acceptance decision.json's `graded_by` becomes `human` and a
   * PASS entry stamped `signoff_option` is appended. `notes` are the human's `--warning`s.
   */
  signoff?: { skill: string; option: string; notes?: string[]; date?: string };
}

export interface ChangeLogResult {
  changeName: string;
  metadataPath: string;
  entry: NewQualityLogEntry;
}

/**
 * `prospec change log` — append one structured quality_log entry.
 *
 * The judgment (result, warnings text, grade, counts) is the caller's; this
 * service owns the serialization: canonical key order, YAML escaping as data,
 * comment-preserving write-back. Skills stop hand-writing quality_log YAML.
 */
export async function execute(options: ChangeLogOptions): Promise<ChangeLogResult> {
  const cwd = options.cwd ?? process.cwd();
  const sources = [options.entry, options.verifierReport, options.signoff].filter((s) => s !== undefined);
  if (sources.length > 1) {
    throw new PrerequisiteError(
      'More than one verdict source was supplied (composed entry, verifier report, sign-off)',
      'Record the verdict one way — one `change log` run has one verdict source',
    );
  }
  if (sources.length === 0) {
    throw new PrerequisiteError(
      'Nothing to record: none of --result, --verifier-report or --signoff was given',
      'Pass `--result <PASS|WARN|FAIL>` (with `--warning`s), `--verifier-report <file>` for a plan/tasks verifier payload, or `--signoff <option>` for a human plan sign-off',
    );
  }
  if (options.signoff !== undefined) return recordSignoff(options.signoff, options, cwd);
  // Same forgery guard as verifier_verdict: only the sign-off path writes this stamp.
  if (options.entry?.signoff_option !== undefined) {
    throw new PrerequisiteError(
      'A composed entry may not carry signoff_option — that stamp is written only by --signoff',
      'Drop the field, or record the human sign-off with `--signoff <option>`',
    );
  }
  // The stamp is provenance: it means "the sink validated a verifier report". A
  // composed entry claiming it would forge a verifier result for `prospec status`.
  if (options.entry?.verifier_verdict !== undefined || options.entry?.audited_option !== undefined) {
    throw new PrerequisiteError(
      'A composed entry may not carry verifier_verdict or audited_option — those stamps are written only from a validated --verifier-report',
      'Drop the field, or record the verifier report itself with `--verifier-report <file>`',
    );
  }

  // The report is validated BEFORE the change is resolved or its metadata read:
  // every refusal it carries must precede any prompt and any write.
  const composed =
    options.verifierReport === undefined
      ? options.entry!
      : entryFromVerifierReport(options.verifierReport, cwd);

  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change should this quality_log entry be appended to?',
  );

  const metadataPath = path.join(cwd, '.prospec', 'changes', changeName, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);

  // The plan verifier audits plan.md together with the recommendation it argues for;
  // stamping that recommendation binds a later sign-off to what was audited.
  if (options.verifierReport !== undefined && composed.skill === 'prospec-plan') {
    const decision = parseDecision(readCandidateFiles(path.dirname(metadataPath)).decision);
    if (decision.state === 'valid') composed.audited_option = decision.payload.recommended_option;
  }

  let result: GateResult = composed.result;
  const warnings = [...composed.warnings];

  if (composed.skill === 'prospec-review') {
    const hasCountFlags =
      composed.criticals_found !== undefined ||
      composed.criticals_fixed !== undefined ||
      composed.majors !== undefined;

    if (hasCountFlags) {
      const reviewCountsEntries = (metadata.quality_log ?? []).filter((e) =>
        isReviewRoundCountsEntry(e),
      );
      if (reviewCountsEntries.length > 0) {
        const highestRoundEntry = reviewCountsEntries.reduce((max, curr) =>
          (curr.round ?? 0) > (max.round ?? 0) ? curr : max,
        );
        const mismatches: string[] = [];
        if (
          composed.criticals_found !== undefined &&
          composed.criticals_found !== (highestRoundEntry.criticals_found ?? 0)
        ) {
          mismatches.push(
            `criticals_found expected ${highestRoundEntry.criticals_found ?? 0} got ${composed.criticals_found}`,
          );
        }
        if (
          composed.criticals_fixed !== undefined &&
          composed.criticals_fixed !== (highestRoundEntry.criticals_fixed ?? 0)
        ) {
          mismatches.push(
            `criticals_fixed expected ${highestRoundEntry.criticals_fixed ?? 0} got ${composed.criticals_fixed}`,
          );
        }
        if (
          composed.majors !== undefined &&
          composed.majors !== (highestRoundEntry.majors ?? 0)
        ) {
          mismatches.push(
            `majors expected ${highestRoundEntry.majors ?? 0} got ${composed.majors}`,
          );
        }
        if (mismatches.length > 0) {
          warnings.push(`log_mismatch: ${mismatches.join(', ')}`);
          if (result === 'PASS') {
            result = 'WARN';
          }
        }
      }
    }
  }

  const strippedComposed = { ...composed };
  delete strippedComposed.criticals_found;
  delete strippedComposed.criticals_fixed;
  delete strippedComposed.majors;
  delete strippedComposed.round;

  const entry: NewQualityLogEntry = {
    ...(composed.skill === 'prospec-review' ? strippedComposed : composed),
    date: composed.date ?? todayIso(),
    result,
    warnings,
  };
  appendQualityLogEntry(doc, entry);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);

  return {
    changeName,
    metadataPath: path.join('.prospec', 'changes', changeName, 'metadata.yaml'),
    entry,
  };
}

/**
 * Record a human plan sign-off. Every refusal precedes every write; decision.json is
 * written before the quality_log entry because the entry is what unlocks routing, so a
 * failure between the two leaves the change still paused and a re-run completes it.
 */
async function recordSignoff(
  signoff: NonNullable<ChangeLogOptions['signoff']>,
  options: ChangeLogOptions,
  cwd: string,
): Promise<ChangeLogResult> {
  if (signoff.skill !== 'prospec-plan') {
    throw new PrerequisiteError(
      `--signoff is not defined for skill "${signoff.skill}"`,
      'Only the plan station records a sign-off: pass `--skill prospec-plan`',
    );
  }
  const option = PLAN_DECISION_OPTIONS.find((o) => o === signoff.option);
  if (option === undefined) {
    throw new PrerequisiteError(
      `--signoff option "${signoff.option}" is not one of: ${PLAN_DECISION_OPTIONS.join(', ')}`,
      'Name the candidate id the human selected',
    );
  }

  const changeName = await resolveChange(
    cwd,
    options.change,
    options.quiet,
    'Which change is this plan sign-off for?',
  );
  const changeDir = path.join(cwd, '.prospec', 'changes', changeName);
  const metadataPath = path.join(changeDir, 'metadata.yaml');
  const { doc, metadata } = readChangeMetadata(metadataPath, changeName);

  const verifierEntry = latestVerifierEntry(metadata.quality_log, 'prospec-plan');
  const verifier = verifierEntry === null ? null : verifierGateResultOf(verifierEntry);
  if (verifier === null || verifier === 'FAIL') {
    throw new PrerequisiteError(
      verifier === null
        ? 'No plan verifier result is recorded — there is nothing to sign off yet'
        : 'The latest plan verifier result is FAIL — a plan that failed its own audit cannot be signed off',
      verifier === null
        ? 'Record the Architecture Verifier report with `prospec change log --skill prospec-plan --verifier-report <file>` first'
        : 'Revise plan.md/delta-spec.md and re-record a PASS/WARN verifier report first',
    );
  }

  const files = readCandidateFiles(changeDir);
  const set = checkCandidateSet(files.candidates, files.decision);
  if (set.decision.state !== 'valid') {
    throw new PrerequisiteError(
      set.decision.state === 'absent'
        ? `candidates/${DECISION_FILE} is missing — nothing was written`
        : `candidates/${DECISION_FILE} failed validation (${set.decision.where}) — nothing was written`,
      `To sign off: ${PLAN_SIGNOFF_REMEDIES}`,
    );
  }
  const failures = set.findings.filter((f) => f.level === 'FAIL').map((f) => f.message);
  if (failures.length > 0) {
    throw new PrerequisiteError(
      `The candidate set fails validation (${failures.join('; ')}) — nothing was written`,
      'Fix the candidate files (`prospec validate candidates` lists every failure), re-record the plan verifier, then sign off',
    );
  }
  const decision = set.decision.payload;
  if (decision.recommended_option !== option) {
    throw new PrerequisiteError(
      `--signoff ${option} differs from decision.json recommended_option "${decision.recommended_option}" — plan.md and the plan verifier audited the recommendation`,
      `To select ${option}: revise plan.md, delta-spec.md and decision.json for it, re-record the plan verifier (a newer verifier entry supersedes any earlier sign-off), then sign off`,
    );
  }

  // Bound to the latest verifier REPORT: a Break-Glass WARN after it overrides the
  // verdict but audited nothing, so it can never release a rewritten recommendation.
  const report = latestStampedVerifierEntry(metadata.quality_log, 'prospec-plan');
  if (report?.audited_option !== option) {
    throw new PrerequisiteError(
      report === null
        ? 'No plan verifier report is recorded (only a Break-Glass override), so no recommendation was audited — nothing was written'
        : report.audited_option === undefined
          ? 'The latest plan verifier report stamps no audited recommendation (decision.json was absent or not schema-valid when it was recorded, or an older CLI recorded it) — nothing was written'
          : `decision.json recommends ${option}, but the latest plan verifier report audited ${report.audited_option} — nothing was written`,
      'Re-record the plan verifier report for the current plan.md and decision.json (`prospec change log --skill prospec-plan --verifier-report <file>`), then sign off',
    );
  }

  const decisionPath = path.join(changeDir, CANDIDATES_DIR, DECISION_FILE);
  await atomicWrite(decisionPath, `${JSON.stringify({ ...decision, graded_by: 'human' }, null, 2)}\n`);
  const entry: NewQualityLogEntry = {
    skill: 'prospec-plan',
    date: signoff.date ?? todayIso(),
    result: 'PASS',
    warnings: signoff.notes ?? [],
    signoff_option: option satisfies PlanDecisionOption,
  };
  appendQualityLogEntry(doc, entry);
  await writeChangeMetadataDoc(metadataPath, doc, changeName);

  return {
    changeName,
    metadataPath: path.join('.prospec', 'changes', changeName, 'metadata.yaml'),
    entry,
  };
}

/** Validate a planning verifier report and derive the quality_log entry from it.
 *  The entry carries `verifier_verdict` — the provenance stamp `prospec status`
 *  keys on, so a station's own Exit Gate entry can never pass for the verifier's. */
function entryFromVerifierReport(
  report: {
    skill: string;
    path: string;
    date?: string;
  },
  cwd: string,
): Omit<NewQualityLogEntry, 'date'> & { date?: string } {
  if (!isVerifierReportSkill(report.skill)) {
    throw new PrerequisiteError(
      `--verifier-report is not defined for skill "${report.skill}"`,
      `Only these stations record a verifier report: ${Object.keys(VERIFIER_REPORT_SCHEMAS).join(', ')}. Other stations use --result/--warning`,
    );
  }
  const reportPath = path.resolve(cwd, report.path);
  if (!fs.existsSync(reportPath)) {
    throw new PrerequisiteError(
      `Verifier report not found: ${report.path}`,
      'Write the verifier report as JSON to a regular file and pass its path via --verifier-report',
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  } catch {
    throw new PrerequisiteError(
      `Verifier report is not valid JSON: ${report.path}`,
      'Emit the report as a JSON object with verdict, dimensions, evidence and optional warnings',
    );
  }
  const parsed = VERIFIER_REPORT_SCHEMAS[report.skill].safeParse(json);
  if (!parsed.success) {
    throw new PrerequisiteError(
      `Verifier report failed validation: ${parsed.error.issues
        .map((i) => `${i.path.map(String).join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
      `The ${report.skill} verifier report is a closed object: verdict (PASS|WARN|FLAWS), exactly the owning dimensions each {result, rationale}, evidence, optional single-line warnings — nothing was written`,
    );
  }
  const payload = parsed.data;
  const dimensionWarnings = Object.entries(payload.dimensions)
    .filter(([, d]) => d.result !== 'PASS')
    .map(([name, d]) => `${name}: ${d.rationale}`);
  return {
    skill: report.skill,
    result: planningVerdictToGateResult(payload.verdict),
    warnings: [...(payload.warnings ?? []), ...dimensionWarnings],
    verifier_verdict: payload.verdict,
    ...(report.date !== undefined ? { date: report.date } : {}),
  };
}
