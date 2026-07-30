import { InvalidArgumentError, Option, type Command } from 'commander';
import { execute } from '../../services/change-log.service.js';
import {
  GATE_RESULTS,
  VERIFY_GRADES,
  DIMENSION_RESULTS,
  DIMENSION_ADJUDICATORS,
  type QualityDimension,
} from '../../types/change.js';
import { formatChangeLogOutput } from '../formatters/change-log-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect, parseDate } from '../parse-options.js';

/** `name=result[:adjudicator]` → a QualityDimension, validated against the closed vocabularies. */
function parseDimension(value: string, previous: QualityDimension[]): QualityDimension[] {
  const match = /^([^=]+)=([^:]+)(?::(.+))?$/.exec(value);
  if (!match) {
    throw new InvalidArgumentError('expected name=result[:adjudicator]');
  }
  const [, name, result, adjudicator] = match;
  if (!(DIMENSION_RESULTS as readonly string[]).includes(result!)) {
    throw new InvalidArgumentError(
      `result must be one of: ${DIMENSION_RESULTS.join(', ')}`,
    );
  }
  if (adjudicator !== undefined && !(DIMENSION_ADJUDICATORS as readonly string[]).includes(adjudicator)) {
    throw new InvalidArgumentError(
      `adjudicator must be one of: ${DIMENSION_ADJUDICATORS.join(', ')}`,
    );
  }
  return [
    ...previous,
    {
      name: name!.trim(),
      result: result as QualityDimension['result'],
      ...(adjudicator ? { adjudicator: adjudicator as QualityDimension['adjudicator'] } : {}),
    },
  ];
}

function parseCount(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || String(parsed) !== value.trim()) {
    throw new InvalidArgumentError('expected a non-negative integer');
  }
  return parsed;
}

/**
 * Register the `log` subcommand under the `change` command group.
 *
 * Usage:
 *   prospec change log --skill prospec-review --result WARN \
 *     --warning "one finding per flag" --criticals-found 1 [--change <name>]
 */
export function registerChangeLogCommand(program: Command): void {
  const changeCmd = program.commands.find((cmd) => cmd.name() === 'change');
  if (!changeCmd) return;

  changeCmd
    .command('log')
    .description('Append a structured quality_log entry to a change')
    .requiredOption('--skill <station>', 'Station name (e.g. prospec-review)')
    .addOption(
      new Option('--result <result>', 'Gate three-state result')
        .choices(GATE_RESULTS)
        .makeOptionMandatory(),
    )
    .option('--warning <text>', 'Warning detail (repeatable)', collect, [])
    .addOption(new Option('--grade <grade>', 'Verify quality grade').choices(VERIFY_GRADES))
    .option(
      '--dimension <spec>',
      'Verify dimension as name=result[:adjudicator] (repeatable)',
      parseDimension,
      [] as QualityDimension[],
    )
    .option('--criticals-found <n>', 'Review criticals surfaced this round', parseCount)
    .option('--criticals-fixed <n>', 'Review criticals fixed this round', parseCount)
    .option('--majors <n>', 'Review majors surfaced this round', parseCount)
    .option('--date <date>', 'Entry date (defaults to today)', parseDate)
    .option('--change <name>', 'Specify the change name')
    .action(
      async (options: {
        skill: string;
        result: (typeof GATE_RESULTS)[number];
        warning: string[];
        grade?: (typeof VERIFY_GRADES)[number];
        dimension: QualityDimension[];
        criticalsFound?: number;
        criticalsFixed?: number;
        majors?: number;
        date?: string;
        change?: string;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);
        try {
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            entry: {
              skill: options.skill,
              result: options.result,
              warnings: options.warning,
              ...(options.date !== undefined ? { date: options.date } : {}),
              ...(options.grade !== undefined ? { grade: options.grade } : {}),
              ...(options.dimension.length > 0 ? { dimensions: options.dimension } : {}),
              ...(options.criticalsFound !== undefined
                ? { criticals_found: options.criticalsFound }
                : {}),
              ...(options.criticalsFixed !== undefined
                ? { criticals_fixed: options.criticalsFixed }
                : {}),
              ...(options.majors !== undefined ? { majors: options.majors } : {}),
            },
          });
          formatChangeLogOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
