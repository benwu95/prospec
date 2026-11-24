import { Option, type Command } from 'commander';
import { DIMENSION_GRADED_BY, type DimensionGradedBy } from '../../types/change.js';
import { MetadataWriteError } from '../../types/errors.js';
import { TEST_QUEUE_BUSY_EXIT_CODE } from '../../types/test-queue.js';
import { formatCheckOutput } from '../formatters/check-output.js';
import { handleError } from '../formatters/error-output.js';
import { exitCodeForSignal, testQueueWaitLine } from '../formatters/test-queue-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `check` command.
 *
 * Usage:
 *   prospec check [--json] [--strict] [--init-ci] [--record-review]
 *                [--record-tests]
 *
 * Deterministic, zero-LLM drift check (REQ-CLI-011). `--strict` maps any
 * FAIL to exit code 1 — warn and skipped never affect the exit code.
 * `--record-review` records the active change's review baseline (REQ-CLI-012);
 * `--record-tests` runs the project's test command and records its outcome
 * (REQ-CLI-022) — both are non-check modes that exit without grading drift.
 */
export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run the deterministic spec/code/knowledge drift check')
    .option('--json', 'Write the machine-readable report to prospec-report.json')
    .option('--strict', 'Exit with code 1 when any check fails (CI gate)')
    .option('--init-ci', 'Scaffold the Prospec Check workflows (prospec-check.yml + prospec-check-comment.yml) and exit')
    .option('--record-review', "Record the active change's review baseline and exit")
    .option('--record-tests', "Run the project's test command, record the outcome, and exit")
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
            change: options.change,
            gradedBy: options.gradedBy,
            autoDraft: options.autoDraft,
            autoDraftDryRun: options.autoDraftDryRun,
            onQueueWait: (info) => console.error(testQueueWaitLine(info)),
          });
          formatCheckOutput(result, logLevel);
          // A busy queue ran nothing, and an interrupted run ends the way a signal would
          // have ended it: neither is the exit 0 of a recorded run.
          if (result.kind === 'record-tests' && result.busy !== undefined) {
            process.exitCode = TEST_QUEUE_BUSY_EXIT_CODE;
          } else if (result.kind === 'record-tests' && result.interruptedBy !== undefined) {
            process.exitCode = exitCodeForSignal(result.interruptedBy);
          }
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
          handleError(err, globalOpts.verbose ?? false, options.json === true && err instanceof MetadataWriteError);
        }
      },
    );
}
