import type { Command } from 'commander';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { COMMAND_HELP_SPECS, renderCommandHelp } from '../../types/cli-help.js';

/**
 * Register the `constitution` command group with the `show` subcommand.
 *
 * Usage:
 *   prospec constitution show --station <name>
 *   prospec constitution show --rule <name>
 */
export function registerConstitutionCommand(program: Command): void {
  const constitution = program.command('constitution').description('Read the project Constitution');

  constitution
    .command('show')
    .description('Print the Constitution slice one station needs, or one rule')
    .addHelpText('after', renderCommandHelp(COMMAND_HELP_SPECS['constitution show']))
    .option('--station <name>', 'SDD station (story, plan, tasks, review, …) whose slice to print')
    .option('--rule <name>', 'Exact rule name, without its severity tag')
    .action(async (options: { station?: string; rule?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const { execute } = await import('../../services/constitution-show.service.js');
        const { formatConstitutionShowOutput } = await import('../formatters/constitution-output.js');
        formatConstitutionShowOutput(await execute({ station: options.station, rule: options.rule }));
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
