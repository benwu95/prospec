import type { Command } from 'commander';
import { execute } from '../../services/measure.service.js';
import { formatMeasureOutput } from '../formatters/measure-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import type { LogLevel } from '../../types/config.js';
import { DEFAULT_REPORT_FILENAME } from '../../types/measurement.js';

function resolveLogLevel(opts: GlobalOptions): LogLevel {
  if (opts.quiet) return 'quiet';
  if (opts.verbose) return 'verbose';
  return 'normal';
}

/**
 * Register the `measure` command.
 *
 * Usage:
 *   prospec measure [--report <path>]
 *
 * Read-only: displays measurement-report.json produced by
 * `pnpm measure:tokens`. Never calls a provider API.
 */
export function registerMeasureCommand(program: Command): void {
  program
    .command('measure')
    .description('Display the token measurement report (read-only)')
    .option('--report <path>', `Report file path (default: ${DEFAULT_REPORT_FILENAME})`)
    .action(async (options: { report?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const result = await execute({ reportPath: options.report });
        formatMeasureOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
