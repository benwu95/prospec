import type { Command } from 'commander';
import { execute, executeOffline } from '../../services/measure.service.js';
import { formatMeasureOutput, formatSizeOutput } from '../formatters/measure-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `measure` command.
 *
 * Usage:
 *   prospec measure [--report <path>]
 *   prospec measure --offline [--report <path>]
 *
 * Read-only: displays measurement-report.json produced by `pnpm measure:tokens`,
 * or (with --offline) size-report.json produced by `pnpm measure:tokens --offline`.
 * Never calls a provider API.
 */
export function registerMeasureCommand(program: Command): void {
  program
    .command('measure')
    .description('Display the token measurement report (read-only)')
    .option('--report <path>', 'Report file path (default: measurement-report.json, or size-report.json with --offline)')
    .option('--offline', 'Display the keyless offline size estimate (size-report.json) instead of the API measurement report')
    .action(async (options: { report?: string; offline?: boolean }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        if (options.offline) {
          const result = await executeOffline({ reportPath: options.report });
          formatSizeOutput(result, logLevel);
        } else {
          const result = await execute({ reportPath: options.report });
          formatMeasureOutput(result, logLevel);
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
