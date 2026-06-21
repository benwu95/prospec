import type { Command } from 'commander';
import { execute } from '../../services/upgrade.service.js';
import { formatUpgradeOutput } from '../formatters/upgrade-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `upgrade` command onto the program.
 *
 * Usage:
 *   prospec upgrade [--cwd <dir>]
 *
 * Zero-LLM project upgrade: records the running prospec version in `.prospec.yaml`
 * `version` (canonical re-serialization), re-runs agent sync, and prints a
 * migration report. It writes no docs. It is a post-init command — deliberately
 * NOT in INIT_COMMANDS — so the config-existence gate blocks it on an
 * uninitialized project (ConfigNotFound → run `prospec init`). The judgment steps
 * (refresh init-created doc formats with consent, translate new-skill triggers)
 * are deferred to the /prospec-upgrade skill, never written here.
 */
export function registerUpgradeCommand(program: Command): void {
  program
    .command('upgrade')
    .description('Refresh canonical docs + agent config to the current prospec version, then hand off to /prospec-upgrade')
    .option('--cwd <dir>', 'Project root to upgrade (default: current directory)')
    .action(async (options: { cwd?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      try {
        const result = await execute({ cwd: options.cwd });
        formatUpgradeOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
