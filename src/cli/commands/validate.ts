import { Argument, type Command } from 'commander';
import { VALIDATE_KINDS, type ValidateKind } from '../../types/station.js';
import { formatValidateOutput } from '../formatters/validate-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `validate` command.
 *
 * Usage:
 *   prospec validate slug user-profile
 *   prospec validate backfill-draft [path] [--change <name>]
 *   prospec validate promote-scaffold [--change <name>]
 *   prospec validate design-spec [path] [--change <name>]
 *
 * A failing verdict exits 1 — this is a machine gate, like `check --strict`.
 */
export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Machine verdicts for artifact structure (slug / backfill-draft / promote-scaffold / design-spec)')
    .addArgument(new Argument('<kind>', 'Artifact kind').choices(VALIDATE_KINDS))
    .argument('[target]', 'Slug name, or an explicit artifact path')
    .option('--change <name>', 'Change providing the default artifact path')
    .action(async (kind: ValidateKind, target: string | undefined, options: { change?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/validate.service.js');
        const result = await execute({
          kind,
          target,
          change: options.change,
          quiet: globalOpts.quiet,
        });
        formatValidateOutput(result, logLevel);
        if (!result.ok) {
          process.exitCode = 1;
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
