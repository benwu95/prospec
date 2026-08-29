import { Argument, type Command } from 'commander';
import { STATION_SETTABLE_STATUSES, type ChangeStatus } from '../../types/change.js';
import { formatChangeStatusOutput } from '../formatters/change-status-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `status` subcommand under the `change` command group
 * (distinct from the top-level read-only `prospec status` router).
 *
 * Usage:
 *   prospec change status implemented [--change <name>]
 */
export function registerChangeStatusCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('status')
    .description(
      'Advance a change to a later lifecycle status (forward-only; verified/archived are gate-owned)',
    )
    .addArgument(new Argument('<to>', 'Target status').choices(STATION_SETTABLE_STATUSES))
    .option('--change <name>', 'Specify the change name')
    .action(async (to: ChangeStatus, options: { change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/change-status.service.js');
        const result = await execute({
          change: options.change,
          quiet: globalOpts.quiet,
          to,
        });
        formatChangeStatusOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
