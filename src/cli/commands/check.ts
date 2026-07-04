import type { Command } from 'commander';
import { execute } from '../../services/check.service.js';
import { formatCheckOutput } from '../formatters/check-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `check` command.
 *
 * Usage:
 *   prospec check [--json] [--strict] [--init-ci] [--record-review]
 *
 * Deterministic, zero-LLM drift check (REQ-CLI-011). `--strict` maps any
 * FAIL to exit code 1 — warn and skipped never affect the exit code.
 * `--record-review` records the active change's review baseline (REQ-CLI-012).
 */
export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run the deterministic spec/code/knowledge drift check')
    .option('--json', 'Write the machine-readable report to prospec-report.json')
    .option('--strict', 'Exit with code 1 when any check fails (CI gate)')
    .option('--init-ci', 'Scaffold .github/workflows/prospec-check.yml and exit')
    .option('--record-review', "Record the active change's review baseline and exit")
    .option('--change <name>', 'Target change for --record-review (disambiguates when several are in flight)')
    .action(
      async (options: {
        json?: boolean;
        strict?: boolean;
        initCi?: boolean;
        recordReview?: boolean;
        change?: string;
      }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            json: options.json,
            initCi: options.initCi,
            recordReview: options.recordReview,
            change: options.change,
          });
          formatCheckOutput(result, logLevel);
          if (options.strict && result.kind === 'report' && result.hasFail) {
            process.exitCode = 1;
          }
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
