import { Argument, type Command } from 'commander';
import { VALIDATE_KINDS, type ValidateKind } from '../../types/station.js';
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
 *   prospec validate module-readme <module>
 *   prospec validate candidates [--change <name>]
 *
 * A failing verdict exits 1 — this is a machine gate, like `check --strict`.
 */
export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Machine verdicts for artifact structure (proposal / slug / backfill-draft / promote-scaffold / design-spec / module-readme / candidates)')
    .addArgument(new Argument('<kind>', 'Artifact kind').choices(VALIDATE_KINDS))
    .argument('[target]', 'Slug/module name, an explicit artifact path, or (proposal/candidates) a change name')
    .option('--json', 'Emit the structural verdict and facts as JSON')
    .option('--change <name>', 'Change providing the default artifact path')
    .action(async (kind: ValidateKind, target: string | undefined, options: { change?: string; json?: boolean }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);
      try {
        const { execute } = await import('../../services/validate.service.js');
        const { formatValidateOutput } = await import('../formatters/validate-output.js');
        const result = await execute({
          kind,
          target,
          change: options.change,
          quiet: globalOpts.quiet,
        });
        if (options.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
        else formatValidateOutput(result, logLevel);
        if (!result.ok) {
          process.exitCode = 1;
        }
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
