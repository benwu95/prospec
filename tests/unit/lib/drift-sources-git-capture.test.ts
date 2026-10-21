import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  collectGitTimestamps,
  collectKnowledgeSize,
  computeChangeDigest,
  changedPathsFromWorkTree,
} from '../../../src/lib/drift-sources.js';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET } from '../../../src/types/config.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

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

const state = vi.hoisted(() => ({
  failLsFiles: false,
  failExcludePathspec: false,
  failStatus: false,
  failShallowProbe: false,
  timeoutCatFile: false,
  catFileTimeouts: [] as unknown[],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((file: string, args: readonly string[], opts: unknown) => {
      if (state.failStatus && args.includes('status')) throw new Error('simulated status capture failure');
      if (state.failShallowProbe && args.includes('--is-shallow-repository')) {
        throw new Error('simulated shallow-probe failure');
      }
      if (Array.isArray(args) && args[0] === 'cat-file') {
        state.catFileTimeouts.push((opts as { timeout?: unknown } | undefined)?.timeout);
        if (state.timeoutCatFile) throw Object.assign(new Error('spawnSync git ETIMEDOUT'), { code: 'ETIMEDOUT' });
      }
      if (state.failLsFiles && Array.isArray(args) && args.includes('ls-files')) {
        throw new Error('simulated ls-files capture failure');
      }
      if (
        state.failExcludePathspec &&
        Array.isArray(args) &&
        args.some((a) => typeof a === 'string' && a.startsWith(':(exclude)'))
      ) {
        throw new Error('simulated pathspec-magic failure');
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
    state.failStatus = false;
    state.failLsFiles = false;
    state.failExcludePathspec = false;
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

  /**
   * REQ-LIB-015 — the generated-artifact exclusion degrades to the UNEXCLUDED
   * answer, never to null.
   *
   * `isStale` reads a null source commit as "not stale", so folding a pathspec
   * failure into null would silence the staleness check for every module at
   * once — the fail-open shape PB-013 exists to forbid. `:(exclude)` is the only
   * pathspec magic here, so a git that cannot parse it must still get the
   * noisier-but-true pre-exclusion timestamp.
   */
  describe('generated-artifact exclusion under a pathspec-magic failure', () => {
    const MAP: ModuleMap = {
      modules: [
        { name: 'lib', paths: ['src/lib'], keywords: [], relationships: { depends_on: [] } },
      ],
    };

    it('falls back to the unexcluded timestamp instead of reporting no source commit', () => {
      state.failExcludePathspec = true;
      // The exclusion covers the module's ONLY source file, so the unexcluded
      // retry is the only route to a truthy answer: fold the FAILED `:(exclude)`
      // query into null instead of retrying it and this reads as "no source
      // commit", which `isStale` takes for "not stale" — the fail-open PB-013
      // forbids. An empty exclude list could not detect that at all: no
      // `:(exclude)` argv would be emitted, so the injected fault would never
      // fire. Note the fault is no longer outcome-determining on its own —
      // an exclusion covering every file also falls through to the unexcluded
      // query (REQ-LIB-039) — so what this pins is specifically the
      // capture-failure branch, and only reverting THAT reddens it.
      const r = collectGitTimestamps(tmpDir, MAP, 'knowledge', ['src/lib/x.ts']);

      expect(r.available).toBe(true);
      expect(r.modules[0]?.last_src_commit).toBeTruthy();
    });
  });

  // REQ-LIB-062 AC-2 — changedPathsFromWorkTree fails CLOSED on either capture
  // failing, never fabricating an empty (or partial) change set from a swallowed
  // error. Same fail-closed contract as computeChangeDigest above (PB-013).
  describe('changedPathsFromWorkTree fails closed on a git-capture failure', () => {
    it('sanity: returns [] on a clean tree when every capture succeeds', () => {
      expect(changedPathsFromWorkTree(tmpDir)).toEqual([]);
    });

    it('returns null when the tracked status capture fails', () => {
      // the diff carries `:(exclude)` pathspecs, so this fault trips its capture
      state.failStatus = true;
      expect(changedPathsFromWorkTree(tmpDir)).toBeNull();
    });

    it('returns null when the status capture including untracked paths fails', () => {
      state.failStatus = true;
      expect(changedPathsFromWorkTree(tmpDir)).toBeNull();
    });
  });
});

/**
 * REQ-LIB-107 — the ratchet's own fail-closed paths that a real repository cannot
 * reach on demand: a malformed `size_ratchet` value, a shallow probe that itself
 * fails, and a blob read that times out.
 */
describe('collectKnowledgeSize ratchet under selective git-capture failure', () => {
  let tmpDir: string;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe', encoding: 'utf-8' });
  const budget = { ...DEFAULT_KNOWLEDGE_TOKEN_BUDGET, l2_per_module: 50, headroom: 1.0 };
  const collect = (ratchet: unknown) =>
    collectKnowledgeSize(tmpDir, path.join(tmpDir, 'prospec'), path.join(tmpDir, 'prospec/ai-knowledge'), budget, [], ratchet, true);

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'size-ratchet-capture-'));
    state.failShallowProbe = false;
    state.timeoutCatFile = false;
    state.catFileTimeouts = [];
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    mkdirSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/x'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'prospec/index.md'), 'index\n');
    writeFileSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/x/README.md'), 'A'.repeat(400));
    git('add', '.');
    git('commit', '-q', '-m', 'init');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('sanity: resolves and reads the base with the 30-second git timeout', () => {
    expect(collect({ base: 'HEAD' }).ratchet).toMatchObject({ status: 'resolved' });
    expect(state.catFileTimeouts).toEqual([30_000]);
  });

  it.each([
    ['a bare scalar', 'HEAD', 'mapping'],
    ['a missing base', {}, 'base'],
    ['a non-string base', { base: 3 }, 'string'],
    ['an empty base', { base: '  ' }, 'empty'],
    ['an option-like base', { base: '--output=/tmp/x' }, 'which git would read as an option'],
    ['an option that merge-base would accept', { base: '--independent' }, 'which git would read as an option'],
  ])('is unresolvable for %s, before any git read', (_label, value, mentions) => {
    const src = collect(value);
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', reason: expect.stringContaining(mentions) });
    expect(state.catFileTimeouts).toEqual([]);
    expect(src.items.length).toBeGreaterThan(0);
  });

  it('is unresolvable when the shallow probe itself fails (no best-effort fallthrough)', () => {
    state.failShallowProbe = true;
    expect(collect({ base: 'HEAD' }).ratchet).toMatchObject({ status: 'unresolvable', reason: expect.stringContaining('shallow') });
  });

  it('is unresolvable when a blob read times out, keeping every item', () => {
    state.timeoutCatFile = true;
    const src = collect({ base: 'HEAD' });
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', reason: expect.stringContaining('README.md') });
    expect(src.items.find((i) => i.source_path.endsWith('modules/x/README.md'))!.ratchet).toBeUndefined();
  });
});
