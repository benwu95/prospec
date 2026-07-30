import type { Command } from 'commander';

/**
 * Register the `knowledge` command group.
 *
 * The group's subcommands live in their own files (`knowledge init`,
 * `knowledge update`). The old deprecated `knowledge generate` subcommand was
 * removed with the cli-first turn (issue #107): README/index content
 * generation is LLM judgment and belongs to /prospec-knowledge-generate — the
 * CLI carries only deterministic operations.
 */
export function registerKnowledgeCommand(program: Command): Command {
  return program
    .command('knowledge')
    .description('AI Knowledge management');
}
