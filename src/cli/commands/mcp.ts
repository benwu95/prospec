import type { Command } from 'commander';
import { execute } from '../../services/mcp.service.js';
import { formatMcpServeOutput } from '../formatters/mcp-output.js';
import { handleError } from '../formatters/error-output.js';
import type { GlobalOptions } from '../index.js';

/**
 * Register the `mcp` command.
 *
 * Usage:
 *   prospec mcp serve
 *
 * Starts the read-only MCP server on stdio (REQ-MCP-001). The action writes
 * nothing to stdout — that channel belongs to the protocol; the startup
 * banner and all errors go to stderr.
 */
export function registerMcpCommand(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Model Context Protocol server (read-only project truth)');

  mcp
    .command('serve')
    .description('Start the read-only MCP server on stdio')
    .option(
      '--cwd <path>',
      'Project root to serve (default: current directory). Pin a specific project so the ' +
        'server resolves its .prospec.yaml regardless of where the agent launched it — lets one ' +
        'agent register several project servers at once',
    )
    .action(async (options: { cwd?: string }) => {
      const globalOpts = program.opts<GlobalOptions>();
      try {
        const result = await execute({ cwd: options.cwd });
        formatMcpServeOutput(result);
      } catch (err) {
        handleError(err, globalOpts.verbose ?? false);
      }
    });
}
