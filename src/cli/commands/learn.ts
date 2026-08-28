import type { Command } from 'commander';
import { execute, executeYield } from '../../services/learn.service.js';
import { formatLearnUpsertOutput, formatLensYieldOutput } from '../formatters/learn-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect, parseDate, parseIntOption, parseRatio } from '../parse-options.js';

/**
 * Register the `learn` command group with the `upsert` and `yield` subcommands.
 *
 * Usage:
 *   prospec learn upsert --lesson <lesson.json>
 *   prospec learn yield [--consecutive-zero <n>] [--min-invocations <n>] [--min-yield <ratio>] [--corpus <dir>] [--json]
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

  learn
    .command('yield')
    .description(
      'Compute per-lens confirmed yield statistics and retirement recommendations from archived reviews',
    )
    .option(
      '--consecutive-zero <n>',
      'Consecutive zero-yield change threshold for retirement',
      parseIntOption('consecutive-zero', 1),
    )
    .option(
      '--min-invocations <n>',
      'Minimum invocations threshold before retirement recommendation',
      parseIntOption('min-invocations', 1),
    )
    .option(
      '--min-yield <ratio>',
      'Minimum yield threshold ratio (0.0-1.0)',
      parseRatio('min-yield'),
    )
    .option(
      '--corpus <dir>',
      'Additional archive directories to scan (repeatable)',
      collect,
      [],
    )
    .option('--json', 'Output report as JSON')
    .action(
      async (options: {
        consecutiveZero?: number;
        minInvocations?: number;
        minYield?: number;
        corpus?: string[];
        json?: boolean;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        try {
          const result = await executeYield({
            consecutiveZeroThreshold: options.consecutiveZero,
            minInvocations: options.minInvocations,
            minYield: options.minYield,
            extraCorpusDirs: options.corpus,
          });
          formatLensYieldOutput(result, { json: options.json, logLevel });
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}


