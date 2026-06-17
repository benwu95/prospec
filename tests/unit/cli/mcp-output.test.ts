import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMcpServeOutput } from '../../../src/cli/formatters/mcp-output.js';
import type { McpServeResult } from '../../../src/services/mcp.service.js';

function makeResult(overrides: Partial<McpServeResult> = {}): McpServeResult {
  return {
    kind: 'serve',
    serverName: 'prospec',
    version: '1.2.3',
    knowledgePath: '/repo/prospec/ai-knowledge',
    featuresDir: '/repo/prospec/features',
    ...overrides,
  };
}

describe('formatMcpServeOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes diagnostics to stderr, never stdout, so the JSON-RPC channel stays clean', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    formatMcpServeOutput(makeResult());

    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('renders server name, version, knowledge path and features dir from the result', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    formatMcpServeOutput(
      makeResult({
        serverName: 'my-server',
        version: '9.9.9',
        knowledgePath: '/abs/knowledge/dir',
        featuresDir: '/abs/features/dir',
      }),
    );

    const out = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('my-server MCP server v9.9.9 serving on stdio');
    expect(out).toContain('knowledge:');
    expect(out).toContain('/abs/knowledge/dir');
    expect(out).toContain('specs:');
    expect(out).toContain('/abs/features/dir');
  });

  it('emits a single write ending in a trailing newline', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    formatMcpServeOutput(makeResult());

    const out = String(stderr.mock.calls[0][0]);
    expect(out.endsWith('\n')).toBe(true);
    // three logical lines: status, knowledge, specs
    expect(out.split('\n').filter((line) => line.length > 0)).toHaveLength(3);
  });

  it('reflects distinct version values in the status line', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    formatMcpServeOutput(makeResult({ version: '0.0.1-beta' }));

    const out = stderr.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('serving on stdio');
    expect(out).toContain('v0.0.1-beta');
    expect(out).not.toContain('v1.2.3');
  });
});
