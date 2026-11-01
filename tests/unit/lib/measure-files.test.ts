import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { listRepoFiles } from '../../../scripts/measure/assemble.js';
import { gitIn } from '../../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 30_000 });
let cwd: string;
beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), 'prospec-measure-files-'));
  mkdirSync(path.join(cwd, 'src'));
  writeFileSync(path.join(cwd, 'src/main.ts'), '');
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('measurement project files', () => {
  it('uses index members, excluding unstaged local files', async () => {
    gitIn(cwd, 'init', '-q');
    gitIn(cwd, 'add', '.');
    writeFileSync(path.join(cwd, 'src/scratch.ts'), '');
    expect(await listRepoFiles(cwd)).toEqual(['src/main.ts']);
  });

  it('refuses unavailable project membership', async () => {
    await expect(listRepoFiles(cwd)).rejects.toThrow('git index unavailable');
  });
});
