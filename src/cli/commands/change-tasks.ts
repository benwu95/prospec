import type { Command } from 'commander';
import { execute } from '../../services/change-tasks.service.js';
import { formatChangeTasksOutput } from '../formatters/change-tasks-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `tasks` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change tasks [--change <name>]
 *
 * The `change` parent command must already exist (registered by change-story.ts).
 * This function finds it and adds the `tasks` subcommand.
 */
export function registerChangeTasksCommand(program: Command): void {
  // Find the existing 'change' command group
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('tasks')
    .description('Break down into a task list')
    .option('--change <name>', 'Specify the change name')
    .option('--force', 'Overwrite an existing tasks.md')
    .action(
      async (options: { change?: string; force?: boolean }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            force: options.force,
          });
          formatChangeTasksOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
