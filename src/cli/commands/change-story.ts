import { InvalidArgumentError, type Command } from 'commander';
import { formatChangeStoryOutput, formatChangeAcceptanceOutput } from '../formatters/change-story-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `change` command group with `story` subcommand.
 *
 * Usage:
 *   prospec change story <name> [--description <desc>]
 *   prospec change story <name> --freeze-scenarios
 *   prospec change story <name> --amend-scenarios --reason <text> --expected-digest <sha256>
 *
 * The parent `change` command is a command group (no action).
 * `story` is the subcommand that creates a change story directory or freezes/amends acceptance scenarios.
 */
export function registerChangeCommand(program: Command): void {
  const change = program
    .command('change')
    .description('Change management');

  change
    .command('story')
    .description('Create a change request or freeze/amend acceptance scenarios')
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
    .option(
      '--issue <ref>',
      'External tracker item this change belongs to (free-form: `#131`, a URL, another tracker id)',
    )
    .option(
      '--freeze-scenarios',
      'Freeze substantive acceptance scenarios from proposal into baseline',
    )
    .option(
      '--amend-scenarios',
      'Amend frozen acceptance scenarios with an updated baseline',
    )
    .option(
      '--reason <text>',
      'Reason for amending acceptance scenarios (required for --amend-scenarios)',
    )
    .option(
      '--expected-digest <sha256>',
      'Current expected digest before amendment (required for --amend-scenarios)',
    )
    .action(
      async (
        name: string,
        options: {
          description?: string;
          relatedModule: string[];
          introducedBy?: string;
          issue?: string;
          freezeScenarios?: boolean;
          amendScenarios?: boolean;
          reason?: string;
          expectedDigest?: string;
        },
      ) => {
        if (options.freezeScenarios && options.amendScenarios) {
          throw new InvalidArgumentError('Cannot specify both --freeze-scenarios and --amend-scenarios');
        }
        if (options.freezeScenarios || options.amendScenarios) {
          if (
            options.description !== undefined ||
            options.relatedModule.length > 0 ||
            options.introducedBy !== undefined ||
            options.issue !== undefined
          ) {
            throw new InvalidArgumentError(
              'Mutation flags (--freeze-scenarios, --amend-scenarios) cannot be combined with create options',
            );
          }
        }
        if (options.amendScenarios) {
          if (!options.reason) {
            throw new InvalidArgumentError('--amend-scenarios requires --reason');
          }
          if (!options.expectedDigest) {
            throw new InvalidArgumentError('--amend-scenarios requires --expected-digest');
          }
        } else {
          if (options.reason !== undefined) {
            throw new InvalidArgumentError('--reason can only be used with --amend-scenarios');
          }
          if (options.expectedDigest !== undefined) {
            throw new InvalidArgumentError('--expected-digest can only be used with --amend-scenarios');
          }
        }

        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        if (options.freezeScenarios || options.amendScenarios) {
          try {
            const { execute } = await import('../../services/change-acceptance.service.js');
            const result = await execute({
              name,
              mode: options.freezeScenarios ? 'freeze' : 'amend',
              reason: options.reason,
              expectedDigest: options.expectedDigest,
            });
            formatChangeAcceptanceOutput(result, logLevel);
          } catch (err) {
            handleError(err, globalOpts.verbose ?? false);
          }
          return;
        }

        try {
          const { execute } = await import('../../services/change-story.service.js');
          const result = await execute({
            name,
            description: options.description,
            ...(options.relatedModule.length > 0
              ? { relatedModules: options.relatedModule }
              : {}),
            ...(options.introducedBy ? { introducedBy: options.introducedBy } : {}),
            // `!== undefined`, not truthiness: a blank value is forwarded so the
            // service's `normalizeIssueRef` stays the ONE place blank is judged.
            ...(options.issue !== undefined ? { issue: options.issue } : {}),
          });
          formatChangeStoryOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}

