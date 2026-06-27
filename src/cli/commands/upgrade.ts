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
    .option('--no-interactive', 'Never prompt; just print the migration report (for CI and the /prospec-upgrade skill)')
    .action(async (options: { cwd?: string; interactive?: boolean }) => {
      const globalOpts = program.opts<GlobalOptions>();
      const logLevel = resolveLogLevel(globalOpts);

      // Prompt to fill nudges only on an interactive terminal (like `prospec init`),
      // and never when --no-interactive is passed. A non-TTY stdin (piped, CI, or
      // the skill's Bash call) falls back to the report — it never blocks on a prompt.
      // commander maps --no-interactive to options.interactive === false.
      const interactive = options.interactive !== false && Boolean(process.stdin.isTTY);

      try {
        const result = await execute({ cwd: options.cwd, interactive });
        formatUpgradeOutput(result, logLevel);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
