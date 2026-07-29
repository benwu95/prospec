import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { computeChangeDigest } from '../../../src/lib/drift-sources.js';

// Real git per test — the house timeout for git-bound suites (the 5s default is
// this repo's proven flake vector under full-suite concurrency).
vi.setConfig({ testTimeout: 30_000 });

/**
 * REQ-LIB-024 — BOTH git captures inside computeChangeDigest fail closed.
 *
 * The diff capture's failure branch is covered on real git (unborn HEAD, in
 * drift-sources.test.ts); the untracked-listing capture can only fail while the
 * diff succeeds under fault injection, so this file mocks child_process
 * selectively. Before issue #103 that capture fell back to `?? ''`, silently
 * dropping the untracked dimension from the digest — fail-open, the exact
 * pattern the diff branch was fixed for.
 */

const state = vi.hoisted(() => ({ failLsFiles: false }));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((file: string, args: readonly string[], opts: unknown) => {
      if (state.failLsFiles && Array.isArray(args) && args.includes('ls-files')) {
        throw new Error('simulated ls-files capture failure');
      }
      return (actual.execFileSync as (...a: unknown[]) => unknown)(file, args, opts);
    }) as typeof import('node:child_process').execFileSync,
  };
});

describe('computeChangeDigest under selective git-capture failure', () => {
  let tmpDir: string;
  // the mocked execFileSync passes everything through except ls-files under the
  // fault flag, so repo setup runs on real git
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'drift-git-capture-'));
    state.failLsFiles = false;
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    mkdirSync(path.join(tmpDir, 'src/lib'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'src/lib/x.ts'), 'export const a = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sanity: digests normally when every capture succeeds', () => {
    expect(computeChangeDigest(tmpDir)).toBeTruthy();
  });

  it('fails closed (null) when the untracked listing cannot be captured', () => {
    state.failLsFiles = true;
    expect(computeChangeDigest(tmpDir)).toBeNull();
  });
});
