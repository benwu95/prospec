import type { Command } from 'commander';
import { formatReviewMergeOutput } from '../formatters/review-merge-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { parseIntOption, parseBoundedInt, parseRatio } from '../parse-options.js';
import { REVIEW_ROUNDS_MIN, REVIEW_ROUNDS_MAX } from '../../types/cascade.js';

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
    .option('--round <number>', 'In-loop round, starting at 1 on every entry into review (omitted: re-runs the recorded round until `prospec change log` closes it)', parseIntOption('round', 1))
    .option('--spend <tokens>', 'Self-reported token spend for this round', parseIntOption('spend', 0))
    .option('--budget <tokens>', 'Maximum token spend budget for the review loop', parseIntOption('budget', 1))
    .option('--max-fix-induced-ratio <ratio>', 'Maximum fix-induced ratio threshold (0.0-1.0)', parseRatio('max-fix-induced-ratio'))
    .option('--max-rounds <number>', `Maximum review rounds before hard cap (${REVIEW_ROUNDS_MIN}-${REVIEW_ROUNDS_MAX})`, parseBoundedInt('max-rounds', REVIEW_ROUNDS_MIN, REVIEW_ROUNDS_MAX))
    .option('--max-flips <number>', 'Maximum oscillation flips before tripping', parseIntOption('max-flips', 1))
    .option('--lenses <list>', 'Comma-separated list of lenses invoked this round', (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .action(
      async (options: {
        findings: string;
        change?: string;
        round?: number;
        spend?: number;
        budget?: number;
        maxFixInducedRatio?: number;
        maxRounds?: number;
        maxFlips?: number;
        lenses?: string[];
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        try {
          const { execute } = await import('../../services/review-merge.service.js');
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            findingsPath: options.findings,
            round: options.round,
            spend: options.spend,
            budget: options.budget,
            maxFixInducedRatio: options.maxFixInducedRatio,
            maxRounds: options.maxRounds,
            maxFlips: options.maxFlips,
            lenses: options.lenses,
          });
          formatReviewMergeOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}

