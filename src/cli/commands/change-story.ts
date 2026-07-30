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
    .option(
      '--related-module <name>',
      'Explicit related module (repeatable; overrides keyword auto-matching)',
      (value: string, previous: string[]) => [...previous, value],
      [] as string[],
    )
    .option(
      '--introduced-by <change>',
      'Bug-fix changes: the change that missed the defect (escaped-defect registration)',
    )
    .action(
      async (
        name: string,
        options: { description?: string; relatedModule: string[]; introducedBy?: string },
      ) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            name,
            description: options.description,
            ...(options.relatedModule.length > 0
              ? { relatedModules: options.relatedModule }
              : {}),
            ...(options.introducedBy ? { introducedBy: options.introducedBy } : {}),
          });
          formatChangeStoryOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
