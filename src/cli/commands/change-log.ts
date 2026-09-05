import { InvalidArgumentError, Option, type Command } from 'commander';
import {
  GATE_RESULTS,
  VERIFY_GRADES,
  DIMENSION_RESULTS,
  DIMENSION_ADJUDICATORS,
  DIMENSION_GRADED_BY,
  type QualityDimension,
} from '../../types/change.js';
import { formatChangeLogOutput } from '../formatters/change-log-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';
import { collect, parseDate } from '../parse-options.js';

/** `name=result[:adjudicator[:graded_by]]` → a QualityDimension, validated against the closed vocabularies. */
function parseDimension(value: string, previous: QualityDimension[]): QualityDimension[] {
  const match = /^([^=]+)=([^:]+)(?::([^:]+))?(?::([^:]+))?$/.exec(value);
  if (!match) {
    throw new InvalidArgumentError('expected name=result[:adjudicator[:graded_by]]');
  }
  const [, name, result, adjudicator, gradedBy] = match;
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
  if (gradedBy !== undefined && !(DIMENSION_GRADED_BY as readonly string[]).includes(gradedBy)) {
    throw new InvalidArgumentError(
      `graded_by must be one of: ${DIMENSION_GRADED_BY.join(', ')}`,
    );
  }
  if (gradedBy !== undefined && adjudicator !== 'judgment') {
    throw new InvalidArgumentError('graded_by applies to judgment dimensions only');
  }
  // The same honesty invariant `verify record` enforces: a judgment verdict is
  // never recorded without its grading context — this parallel write path must
  // not become the bypass.
  if (adjudicator === 'judgment' && gradedBy === undefined) {
    throw new InvalidArgumentError(
      `a judgment dimension requires its grading context: name=result:judgment:<${DIMENSION_GRADED_BY.join('|')}>`,
    );
  }
  return [
    ...previous,
    {
      name: name!.trim(),
      result: result as QualityDimension['result'],
      ...(adjudicator ? { adjudicator: adjudicator as QualityDimension['adjudicator'] } : {}),
      ...(gradedBy ? { graded_by: gradedBy as QualityDimension['graded_by'] } : {}),
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
    // Two verdict sources, mutually exclusive at BOTH layers (commander usage
    // error here, PrerequisiteError in the service): a composed entry
    // (`--result` + the station's fields), or a planning verifier report the
    // service validates against the station's schema and derives the entry from.
    .addOption(
      new Option('--result <result>', 'Gate three-state result (required unless --verifier-report)')
        .choices(GATE_RESULTS)
        .conflicts(['verifierReport']),
    )
    .addOption(
      new Option(
        '--verifier-report <file>',
        'Plan/tasks verifier report (JSON) — validated, FLAWS recorded as FAIL; excludes --result and the composed-entry fields',
      ).conflicts(['result', 'warning', 'grade', 'dimension', 'criticalsFound', 'criticalsFixed', 'majors']),
    )
    .addOption(new Option('--warning <text>', 'Warning detail (repeatable)').argParser(collect).default([]))
    .addOption(new Option('--grade <grade>', 'Verify quality grade').choices(VERIFY_GRADES))
    .addOption(
      new Option(
        '--dimension <spec>',
        'Verify dimension as name=result[:adjudicator[:graded_by]] (repeatable; judgment requires graded_by)',
      )
        .argParser(parseDimension)
        .default([] as QualityDimension[]),
    )
    .addOption(new Option('--criticals-found <n>', 'Review criticals surfaced this round').argParser(parseCount))
    .addOption(new Option('--criticals-fixed <n>', 'Review criticals fixed this round').argParser(parseCount))
    .addOption(new Option('--majors <n>', 'Review majors surfaced this round').argParser(parseCount))
    .option('--date <date>', 'Entry date (defaults to today)', parseDate)
    .option('--change <name>', 'Specify the change name')
    .action(
      async (options: {
        skill: string;
        result?: (typeof GATE_RESULTS)[number];
        verifierReport?: string;
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
          const { execute } = await import('../../services/change-log.service.js');
          const result = await execute({
            change: options.change,
            quiet: globalOpts.quiet,
            ...(options.verifierReport !== undefined
              ? {
                  verifierReport: {
                    skill: options.skill,
                    path: options.verifierReport,
                    ...(options.date !== undefined ? { date: options.date } : {}),
                  },
                }
              : options.result !== undefined
                ? {
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
                  }
                : {}),
          });
          formatChangeLogOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
