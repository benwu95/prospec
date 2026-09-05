import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NewQualityLogEntry } from '../types/change.js';
import { PrerequisiteError } from '../types/errors.js';
import {
  VERIFIER_REPORT_SCHEMAS,
  isVerifierReportSkill,
  planningVerdictToGateResult,
} from '../types/station.js';
import { readChangeMetadata, writeChangeMetadataDoc, appendQualityLogEntry } from '../lib/change-metadata.js';
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
  if (options.entry !== undefined && options.verifierReport !== undefined) {
    throw new PrerequisiteError(
      'Both a composed entry and a verifier report were supplied',
      'Record the verdict one way or the other — one `change log` run has one verdict source',
    );
  }
  if (options.entry === undefined && options.verifierReport === undefined) {
    throw new PrerequisiteError(
      'Nothing to record: neither --result nor --verifier-report was given',
      'Pass `--result <PASS|WARN|FAIL>` (with `--warning`s), or `--verifier-report <file>` for a plan/tasks verifier payload',
    );
  }
  // The stamp is provenance: it means "the sink validated a verifier report". A
  // composed entry claiming it would forge a verifier result for `prospec status`.
  if (options.entry?.verifier_verdict !== undefined) {
    throw new PrerequisiteError(
      'A composed entry may not carry verifier_verdict — that stamp is written only from a validated --verifier-report',
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
  const { doc } = readChangeMetadata(metadataPath, changeName);

  const entry: NewQualityLogEntry = {
    ...composed,
    date: composed.date ?? todayIso(),
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
