import { Option, type Command } from 'commander';
import { DIMENSION_GRADED_BY, type DimensionGradedBy } from '../../types/change.js';
import { formatCheckOutput } from '../formatters/check-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `check` command.
 *
 * Usage:
 *   prospec check [--json] [--strict] [--init-ci] [--record-review]
 *                [--record-tests] [--escaped-defects]
 *
 * Deterministic, zero-LLM drift check (REQ-CLI-011). `--strict` maps any
 * FAIL to exit code 1 — warn and skipped never affect the exit code.
 * `--record-review` records the active change's review baseline (REQ-CLI-012);
 * `--record-tests` runs the project's test command and records its outcome, and
 * `--escaped-defects` reports per-gate miss rate (REQ-CLI-022) — both are
 * non-check modes that exit without grading drift.
 */
export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run the deterministic spec/code/knowledge drift check')
    .option(
      '--json',
      'Write the machine-readable report to a file (prospec-report.json; ' +
        'escaped-defect-report.json with --escaped-defects)',
    )
    .option('--strict', 'Exit with code 1 when any check fails (CI gate)')
    .option('--init-ci', 'Scaffold .github/workflows/prospec-check.yml and exit')
    .option('--record-review', "Record the active change's review baseline and exit")
    .option('--record-tests', "Run the project's test command, record the outcome, and exit")
    .option('--escaped-defects', 'Report per-gate escaped-defect rate from `introduced_by` and exit')
    .option('--auto-draft', 'Auto-draft fix changes for detected FAIL/WARN findings')
    .option(
      '--auto-draft-dry-run',
      'With --auto-draft, report what would be drafted without writing it',
    )
    .option(
      '--change <name>',
      'Target change for --record-review/--record-tests (disambiguates when several are in flight)',
    )
    .addOption(
      new Option(
        '--graded-by <context>',
        "With --record-review: the reviewer's self-declared grading context",
      ).choices([...DIMENSION_GRADED_BY]),
    )
    .action(
      async (options: {
        json?: boolean;
        strict?: boolean;
        initCi?: boolean;
        recordReview?: boolean;
        recordTests?: boolean;
        escapedDefects?: boolean;
        change?: string;
        gradedBy?: DimensionGradedBy;
        autoDraft?: boolean;
        autoDraftDryRun?: boolean;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const { execute } = await import('../../services/check.service.js');
          const result = await execute({
            json: options.json,
            initCi: options.initCi,
            recordReview: options.recordReview,
            recordTests: options.recordTests,
            escapedDefects: options.escapedDefects,
            change: options.change,
            gradedBy: options.gradedBy,
            autoDraft: options.autoDraft,
            autoDraftDryRun: options.autoDraftDryRun,
          });
          formatCheckOutput(result, logLevel);
          if (options.strict && result.kind === 'report' && result.hasFail) {
            process.exitCode = 1;
          }
          // Drafting cannot change the CHECK's verdict, but a run that failed to
          // write what it was asked to write is not a success. Without this a
          // caller cannot tell "nothing to draft" from "every scaffold failed".
          if (
            result.kind === 'report' &&
            (result.autoDraftError !== undefined || (result.autoDraftResult?.failedCount ?? 0) > 0)
          ) {
            process.exitCode = 1;
          }
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
