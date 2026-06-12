import pc from 'picocolors';
import type { McpServeResult } from '../../services/mcp.service.js';

/**
 * Serve diagnostics go to STDERR by design (REQ-MCP-001): stdout is the MCP
 * JSON-RPC channel — any non-protocol byte there corrupts the session.
 */
export function formatMcpServeOutput(result: McpServeResult): void {
  process.stderr.write(
    `${pc.green('✓')} ${result.serverName} MCP server v${result.version} serving on stdio\n` +
      `  ${pc.dim('knowledge:')} ${result.knowledgePath}\n` +
      `  ${pc.dim('specs:')} ${result.featuresDir}\n`,
  );
}
