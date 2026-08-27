import { InvalidArgumentError, Option, type Command } from 'commander';
import { execute } from '../../services/verify-record.service.js';
import {
  DIMENSION_GRADED_BY,
  DIMENSION_RESULTS,
  type DimensionGradedBy,
  type QualityDimension,
} from '../../types/change.js';
import { formatVerifyRecordOutput } from '../formatters/verify-record-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect, parseDate, parseIntOption } from '../parse-options.js';

/** `name=result` → a judgment QualityDimension (adjudicator is always judgment here). */
function parseJudgmentDimension(
  value: string,
  previous: QualityDimension[],
): QualityDimension[] {
  const match = /^([^=]+)=(.+)$/.exec(value);
  if (!match) {
    throw new InvalidArgumentError('expected name=result');
  }
  const [, name, result] = match;
  if (!(DIMENSION_RESULTS as readonly string[]).includes(result!)) {
    throw new InvalidArgumentError(`result must be one of: ${DIMENSION_RESULTS.join(', ')}`);
  }
  return [
    ...previous,
    {
      name: name!.trim(),
      result: result as QualityDimension['result'],
      adjudicator: 'judgment',
    },
  ];
}

/** `--executor` → a non-empty self-report; an empty value must be omitted, never written. */
function parseExecutor(value: string): string {
  if (value.trim() === '') {
    throw new InvalidArgumentError('expected a non-empty executor self-report (omit the flag instead)');
  }
  return value;
}

/**
 * Register the `verify` command group with the `record` subcommand.
 *
 * Usage:
 *   prospec verify record \
 *     --dimension delta-spec-compliance=PASS --dimension constitution=WARN \
 *     --dimension design=not-applicable --warning "SHOULD violation: …"
 *   prospec verify record --dimensions verdicts.json
 *
 * The two verdict forms are alternatives — the flag carries verdicts alone, the
 * file may also carry each dimension's summary, repro and evidence (which lands
 * in `verify.md`). Supplying both is refused here, at the flag-grammar layer.
 *
 * Machine dimensions (task-completion / knowledge / tests) are read from
 * prospec-report.json by the service — they cannot be passed here.
 */
export function registerVerifyCommand(program: Command): void {
  const verify = program.command('verify').description('Verify-station recording');

  verify
    .command('record')
    .description(
      'Compute the S/A/B/C/D grade (machine dims self-sourced from the drift report) and record it',
    )
    .option(
      '--dimension <spec>',
      'Judgment dimension verdict as name=result (repeatable; exactly the 3 judgment dimensions)',
      parseJudgmentDimension,
      [] as QualityDimension[],
    )
    .addOption(
      new Option(
        '--dimensions <file>',
        'Path to a JSON array of judgment verdicts, each optionally carrying summary/repro/evidence (alternative to --dimension)',
      )
        // Commander's own conflict declaration, so the refusal renders as the
        // usage error it is. Throwing from the action instead reached `handleError`
        // as an unrecognised class and printed "An unexpected error occurred" —
        // the message was there, under a headline that told the reader nothing.
        .conflicts('dimension'),
    )
    // The three run-level context flags belong to the flag form only — the
    // `--dimensions` file carries its context per entry, so combining them is a
    // usage error (declared to the parser, like --dimension vs --dimensions),
    // never a silent preference for one source.
    .addOption(
      new Option(
        '--graded-by <context>',
        'Grading context for the flag-form judgment verdicts (applied to each)',
      )
        .choices([...DIMENSION_GRADED_BY])
        .conflicts('dimensions'),
    )
    .addOption(
      new Option(
        '--executor <text>',
        'Self-reported grading executor (model / harness), flag form',
      )
        .argParser(parseExecutor)
        .conflicts('dimensions'),
    )
    .addOption(
      new Option('--spend <tokens>', 'Self-reported tokens spent grading (flag form)')
        .argParser(parseIntOption('spend', 0))
        .conflicts('dimensions'),
    )
    .option('--warning <text>', 'Budget-counted WARN detail (repeatable)', collect, [])
    .option('--date <date>', 'Entry date (defaults to today)', parseDate)
    .option('--change <name>', 'Specify the change name')
    .action(
      async (options: {
        dimension: QualityDimension[];
        dimensions?: string;
        gradedBy?: DimensionGradedBy;
        executor?: string;
        spend?: number;
        warning: string[];
        date?: string;
        change?: string;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        // The run-level grading context rides onto each flag-form verdict; the
        // `--dimensions` file form carries its own per-entry context, and the
        // parser refuses combining it with these flags (Option.conflicts above).
        const judgmentDimensions = options.dimension.map((d) => ({
          ...d,
          graded_by: options.gradedBy,
          ...(options.executor !== undefined ? { executor: options.executor } : {}),
          ...(options.spend !== undefined ? { spend: options.spend } : {}),
        }));
        try {
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            judgmentDimensions,
            dimensionsPath: options.dimensions,
            warnings: options.warning,
            date: options.date,
          });
          formatVerifyRecordOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
