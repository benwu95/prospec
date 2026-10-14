import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTestEvidencePolicy } from '../../../src/lib/config.js';
import { ProspecConfigSchema } from '../../../src/types/config.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'test-policy-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const config = (basePath?: string) => ProspecConfigSchema.parse({
  project: { name: 'test' }, test_evidence: { exclude_knowledge: true },
  ...(basePath === undefined ? {} : { knowledge: { base_path: basePath } }),
});

describe('resolveTestEvidencePolicy', () => {
  it('requires explicit opt-in without inspecting an unsafe unused path', () => {
    for (const policy of [undefined, { exclude_knowledge: false }]) {
      const value = config('../outside');
      value.test_evidence = policy;
      expect(resolveTestEvidencePolicy(value, root)).toBeUndefined();
    }
  });
  it('resolves defaults, base_dir, and independent knowledge paths', () => {
    expect(resolveTestEvidencePolicy(config(), root)).toEqual({ version: 1, excluded_path: 'prospec/ai-knowledge' });
    const value = config(); value.paths = { base_dir: 'docs/specs' };
    expect(resolveTestEvidencePolicy(value, root)?.excluded_path).toBe('docs/specs/ai-knowledge');
    value.knowledge = { base_path: 'docs/knowledge' };
    expect(resolveTestEvidencePolicy(value, root)?.excluded_path).toBe('docs/knowledge');
  });
  it('accepts missing and recreated ordinary directories with the same descriptor', () => {
    const before = resolveTestEvidencePolicy(config('docs/knowledge'), root);
    mkdirSync(path.join(root, 'docs/knowledge'), { recursive: true });
    expect(resolveTestEvidencePolicy(config('docs/knowledge'), root)).toEqual(before);
    rmSync(path.join(root, 'docs/knowledge'), { recursive: true });
    expect(resolveTestEvidencePolicy(config('docs/knowledge'), root)).toEqual(before);
  });
  it('uses filesystem spelling for existing aliases and preserves missing path segments', () => {
    mkdirSync(path.join(root, 'Docs/Knowledge'), { recursive: true });
    const aliases = existsSync(path.join(root, 'DOCS/KNOWLEDGE'));
    expect(resolveTestEvidencePolicy(config('DOCS/KNOWLEDGE'), root)?.excluded_path)
      .toBe(aliases ? 'Docs/Knowledge' : 'DOCS/KNOWLEDGE');
    expect(resolveTestEvidencePolicy(config('DOCS/KNOWLEDGE/Missing/Tail'), root)?.excluded_path)
      .toBe(aliases ? 'Docs/Knowledge/Missing/Tail' : 'DOCS/KNOWLEDGE/Missing/Tail');
    expect(resolveTestEvidencePolicy(config('Docs/Knowledge'), root)?.excluded_path).toBe('Docs/Knowledge');
    if (!aliases) {
      mkdirSync(path.join(root, 'DOCS/KNOWLEDGE'), { recursive: true });
      expect(resolveTestEvidencePolicy(config('DOCS/KNOWLEDGE'), root)?.excluded_path).toBe('DOCS/KNOWLEDGE');
    }
  });

  it.skipIf(process.platform === 'win32')('refuses symlink topology behind an aliased ordinary ancestor', () => {
    mkdirSync(path.join(root, 'Docs/Knowledge'), { recursive: true });
    symlinkSync('Knowledge', path.join(root, 'Docs/Link'));
    const ancestor = existsSync(path.join(root, 'DOCS')) ? 'DOCS' : 'Docs';
    for (const tail of ['Link', 'Link/missing']) {
      expect(() => resolveTestEvidencePolicy(config(`${ancestor}/${tail}`), root)).toThrow(/ordinary directory/);
    }
  });

  it.each(['.', '..', '../outside', '.prospec.yaml'])('rejects unsafe scope %s', (value) => {
    expect(() => resolveTestEvidencePolicy(config(value), root)).toThrow();
  });
  it('rejects a regular-file ancestor', () => {
    writeFileSync(path.join(root, 'docs'), 'file');
    expect(() => resolveTestEvidencePolicy(config('docs/knowledge'), root)).toThrow();
  });
  it.skipIf(process.platform === 'win32')('rejects root and ancestor symlinks even within the project', () => {
    mkdirSync(path.join(root, 'real'));
    symlinkSync('real', path.join(root, 'alias'));
    for (const value of ['alias', 'alias/missing']) {
      expect(() => resolveTestEvidencePolicy(config(value), root)).toThrow();
    }
  });
});
