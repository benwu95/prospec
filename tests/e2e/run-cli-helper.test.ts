/**
 * Isolation contract for the in-process e2e runner (`runCliInProcess`).
 *
 * The whole e2e suite depends on this helper leaving no global state behind —
 * cwd, PROSPEC_MOCK_HOME, process.exitCode, and the stdout/stderr write patches
 * must all be restored after every call, or a later test would "pass" on a
 * previous test's leaked state (the classic in-process false green).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';

// In-process runs still shell out to git via the drift/status services; keep the
// generous file-level timeout the git-bound e2e files use (PB-010).
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-e2e-helper-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('runCliInProcess', () => {
  it('captures stdout and a zero exit code (--version)', async () => {
    const { stdout, stderr, exitCode } = await runCliInProcess(['--version'], { cwd: tmpDir });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(stderr).toBe('');
  });

  it('captures stderr and a non-zero exit code (ConfigNotFound)', async () => {
    const { stdout, stderr, exitCode } = await runCliInProcess(['check'], { cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('.prospec.yaml');
    expect(stdout).toBe('');
  });

  it('restores cwd, process.exitCode, env, stdout/stderr, and console.* after a failing run', async () => {
    const origCwd = process.cwd();
    const origExit = process.exitCode;
    const origOut = process.stdout.write;
    const origErr = process.stderr.write;
    // console.* is patched too (vitest intercepts console, so a stream patch
    // alone would miss formatter output) — its restoration is part of the same
    // isolation contract and must be pinned here, or removing it goes unnoticed.
    const origConsole = {
      log: console.log,
      info: console.info,
      debug: console.debug,
      warn: console.warn,
      error: console.error,
    };
    const hadMockHome = 'PROSPEC_MOCK_HOME' in process.env;

    // This run sets process.exitCode = 1 internally — it must not leak out.
    await runCliInProcess(['check'], { cwd: tmpDir });

    expect(process.cwd()).toBe(origCwd);
    expect(process.exitCode).toBe(origExit);
    expect(process.stdout.write).toBe(origOut);
    expect(process.stderr.write).toBe(origErr);
    expect(console.log).toBe(origConsole.log);
    expect(console.info).toBe(origConsole.info);
    expect(console.debug).toBe(origConsole.debug);
    expect(console.warn).toBe(origConsole.warn);
    expect(console.error).toBe(origConsole.error);
    expect('PROSPEC_MOCK_HOME' in process.env).toBe(hadMockHome);
  });

  it('gives each call a fresh output buffer (no cross-call leakage)', async () => {
    const version = await runCliInProcess(['--version'], { cwd: tmpDir });
    const help = await runCliInProcess(['--help'], { cwd: tmpDir });
    expect(version.stdout).not.toContain('Usage:');
    expect(help.stdout).toContain('Usage:');
    expect(help.stdout).not.toBe(version.stdout);
  });
});
