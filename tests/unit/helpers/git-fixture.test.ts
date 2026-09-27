import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { imageOf } from '../../helpers/git-fixture.js';

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('imageOf (test helper)', () => {
  it.skipIf(process.platform === 'win32')('differs when only a mode changed, and records a symlink by its target (M-5 pin)', () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'image-of-')));
    temps.push(root);
    writeFileSync(path.join(root, 'f'), 'x');
    chmodSync(path.join(root, 'f'), 0o644);
    symlinkSync('f', path.join(root, 'l'));
    const before = imageOf(root);
    expect(before.get('l')).toBe('link:f');
    expect(before.get('f')).toMatch(/^644:/);
    chmodSync(path.join(root, 'f'), 0o755);
    expect(imageOf(root)).not.toEqual(before);
    writeFileSync(path.join(root, 'f'), 'y');
    chmodSync(path.join(root, 'f'), 0o644);
    expect(imageOf(root)).not.toEqual(before);
  });
});
