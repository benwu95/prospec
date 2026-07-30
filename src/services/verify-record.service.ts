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
} from '../types/station.js';
import {
  readChangeMetadata,
  writeChangeMetadataDoc,
  appendQualityLogEntry,
} from '../lib/change-metadata.js';
import { computeChangeDigest } from '../lib/drift-sources.js';
import { computeGrade, resultForGrade, gradeAdvancesStatus } from '../lib/verify-grade.js';
import { todayIso } from '../lib/date-utils.js';
import { resolveChange } from './change-resolver.js';

export interface VerifyRecordOptions {
  /** Explicit change name; resolved interactively when omitted. */
  change?: string;
  cwd?: string;
  quiet?: boolean;
  /** The reviewer's verdicts for the judgment dimensions (2/5, 3/5, 6). */
  judgmentDimensions: QualityDimension[];
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
}

/** drift-check id → verify dimension name (the machine ledger's fact sources). */
const MACHINE_CHECK_FOR_DIMENSION: Record<string, string> = {
  'task-completion': 'task-completion',
  knowledge: 'knowledge-health',
  tests: 'test-provenance',
};

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

  // Judgment input must cover exactly the judgment dimensions — no relays of
  // machine dimensions, no missing verdicts.
  const judgmentNames = options.judgmentDimensions.map((d) => d.name);
  const expected = [...JUDGMENT_DIMENSION_NAMES].sort();
  const gotSorted = [...judgmentNames].sort();
  if (JSON.stringify(gotSorted) !== JSON.stringify(expected)) {
    throw new PrerequisiteError(
      `Judgment dimensions must be exactly [${expected.join(', ')}] (got: ${judgmentNames.join(', ') || 'none'})`,
      'Pass one --dimension per judgment dimension; a dimension that does not apply is result not-applicable, never omitted. Machine dimensions are read from the report — do not pass them',
    );
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

  const dimensions: QualityDimension[] = [
    ...machineDimensions,
    ...options.judgmentDimensions.map((d) => ({ ...d, adjudicator: 'judgment' as const })),
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
  const grade = computeGrade(gradeInputs, warnings);
  const gateResult = resultForGrade(grade);

  appendQualityLogEntry(doc, {
    skill: 'prospec-verify',
    date: options.date ?? todayIso(),
    result: gateResult,
    warnings,
    grade,
    dimensions,
  });

  let statusAdvanced = false;
  if (gradeAdvancesStatus(grade) && isStatusBefore(metadata.status, 'verified')) {
    doc.set('status', 'verified');
    statusAdvanced = true;
  }
  await writeChangeMetadataDoc(metadataPath, doc, changeName);

  return {
    changeName,
    grade,
    result: gateResult,
    dimensions,
    warnings,
    statusAdvanced,
    gradeGraduates: gradeAdvancesStatus(grade),
    excludedFromGrade,
  };
}
