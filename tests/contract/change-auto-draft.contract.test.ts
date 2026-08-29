import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createProgram } from '../../src/cli/program.js';
import { CHANGE_SCALES } from '../../src/types/change.js';

let stdoutOutput: string[] = [];
let stderrOutput: string[] = [];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutOutput = [];
  stderrOutput = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdoutOutput.push(String(chunk));
    return true;
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderrOutput.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

describe('change auto-draft Contract', () => {
  it('registers auto-draft command with help text', async () => {
    const program = createProgram();
    try {
      await program.parseAsync(['node', 'prospec', 'change', 'auto-draft', '--help']);
    } catch (err) {
      if ((err as { exitCode?: number }).exitCode !== 0) throw err;
    }
    const output = stdoutOutput.join('');
    expect(output).toContain('Usage: prospec change auto-draft');
    expect(output).toContain('--target');
    expect(output).toContain('--reason');
    expect(output).toContain('--from-report');
    expect(output).toContain('--check');
    expect(output).toContain('--scale');
    expect(output).toContain('--dry-run');
  });

  it('registers check command with --auto-draft option in help', async () => {
    const program = createProgram();
    try {
      await program.parseAsync(['node', 'prospec', 'check', '--help']);
    } catch (err) {
      if ((err as { exitCode?: number }).exitCode !== 0) throw err;
    }
    const output = stdoutOutput.join('');
    expect(output).toContain('--auto-draft');
    expect(output).toContain('Auto-draft fix changes for detected FAIL/WARN findings');
    // Named for its scope: `check`'s other writes are unaffected by it, so a
    // bare `--dry-run` here would promise something the flag does not keep.
    expect(output).toContain('--auto-draft-dry-run');
    expect(output).not.toMatch(/^\s*--dry-run\b/m);
  });

  it('constrains --scale to the change-scale vocabulary', async () => {
    const program = createProgram();
    try {
      await program.parseAsync(['node', 'prospec', 'change', 'auto-draft', '--help']);
    } catch (err) {
      if ((err as { exitCode?: number }).exitCode !== 0) throw err;
    }
    const output = stdoutOutput.join('');
    for (const scale of CHANGE_SCALES) {
      expect(output).toContain(scale);
    }
  });
});
