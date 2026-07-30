import type { Command } from 'commander';
import { execute } from '../../services/learn.service.js';
import { formatLearnUpsertOutput } from '../formatters/learn-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { parseDate } from '../parse-options.js';

/**
 * Register the `learn` command group with the `upsert` subcommand.
 *
 * Usage:
 *   prospec learn upsert --lesson <lesson.json>
 */
export function registerLearnCommand(program: Command): void {
  const learn = program.command('learn').description('Feedback-promotion ledger mechanics');

  learn
    .command('upsert')
    .description(
      'Keyed idempotent upsert into the lessons ledger, plus the explicit scoring rule and TTL scan',
    )
    .requiredOption('--lesson <file>', 'Path to the lesson JSON')
    .option('--today <date>', 'Date used for the playbook TTL expiry scan', parseDate)
    .action(async (options: { lesson: string; today?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const result = await execute({
          lessonPath: options.lesson,
          today: options.today,
        });
        formatLearnUpsertOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
