import type { Command } from 'commander';
import { execute } from '../../services/change-story.service.js';
import { formatChangeStoryOutput } from '../formatters/change-story-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `change` command group with `story` subcommand.
 *
 * Usage:
 *   prospec change story <name> [--description <desc>]
 *
 * The parent `change` command is a command group (no action).
 * `story` is the subcommand that creates a change story directory.
 */
export function registerChangeCommand(program: Command): void {
  const change = program
    .command('change')
    .description('Change management');

  change
    .command('story')
    .description('Create a change request')
    .argument('<name>', 'Change name (kebab-case)')
    .option('--description <desc>', 'Change description')
    .action(
      async (name: string, options: { description?: string }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            name,
            description: options.description,
          });
          formatChangeStoryOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
