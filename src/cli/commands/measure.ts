import type { Command } from 'commander';
import { formatMeasureOutput, formatProjectionOutput } from '../formatters/measure-output.js';
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
    .description('Display the local session token measurement report (read-only, no API key required)')
    .option('--project-workflow [scale]', 'Project token budget for a single change workflow, without requiring a report file')
    .option('--change <name>', 'Change name to project budget for (required with --project-workflow if ambiguous)')
    .action(async (options: { projectWorkflow?: boolean | string; change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const { execute, executeProjection } = await import('../../services/measure.service.js');
        if (options.projectWorkflow) {
          const { resolveChange } = await import('../../services/change-resolver.js');
          const cwd = process.cwd();
          const changeName = await resolveChange(cwd, options.change, logLevel === 'quiet', 'Select a change to project token budget:');
          const result = await executeProjection({
            projectWorkflow: options.projectWorkflow,
            change: changeName,
          });
          formatProjectionOutput(result, logLevel);
        } else {
          const result = await execute({});
          formatMeasureOutput(result, logLevel);
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
