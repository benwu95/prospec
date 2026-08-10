import { InvalidArgumentError, Option, type Command } from 'commander';
import { execute } from '../../services/verify-record.service.js';
import { DIMENSION_RESULTS, type QualityDimension } from '../../types/change.js';
import { formatVerifyRecordOutput } from '../formatters/verify-record-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect, parseDate } from '../parse-options.js';

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
    .option('--warning <text>', 'Budget-counted WARN detail (repeatable)', collect, [])
    .option('--date <date>', 'Entry date (defaults to today)', parseDate)
    .option('--change <name>', 'Specify the change name')
    .action(
      async (options: {
        dimension: QualityDimension[];
        dimensions?: string;
        warning: string[];
        date?: string;
        change?: string;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        try {
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            judgmentDimensions: options.dimension,
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
