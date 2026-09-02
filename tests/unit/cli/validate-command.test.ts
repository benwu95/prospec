import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { registerValidateCommand } from '../../../src/cli/commands/validate.js';
import { execute } from '../../../src/services/validate.service.js';
import { formatValidateOutput } from '../../../src/cli/formatters/validate-output.js';

vi.mock('../../../src/services/validate.service.js', () => ({
  execute: vi.fn(),
}));

vi.mock('../../../src/cli/formatters/validate-output.js', () => ({
  formatValidateOutput: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(execute).mockReset();
  vi.mocked(formatValidateOutput).mockReset();
  process.exitCode = undefined;
});

afterEach(() => {
  process.exitCode = undefined;
});

describe('validate command', () => {
  it('documents module-readme as a focused validation kind', () => {
    const program = new Command();
    registerValidateCommand(program);

    expect(program.commands[0]!.description()).toContain('module-readme');
  });

  it('lazy-loads the validation boundary only on action and preserves a failing module-readme exit code', async () => {
    const program = new Command();
    registerValidateCommand(program);
    vi.mocked(execute).mockResolvedValue({
      kind: 'module-readme',
      target: 'services',
      ok: false,
      findings: [{ level: 'FAIL', message: 'line 4: format marker is missing' }],
    });

    expect(execute).not.toHaveBeenCalled();
    expect(formatValidateOutput).not.toHaveBeenCalled();

    await program.parseAsync(['node', 'prospec', 'validate', 'module-readme', 'services']);

    expect(execute).toHaveBeenCalledWith({
      kind: 'module-readme',
      target: 'services',
      change: undefined,
      quiet: undefined,
    });
    expect(formatValidateOutput).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'module-readme', target: 'services', ok: false }),
      'normal',
    );
    expect(process.exitCode).toBe(1);
  });
});
