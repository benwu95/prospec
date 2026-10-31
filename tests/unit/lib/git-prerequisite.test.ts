import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';
import { probeGitWorkTree } from '../../../src/lib/git-prerequisite.js';

vi.setConfig({ testTimeout: 30_000 });

const isWindows = process.platform === 'win32';

let root: string;
let repo: string;
let outside: string;

/** A directory holding a fake `git` script, for PATH-only lookups. */
function fakeGitBin(name: string, script: string, mode = 0o755): string {
  const bin = path.join(root, `bin-${name}`);
  mkdirSync(bin, { recursive: true });
  const file = path.join(bin, 'git');
  writeFileSync(file, script);
  chmodSync(file, mode);
  return bin;
}

beforeAll(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'git-prerequisite-')));
  repo = path.join(root, 'repo');
  mkdirSync(path.join(repo, 'pkg', 'sub'), { recursive: true });
  gitIn(repo, 'init', '-q');
  outside = path.join(root, 'outside');
  mkdirSync(outside);
  return () => rmSync(root, { recursive: true, force: true });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('probeGitWorkTree', () => {
  it('reports a work tree at the repository root and in a subdirectory', () => {
    expect(probeGitWorkTree(repo)).toEqual({ state: 'work-tree' });
    expect(probeGitWorkTree(path.join(repo, 'pkg', 'sub'))).toEqual({ state: 'work-tree' });
  });

  it('reports a directory outside any repository as not a work tree, with git\'s fatal line', () => {
    vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
    const probe = probeGitWorkTree(outside);
    expect(probe.state).toBe('not-work-tree');
    expect(probe.state === 'not-work-tree' && probe.detail).toMatch(/^fatal:/);
  });

  it('reports the .git directory and a bare repository as not a work tree', () => {
    expect(probeGitWorkTree(path.join(repo, '.git'))).toEqual({ state: 'not-work-tree', detail: null });
    const bare = path.join(root, 'bare.git');
    mkdirSync(bare);
    gitIn(bare, 'init', '-q', '--bare');
    expect(probeGitWorkTree(bare)).toEqual({ state: 'not-work-tree', detail: null });
  });

  it('reports a missing directory as not a work tree instead of git missing', () => {
    const missing = path.join(root, 'does-not-exist');
    const probe = probeGitWorkTree(missing);
    expect(probe.state).toBe('not-work-tree');
    expect(probe.state === 'not-work-tree' && probe.detail).toContain(missing);
  });

  it('reports a regular file as not a work tree instead of a git failure', () => {
    const file = path.join(repo, 'not-a-dir.txt');
    writeFileSync(file, 'x');
    const probe = probeGitWorkTree(file);
    expect(probe.state).toBe('not-work-tree');
    expect(probe.state === 'not-work-tree' && probe.detail).toContain(file);
  });

  it('reports git missing when no git executable is on PATH', () => {
    vi.stubEnv('PATH', path.join(root, 'empty-bin'));
    expect(probeGitWorkTree(repo)).toEqual({ state: 'git-missing' });
  });

  it.skipIf(isWindows)('reports git failed when git --version fails too, with that failure\'s line', () => {
    vi.stubEnv('PATH', fakeGitBin('broken', '#!/bin/sh\necho "error: broken install" >&2\nexit 1\n'));
    expect(probeGitWorkTree(repo)).toEqual({ state: 'git-failed', detail: 'error: broken install' });
  });

  it.skipIf(isWindows)('reports git failed when git cannot be executed', () => {
    vi.stubEnv('PATH', fakeGitBin('noexec', '#!/bin/sh\nexit 0\n', 0o644));
    const probe = probeGitWorkTree(repo);
    expect(probe.state).toBe('git-failed');
    expect(probe.state === 'git-failed' && probe.detail).toContain('EACCES');
  });

  it.skipIf(isWindows)('reports git failed on a rev-parse timeout without running git --version', () => {
    // `git --version` answers at once, so consulting it after the timeout would yield not-work-tree.
    const script = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2"; exit 0; fi\nexec /bin/sleep 5\n';
    vi.stubEnv('PATH', fakeGitBin('slow', script));
    const probe = probeGitWorkTree(repo, 500);
    expect(probe.state).toBe('git-failed');
    expect(probe.state === 'git-failed' && probe.detail).toContain('ETIMEDOUT');
  });

  it.skipIf(isWindows)('reports the rev-parse failure line when git --version times out', () => {
    // rev-parse fails at once; only the fallback `git --version` hangs past the timeout,
    // which leaves the rev-parse spawn ample room on a loaded machine.
    const script = '#!/bin/sh\nif [ "$1" = "--version" ]; then exec /bin/sleep 30; fi\n'
      + 'echo "fatal: cannot read the repository" >&2\nexit 128\n';
    vi.stubEnv('PATH', fakeGitBin('slow-version', script));
    expect(probeGitWorkTree(repo, 3000)).toEqual({ state: 'git-failed', detail: 'fatal: cannot read the repository' });
  });

  it.skipIf(isWindows)('keeps a refused directory apart from a broken git when git --version succeeds', () => {
    const script = '#!/bin/sh\nif [ "$1" = "--version" ]; then echo "git version 2"; exit 0; fi\n'
      + 'echo "fatal: detected dubious ownership in repository" >&2\nexit 128\n';
    vi.stubEnv('PATH', fakeGitBin('refusing', script));
    expect(probeGitWorkTree(repo)).toEqual({
      state: 'not-work-tree',
      detail: 'fatal: detected dubious ownership in repository',
    });
  });
});
