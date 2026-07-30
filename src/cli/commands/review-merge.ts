import type { Command } from 'commander';
import { execute } from '../../services/review-merge.service.js';
import { formatReviewMergeOutput } from '../formatters/review-merge-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `review` command group with the `merge` subcommand.
 *
 * Usage:
 *   prospec review merge --findings <round.json> [--change <name>]
 */
export function registerReviewCommand(program: Command): void {
  const review = program.command('review').description('Adversarial-review bookkeeping');

  review
    .command('merge')
    .description('Merge one review round\'s findings into the cumulative review.md table')
    .requiredOption('--findings <file>', "Path to the round's findings JSON array")
    .option('--change <name>', 'Specify the change name')
    .action(async (options: { findings: string; change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const result = await execute({
          change: options.change,
          quiet: globalOpts.quiet,
          findingsPath: options.findings,
        });
        formatReviewMergeOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
