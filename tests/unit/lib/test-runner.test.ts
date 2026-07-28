import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import { runTestCommand, tokenizeCommand } from '../../../src/lib/test-runner.js';

/**
 * REQ-LIB-033 — the one place the drift engine executes a project command.
 * Tests use trivial external commands (node itself), never the project suite,
 * so running them can never recurse into vitest.
 */

// Spawns a real node child per test — see the note in check.service.test.ts.
vi.setConfig({ testTimeout: 30_000 });

const NODE = process.execPath;

describe('tokenizeCommand', () => {
  it('splits on whitespace and drops empty tokens', () => {
    expect(tokenizeCommand('  pnpm   test  ')).toEqual(['pnpm', 'test']);
  });

  it('does NOT interpret quoting — the no-shell contract is deliberate', () => {
    expect(tokenizeCommand('pytest -k "my test"')).toEqual(['pytest', '-k', '"my', 'test"']);
  });

  it('returns an empty argv for an empty command', () => {
    expect(tokenizeCommand('   ')).toEqual([]);
  });
});

describe('runTestCommand', () => {
  it('reports exit code 0 for a passing command', () => {
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(0)`);
    expect(r).toMatchObject({ exit_code: 0, timed_out: false });
    expect(r.command).toContain('-e');
  });

  it('reports the non-zero exit code of a failing command (never throws)', () => {
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(3)`);
    expect(r).toMatchObject({ exit_code: 3, timed_out: false });
  });

  it('reports a timeout without an exit code so no baseline is recorded', () => {
    // Busy-wait rather than sleep: the child must outlive the timeout window.
    const r = runTestCommand(os.tmpdir(), `${NODE} -e while(true){}`, 300);
    expect(r.timed_out).toBe(true);
    expect(r.exit_code).toBeNull();
  });

  it('reports an unrunnable command as an error, not a pass', () => {
    const r = runTestCommand(os.tmpdir(), 'definitely-not-an-installed-binary-xyz');
    expect(r.exit_code).toBeNull();
    expect(r.error).toBeTruthy();
  });

  it('refuses an empty command instead of spawning a shell', () => {
    const r = runTestCommand(os.tmpdir(), '   ');
    expect(r).toMatchObject({ exit_code: null, timed_out: false });
    expect(r.error).toContain('empty test command');
  });

  it('does not interpret shell syntax — a pipeline is passed as literal argv', () => {
    // `node -e process.exit(0) | true` would exit 0 under a shell; without one,
    // the extra tokens reach node as arguments and it still exits 0 — the point
    // is that no shell is involved, so `|` is never a pipe.
    const r = runTestCommand(os.tmpdir(), `${NODE} -e process.exit(7) | true`);
    expect(r.exit_code).toBe(7);
  });
});
