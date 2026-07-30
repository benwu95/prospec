import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * REQ-LIB-033: the probe a collector classifies against must carry the caller's own
 * `cwd`, never a re-derived `process.cwd()`.
 *
 * That wiring lives in a DEFAULT ARGUMENT, and on a POSIX host every verdict is
 * `spawnable`, so no behavioural assertion can discriminate it — the only observable is
 * which probe the collector builds. Hence the module spy, and hence its own file: the
 * mock must not change how the main drift-sources suite resolves `test-runner`.
 */
vi.mock('../../../src/lib/test-runner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/test-runner.js')>();
  return { ...actual, defaultExecutableProbe: vi.fn(actual.defaultExecutableProbe) };
});

const { collectTestProvenance, computeChangeDigest } = await import(
  '../../../src/lib/drift-sources.js'
);
const { defaultExecutableProbe } = await import('../../../src/lib/test-runner.js');

// Spawns real `git` against a temp repo — the 5s default times out under suite load
// (PB-010).
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'probe-wiring-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

/** The commit keeps the collector on its normal path: with an unborn HEAD the digest is
 *  null and the collector returns source-unavailable, which is not the state being pinned. */
function initRepoWithChange(): void {
  const metadata = path.join(tmpDir, '.prospec', 'changes', 'c1');
  mkdirSync(metadata, { recursive: true });
  writeFileSync(
    path.join(metadata, 'metadata.yaml'),
    'name: c1\nstatus: implemented\nscale: standard\n',
  );
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
  };
  git('init', '--quiet');
  git('config', 'user.email', 'wiring@example.com');
  git('config', 'user.name', 'wiring');
  git('add', '.');
  git('commit', '--quiet', '-m', 'fixture');
}

describe('collectTestProvenance probe wiring', () => {
  it('builds its default probe against the collector cwd, not process.cwd()', () => {
    initRepoWithChange();
    vi.mocked(defaultExecutableProbe).mockClear();

    collectTestProvenance(tmpDir, 'pnpm test', computeChangeDigest(tmpDir));

    expect(defaultExecutableProbe).toHaveBeenCalledWith(process.env, process.platform, tmpDir);
    // The point of the assertion: the repo root is what a re-derived default would pass.
    expect(tmpDir).not.toBe(process.cwd());
  });
});
