import type { Command } from 'commander';
import { formatChangeRelatedModulesOutput } from '../formatters/change-related-modules-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `related-modules` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change related-modules lib services [--change <name>]
 */
export function registerChangeRelatedModulesCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('related-modules')
    .description("Correct an existing change's related modules (registered names only; never drops one)")
    .argument('<module...>', 'Every module the change affects')
    .option('--change <name>', 'Specify the change name')
    .action(async (modules: string[], options: { change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/change-related-modules.service.js');
        const result = await execute({
          change: options.change,
          quiet: globalOpts.quiet,
          modules,
        });
        formatChangeRelatedModulesOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
