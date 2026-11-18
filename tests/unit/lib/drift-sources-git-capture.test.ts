import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  collectGitTimestamps,
  collectKnowledgeSize,
  collectModuleDigests,
  computeChangeDigest,
  changedPathsFromWorkTree,
} from '../../../src/lib/drift-sources.js';
import { evaluateKnowledgeSize } from '../../../src/lib/drift-checker.js';
import { DEFAULT_KNOWLEDGE_TOKEN_BUDGET } from '../../../src/types/config.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

// Real git per test — the house timeout for git-bound suites (the 5s default is
// this repo's proven flake vector under full-suite concurrency).
vi.setConfig({ testTimeout: 30_000 });

/**
 * Index listing and status capture fail closed independently. Selective subprocess
 * faults prove neither failure silently discards part of the represented inputs.
 */

const state = vi.hoisted(() => ({
  failLsFiles: false,
  failExcludePathspec: false,
  failStatus: false,
  failGlobListing: false,
  failShallowProbe: false,
  timeoutCatFile: false,
  catFileTimeouts: [] as unknown[],
  showPrefixTimeouts: [] as unknown[],
  failLsTree: false,
  failAncestorLsTree: false,
  failIgnoreCaseProbe: false,
  failShowPrefix: false,
  failFullTreeLsTree: false,
  lsTreeCalls: 0,
  gitCalls: [] as string[][],
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: ((file: string, args: readonly string[], opts: unknown) => {
      if (file === 'git' && Array.isArray(args)) state.gitCalls.push([...args]);
      if (Array.isArray(args) && args[0] === 'ls-tree') {
        state.lsTreeCalls += 1;
        // the ratchet's first ls-tree lists the targets; a second one lists the ancestors
        if (state.failLsTree && state.lsTreeCalls === 1) throw new Error('simulated ls-tree failure');
        if (state.failAncestorLsTree && state.lsTreeCalls === 2) throw new Error('simulated ancestor ls-tree failure');
        if (state.failFullTreeLsTree && args.includes('--full-tree')) throw new Error('simulated project-directory ls-tree failure');
      }
      if (Array.isArray(args) && args.includes('--show-prefix')) {
        state.showPrefixTimeouts.push((opts as { timeout?: unknown } | undefined)?.timeout);
        if (state.failShowPrefix) throw new Error('simulated show-prefix failure');
      }
      if (state.failIgnoreCaseProbe && Array.isArray(args) && args.includes('core.ignorecase')) {
        throw new Error('simulated core.ignorecase probe failure');
      }
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
        args.some((a) => typeof a === 'string' && a.startsWith(':(exclude'))
      ) {
        throw new Error('simulated pathspec-magic failure');
      }
      if (state.failGlobListing && args.includes('ls-files') && args.some((a) => typeof a === 'string' && a.startsWith(':(glob)'))) {
        throw new Error('simulated glob listing failure');
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
    state.failGlobListing = false;
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
   * Folding a pathspec failure into null would report every module as never
   * committed in `knowledge_health` — a swallowed error turned into a fact,
   * the shape PB-013 exists to forbid. `:(exclude)` is the only
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
      // commit" — the swallowed-error fact PB-013 forbids. An empty exclude list could not detect that at all: no
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

  // REQ-LIB-039 — a generated-artifact glob git cannot list lifts the exclusion, never
  // leaving the module digested without files the exclusion was never proven to cover.
  describe('generated-artifact glob under a listing failure', () => {
    const digestWith = (generated: string[]) => collectModuleDigests(tmpDir, { modules: [{ name: 'lib', paths: ['src/lib'], keywords: [] }] }, {
      knowledgePath: path.join(tmpDir, 'prospec/ai-knowledge'),
      specsPath: path.join(tmpDir, 'prospec/specs'),
      generatedArtifacts: generated,
    }).get('lib')!;

    it('digests the module without any generated-artifact exclusion, literal patterns included', () => {
      writeFileSync(path.join(tmpDir, 'src/lib/gen.ts'), 'generated\n');
      writeFileSync(path.join(tmpDir, 'src/lib/other.ts'), 'authored\n');
      git('add', '.');
      git('commit', '-q', '-m', 'gen');
      const generated = ['src/lib/gen*.ts', 'src/lib/x.ts'];
      const unexcluded = digestWith([]).digest;
      expect(digestWith(generated).digest).not.toBe(unexcluded);
      state.failGlobListing = true;
      expect(digestWith(generated).digest).toBe(unexcluded);
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
 * REQ-LIB-111 — the ratchet's own fail-closed paths that a real repository cannot
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
    state.showPrefixTimeouts = [];
    state.failLsFiles = false;
    state.failLsTree = false;
    state.failAncestorLsTree = false;
    state.failIgnoreCaseProbe = false;
    state.failShowPrefix = false;
    state.failFullTreeLsTree = false;
    state.lsTreeCalls = 0;
    git('init', '-q');
    git('config', 'user.email', 'test@test.dev');
    git('config', 'user.name', 'test');
    // `git init` sets this from the filesystem (true on macOS, false on Linux); pin it so
    // the case-insensitive branch runs identically on every platform.
    git('config', 'core.ignorecase', 'true');
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
    ['null', null, 'mapping'],
    ['a bare scalar', 'HEAD', 'mapping'],
    ['a missing base', {}, 'base'],
    ['a non-string base', { base: 3 }, 'string'],
    ['an empty base', { base: '  ' }, 'empty'],
    ['an option-like base', { base: '--output=/tmp/x' }, 'which git would read as an option'],
    ['an option that merge-base would accept', { base: '--independent' }, 'which git would read as an option'],
  ])('is unresolvable for %s, before any git read', (_label, value, mentions) => {
    state.gitCalls = [];
    const src = collect(value);
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'config', reason: expect.stringContaining(mentions) });
    expect(state.gitCalls).toEqual([]);
    expect(src.items.length).toBeGreaterThan(0);
  });

  it('is unresolvable when the shallow probe itself fails (no best-effort fallthrough)', () => {
    state.failShallowProbe = true;
    expect(collect({ base: 'HEAD' }).ratchet).toMatchObject({
      status: 'unresolvable',
      cause: 'environment',
      reason: expect.stringContaining('shallow'),
    });
  });

  it.each([
    ['the target tree listing', 'failLsTree', 'could not list'],
    ['the case-insensitive index listing', 'failLsFiles', 'index'],
    ['the core.ignorecase probe', 'failIgnoreCaseProbe', 'core.ignorecase'],
  ] as const)('is unresolvable when %s fails, keeping every item unratcheted', (_label, flag, mentions) => {
    state[flag] = true;
    const src = collect({ base: 'HEAD' });
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'environment', reason: expect.stringContaining(mentions) });
    expect(src.items.every((i) => i.ratchet === undefined)).toBe(true);
  });

  it('is unresolvable when the ancestor listing for a path absent at the merge-base fails', () => {
    writeFileSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/x/NEW.md'), 'B'.repeat(400));
    git('add', '.');
    git('commit', '-q', '-m', 'new file');
    state.failAncestorLsTree = true;
    const src = collect({ base: 'HEAD~1' });
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'environment', reason: expect.stringContaining('ancestor') });
    expect(src.items.every((i) => i.ratchet === undefined)).toBe(true);
  });

  // A project below the repository root with a file absent at the merge-base (HEAD~1):
  // only then does the ratchet read the project prefix and list the project directory.
  const collectBelowRoot = () => {
    const project = path.join(tmpDir, 'proj');
    mkdirSync(path.join(project, 'prospec/ai-knowledge/modules/x'), { recursive: true });
    writeFileSync(path.join(project, 'prospec/index.md'), 'index\n');
    writeFileSync(path.join(project, 'prospec/ai-knowledge/modules/x/README.md'), 'A'.repeat(400));
    git('add', '.');
    git('commit', '-q', '-m', 'project below the root');
    writeFileSync(path.join(project, 'prospec/ai-knowledge/modules/x/NEW.md'), 'B'.repeat(400));
    git('add', '.');
    git('commit', '-q', '-m', 'new file');
    return collectKnowledgeSize(project, path.join(project, 'prospec'), path.join(project, 'prospec/ai-knowledge'), budget, [], { base: 'HEAD~1' }, true);
  };

  it.each([
    ['the project prefix probe', 'failShowPrefix', 'show-prefix'],
    ['the project directory listing', 'failFullTreeLsTree', 'project directory'],
  ] as const)('is unresolvable when %s for a path absent at the merge-base fails', (_label, flag, mentions) => {
    state[flag] = true;
    const src = collectBelowRoot();
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'environment', reason: expect.stringContaining(mentions) });
    expect(src.items.every((i) => i.ratchet === undefined)).toBe(true);
  });

  it('bounds the project prefix probe by the same 30-second git timeout', () => {
    expect(collectBelowRoot().ratchet).toMatchObject({ status: 'resolved' });
    expect(state.showPrefixTimeouts).toEqual([30_000]);
  });

  // The collector's cause decides the fix the evaluator names; a cause test built by hand
  // in the evaluator cannot see a collector that files a cause under the wrong class.
  const fixFor = (src: ReturnType<typeof collectKnowledgeSize>): string => {
    const finding = evaluateKnowledgeSize(src).findings.find((f) => f.source_path === '.prospec.yaml');
    expect(finding).toMatchObject({ severity: 'fail' });
    return finding!.detail;
  };

  it('files a shallow clone under `history`, whose fix names full history and not the base', () => {
    const shallow = mkdtempSync(path.join(os.tmpdir(), 'size-ratchet-shallow-'));
    try {
      execFileSync('git', ['clone', '-q', '--depth', '1', `file://${tmpDir}`, shallow], { stdio: 'pipe' });
      const src = collectKnowledgeSize(shallow, path.join(shallow, 'prospec'), path.join(shallow, 'prospec/ai-knowledge'), budget, [], { base: 'HEAD' }, true);
      expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'history' });
      const detail = fixFor(src);
      expect(detail).toContain('fetch-depth: 0');
      expect(detail).not.toContain('correct `knowledge.size_ratchet.base`');
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });

  it('files a base with no merge-base under `ref`, whose fix names the base, full history and a re-run', () => {
    const src = collect({ base: 'no-such-ref' });
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'ref' });
    const detail = fixFor(src);
    expect(detail).toContain('correct `knowledge.size_ratchet.base`');
    expect(detail).toContain('fetch-depth: 0');
    expect(detail).toContain('re-run');
  });

  it('does not probe core.ignorecase when no item is over budget', () => {
    writeFileSync(path.join(tmpDir, 'prospec/ai-knowledge/modules/x/README.md'), 'small\n');
    state.gitCalls = [];
    expect(collect({ base: 'HEAD' }).ratchet).toMatchObject({ status: 'resolved' });
    expect(state.gitCalls.some((args) => args.includes('core.ignorecase'))).toBe(false);
  });

  it('is unresolvable when a blob read times out, keeping every item', () => {
    state.timeoutCatFile = true;
    const src = collect({ base: 'HEAD' });
    expect(src.ratchet).toMatchObject({ status: 'unresolvable', cause: 'environment', reason: expect.stringContaining('README.md') });
    expect(src.items.find((i) => i.source_path.endsWith('modules/x/README.md'))!.ratchet).toBeUndefined();
  });
});
