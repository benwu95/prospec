import type { Command } from 'commander';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { COMMAND_HELP_SPECS, renderCommandHelp } from '../../types/cli-help.js';

/**
 * Register the `exclusive` command.
 *
 * Usage:
 *   prospec exclusive -- <command> [args...]
 *
 * Runs one command under the repository's test queue turn — the same queue
 * `check --record-tests` uses — and exits with that command's exit code.
 */
export function registerExclusiveCommand(program: Command): void {
  program
    .command('exclusive')
    .description('Run one command under the repository test queue turn')
    .usage('-- <command> [args...]')
    .addHelpText('after', renderCommandHelp(COMMAND_HELP_SPECS.exclusive))
    .argument('<command...>', 'The command and its arguments, after `--`; run without a shell')
    .action(async (argv: string[]) => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const { execute } = await import('../../services/exclusive.service.js');
        const { formatExclusiveOutput } = await import('../formatters/exclusive-output.js');
        const { testQueueWaitLine } = await import('../formatters/test-queue-output.js');
        const result = await execute({ argv, onQueueWait: (info) => console.error(testQueueWaitLine(info)) });
        const exitCode = formatExclusiveOutput(result);
        if (exitCode !== 0) process.exitCode = exitCode;
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
