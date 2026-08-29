import type { Command } from 'commander';
import { formatChangeProgressOutput } from '../formatters/change-progress-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `progress` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change progress [--complete T5] [--change <name>]
 */
export function registerChangeProgressCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('progress')
    .description('Report code-task progress; optionally mark one task complete')
    .option('--complete <task>', 'Task to mark complete (leading ID token or 1-based position)')
    .option('--change <name>', 'Specify the change name')
    .action(async (options: { complete?: string; change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/change-progress.service.js');
        const result = await execute({
          change: options.change,
          quiet: globalOpts.quiet,
          complete: options.complete,
        });
        formatChangeProgressOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
