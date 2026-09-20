import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerVerifyCommand } from '../../../src/cli/commands/verify-record.js';
import { execute as executeContext } from '../../../src/services/verify-context.service.js';

vi.mock('../../../src/services/verify-context.service.js', () => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/cli/formatters/verify-record-output.js', () => ({
  formatVerifyRecordOutput: vi.fn(),
  formatVerifyContextOutput: vi.fn(),
}));

describe('verify command context subcommand (REQ-SERVICES-115, REQ-TESTS-123)', () => {
  beforeEach(() => {
    vi.mocked(executeContext).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates verify context --change to verify-context service', async () => {
    const program = new Command();
    registerVerifyCommand(program);
    vi.mocked(executeContext).mockResolvedValue({
      changeName: 'my-change',
      contextPath: '.prospec/changes/my-change/verify-context.json',
      contextId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    await program.parseAsync(['node', 'prospec', 'verify', 'context', '--change', 'my-change']);

    expect(executeContext).toHaveBeenCalledWith(
      expect.objectContaining({
        change: 'my-change',
      }),
    );
  });

  it('calls formatVerifyContextOutput with service result', async () => {
    const { formatVerifyContextOutput } = await import(
      '../../../src/cli/formatters/verify-record-output.js'
    );
    const program = new Command();
    registerVerifyCommand(program);
    const mockResult = {
      changeName: 'my-change',
      contextPath: '.prospec/changes/my-change/verify-context.json',
      contextId: 'abc123id',
    };
    vi.mocked(executeContext).mockResolvedValue(mockResult);

    await program.parseAsync(['node', 'prospec', 'verify', 'context', '--change', 'my-change']);

    expect(formatVerifyContextOutput).toHaveBeenCalledWith(mockResult, 'normal');
  });

  it('delegates to verify-context service with undefined change when --change is omitted', async () => {
    const program = new Command();
    registerVerifyCommand(program);
    vi.mocked(executeContext).mockResolvedValue({
      changeName: 'resolved-change',
      contextPath: '.prospec/changes/resolved-change/verify-context.json',
      contextId: 'def456id',
    });

    await program.parseAsync(['node', 'prospec', 'verify', 'context']);

    expect(executeContext).toHaveBeenCalledWith(
      expect.objectContaining({
        change: undefined,
      }),
    );
  });
});
