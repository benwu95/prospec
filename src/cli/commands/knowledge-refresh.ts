import type { Command } from 'commander';
import { execute } from '../../services/raw-scan.service.js';
import { formatKnowledgeRefreshOutput } from '../formatters/knowledge-refresh-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';
import { parseDepth } from '../parse-options.js';
import { resolveLogLevel } from '../log-level.js';

/**
 * Register the `refresh` subcommand under the `knowledge` command group.
 *
 * Usage:
 *   prospec knowledge refresh [--dry-run] [--depth <n>]
 *
 * Regenerates ONLY raw-scan.md from the current source code (deterministic, no
 * LLM). Unlike `knowledge init`, it never creates or overwrites the curated
 * module-map.yaml / _index.md / _conventions.md.
 */
export function registerKnowledgeRefreshCommand(
  knowledge: Command,
  program: Command,
): void {
  knowledge
    .command('refresh')
    .description(
      'Regenerate raw-scan.md from current code (deterministic, no LLM); leaves curated files untouched',
    )
    .option('--dry-run', 'Preview only, do not write files')
    .option('--depth <n>', 'Directory scan depth', parseDepth, 10)
    .action(
      async (options: { dryRun?: boolean; depth?: number }) => {
        const globalOpts = program.opts<GlobalOptions>();
        const logLevel = resolveLogLevel(globalOpts);

        try {
          const result = await execute({
            dryRun: options.dryRun,
            depth: options.depth,
          });
          formatKnowledgeRefreshOutput(result, logLevel);
        } catch (err) {
          handleError(err, globalOpts.verbose ?? false);
        }
      },
    );
}
