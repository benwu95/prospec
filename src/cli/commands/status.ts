import type { Command } from 'commander';
import { formatStatusOutput } from '../formatters/status-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `status` command.
 *
 * Usage:
 *   prospec status
 *
 * Read-only SDD routing (REQ-CLI-023): reports each in-flight change's
 * current node, suggested next station, blocking gates and reasons — the
 * executable copy of `_status-lifecycle.md`, replacing the entry config's
 * prose derivation.
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show each in-progress change and its suggested next SDD station')
    .action(async () => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const { execute } = await import('../../services/status.service.js');
        const result = await execute({});
        formatStatusOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
