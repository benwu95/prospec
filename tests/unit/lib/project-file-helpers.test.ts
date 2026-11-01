import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitPathspecs, pathspecCovers } from '../../../src/lib/knowledge-reader.js';
import { nonDirectoryAncestor } from '../../../src/lib/fs-utils.js';
import { nonDirectoryAncestor as driftAncestor } from '../../../src/lib/drift-sources.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('shared project file helpers', () => {
  it('preserves literal, glob, exclusion and refusal pathspec semantics', () => {
    const cwd = process.cwd();
    expect(gitPathspecs(cwd, ['src', 'src/**', ':bad', '../outside', '.'])).toEqual([
      ':(literal)src', ':(glob)src/**', ':(literal).',
    ]);
    expect(gitPathspecs(cwd, ['src'], true)).toEqual([':(exclude,literal)src']);
    expect(pathspecCovers('src', 'src/a.ts')).toBe(true);
    expect(pathspecCovers('src', 'src-other/a.ts')).toBe(false);
    expect(pathspecCovers('', 'anywhere')).toBe(true);
  });

  it('preserves the drift export and refuses traversal through non-directory ancestors', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'prospec-file-helper-'));
    roots.push(root);
    mkdirSync(path.join(root, 'dir'));
    writeFileSync(path.join(root, 'file'), '');
    expect(driftAncestor).toBe(nonDirectoryAncestor);
    expect(nonDirectoryAncestor(root, 'dir/member.ts')).toBeNull();
    expect(nonDirectoryAncestor(root, 'missing/member.ts')).toBeNull();
    expect(nonDirectoryAncestor(root, 'file/member.ts')).toBe('file');
    if (process.platform !== 'win32') {
      symlinkSync('dir', path.join(root, 'link'));
      expect(nonDirectoryAncestor(root, 'link/member.ts')).toBe('link');
    }
  });
});
