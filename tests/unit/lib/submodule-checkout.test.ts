import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn } from '../../helpers/git-fixture.js';

const reads = vi.hoisted(() => ({ revParse: 0, moveOnSecond: false, foreignTop: false }));
vi.mock('../../../src/lib/git-read.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/lib/git-read.js')>();
  return {
    ...actual,
    gitRead: (cwd: string, sub: Parameters<typeof actual.gitRead>[1], args: readonly string[] = []) => {
      const out = actual.gitRead(cwd, sub, args);
      if (sub !== 'rev-parse') return out;
      reads.revParse += 1;
      if (reads.foreignTop) return out.replace(/^[^\n]+/, actual.snapshotRoot());
      return reads.moveOnSecond && reads.revParse === 2 ? out.replace(/[a-f0-9]{40,64}\n?$/, `${'0'.repeat(40)}\n`) : out;
    },
  };
});
const { readSubmoduleCheckout } = await import('../../../src/lib/drift-sources.js');

vi.setConfig({ testTimeout: 30_000 });
let dir: string;
beforeEach(() => {
  reads.revParse = 0; reads.moveOnSecond = false; reads.foreignTop = false;
  dir = mkdtempSync(path.join(os.tmpdir(), 'submodule-checkout-'));
  gitIn(dir, 'init', '-q'); writeFileSync(path.join(dir, 'f.txt'), 'x'); gitIn(dir, 'add', '.'); gitIn(dir, 'commit', '-qm', 'base');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('readSubmoduleCheckout', () => {
  it('reads HEAD before and after the clean check', () => {
    expect(readSubmoduleCheckout(dir, 'sub')).toBe(gitIn(dir, 'rev-parse', 'HEAD'));
    expect(reads.revParse).toBe(2);
  });
  it('refuses a HEAD that moves during capture', () => {
    reads.moveOnSecond = true;
    expect(() => readSubmoduleCheckout(dir, 'sub')).toThrow(/changed during capture: sub/);
  });
  it('refuses a directory git resolves to another repository', () => {
    reads.foreignTop = true;
    expect(() => readSubmoduleCheckout(dir, 'sub')).toThrow(/own repository: sub/);
  });
});
