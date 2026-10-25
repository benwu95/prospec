import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureSourceInventory, computeEvidenceStates } from '../../../src/lib/drift-sources.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });

let root: string;
const put = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'source-inventory-')));
  gitIn(root, 'init', '-q');
  put('src/a.ts', 'a\n');
  put('src/b.ts', 'b\n');
  gitIn(root, 'add', '.');
  gitIn(root, 'commit', '-qm', 'base');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('source inventory (REQ-LIB-070)', () => {
  it('lists tracked inputs with their index identity and untracked ones without', () => {
    put('src/new.ts', 'n\n');
    const inventory = captureSourceInventory(root);
    expect(inventory.entries.get('src/a.ts')).toEqual({ mode: '100644', oid: gitIn(root, 'rev-parse', ':src/a.ts') });
    expect(inventory.entries.get('src/new.ts')).toEqual({ mode: null, oid: null });
  });

  it('marks modified, untracked and deleted inputs as changed and leaves clean ones out', () => {
    put('src/a.ts', 'edited\n');
    put('src/new.ts', 'n\n');
    rmSync(path.join(root, 'src/b.ts'));
    const { changed } = captureSourceInventory(root);
    expect([...changed].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/new.ts']);
  });

  it('hands the same inventory over from the evidence snapshot', () => {
    put('src/a.ts', 'edited\n');
    const states = computeEvidenceStates(root);
    expect(states.inventory).toEqual(captureSourceInventory(root));
  });

  it('keeps the inventory when a later step of the snapshot fails', () => {
    symlinkSync('/etc/hosts', path.join(root, 'outside-link'));
    const states = computeEvidenceStates(root);
    expect(states.repository.digest).toBeNull();
    expect(states.inventory?.entries.has('outside-link')).toBe(true);
  });

  it('refuses an index holding unmerged entries', () => {
    gitIn(root, 'checkout', '-qb', 'side');
    put('src/a.ts', 'side\n');
    gitIn(root, 'commit', '-qam', 'side');
    gitIn(root, 'checkout', '-q', '-');
    put('src/a.ts', 'main\n');
    gitIn(root, 'commit', '-qam', 'main');
    try { gitIn(root, 'merge', 'side'); } catch { /* conflict expected */ }
    expect(() => captureSourceInventory(root)).toThrow(/unmerged/i);
    expect(computeEvidenceStates(root).inventory).toBeUndefined();
  });
});
