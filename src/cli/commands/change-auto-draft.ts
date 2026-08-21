import { Option, type Command } from 'commander';
import { execute } from '../../services/auto-draft.service.js';
import { formatChangeAutoDraftOutput } from '../formatters/change-auto-draft-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { CHANGE_SCALES, type ChangeScale } from '../../types/change.js';
import { DRIFT_REPORT_FILENAME } from '../../types/drift-report.js';

/**
 * Register the `auto-draft` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change auto-draft [--target <name>] [--reason <text>]
 *                            [--from-report [file]] [--check <check-id>]
 *                            [--scale <scale>] [--issue <ref>] [--dry-run]
 */
export function registerChangeAutoDraftCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('auto-draft')
    .description('Auto-draft fix changes from drift findings or specific targets')
    .option('--target <target>', 'Target module or component name')
    .option('--reason <reason>', 'Specific reason or finding detail')
    .option('--check <checkId>', 'Drift check ID (e.g. knowledge-size, import-direction)')
    .option(
      '--from-report [file]',
      `Path to drift report JSON file (defaults to ${DRIFT_REPORT_FILENAME})`,
    )
    .addOption(
      new Option('--scale <scale>', 'Override the scale inferred from the check').choices(
        CHANGE_SCALES,
      ),
    )
    .option('--issue <ref>', 'External tracker reference (e.g. #185)')
    .option('--dry-run', 'Simulate drafting without writing files to disk')
    .action(
      async (options: {
        target?: string;
        reason?: string;
        check?: string;
        fromReport?: boolean | string;
        scale?: ChangeScale;
        issue?: string;
        dryRun?: boolean;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        const reportPath =
          typeof options.fromReport === 'string'
            ? options.fromReport
            : options.fromReport === true
              ? DRIFT_REPORT_FILENAME
              : undefined;

        try {
          const result = await execute({
            target: options.target,
            reason: options.reason,
            checkId: options.check,
            fromReport: reportPath,
            scale: options.scale,
            issue: options.issue,
            dryRun: options.dryRun,
          });
          formatChangeAutoDraftOutput(result, logLevel);
          // A group that could not be written is a failure of the run, even
          // though the other groups succeeded and are reported above.
          if (result.failedCount > 0) process.exitCode = 1;
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
