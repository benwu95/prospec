import { Argument, type Command } from 'commander';
import { CHANGE_SCALES, type ChangeScale } from '../../types/change.js';
import { formatChangeScaleOutput } from '../formatters/change-scale-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `scale` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change scale full [--change <name>]
 */
export function registerChangeScaleCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('scale')
    .description('Write the user-confirmed complexity scale to a change')
    .addArgument(new Argument('<scale>', 'Confirmed scale').choices(CHANGE_SCALES))
    .option('--change <name>', 'Specify the change name')
    .action(async (scale: ChangeScale, options: { change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/change-scale.service.js');
        const result = await execute({
          change: options.change,
          quiet: globalOpts.quiet,
          scale,
        });
        formatChangeScaleOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
