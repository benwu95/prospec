import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTestEvidencePolicy } from '../../../src/lib/config.js';
import { ProspecConfigSchema } from '../../../src/types/config.js';

let root: string;
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'test-policy-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
// base_dir is set after parsing: config validation refuses most of these values
// before any caller reaches the policy, so the function is exercised on its own.
const config = (baseDir?: string) => {
  const value = ProspecConfigSchema.parse({ project: { name: 'test' }, test_evidence: { exclude_knowledge: true } });
  if (baseDir !== undefined) value.paths = { base_dir: baseDir };
  return value;
};

describe('resolveTestEvidencePolicy', () => {
  it('requires explicit opt-in without inspecting an unsafe unused path', () => {
    for (const policy of [undefined, { exclude_knowledge: false }]) {
      const value = config('../outside');
      value.test_evidence = policy;
      expect(resolveTestEvidencePolicy(value, root)).toBeUndefined();
    }
  });
  it('resolves the default and base_dir Knowledge paths', () => {
    expect(resolveTestEvidencePolicy(config(), root)).toEqual({ version: 1, excluded_path: 'prospec/ai-knowledge' });
    expect(resolveTestEvidencePolicy(config('docs/specs'), root)?.excluded_path).toBe('docs/specs/ai-knowledge');
  });
  it('accepts missing and recreated ordinary directories with the same descriptor', () => {
    const before = resolveTestEvidencePolicy(config('docs'), root);
    mkdirSync(path.join(root, 'docs/ai-knowledge'), { recursive: true });
    expect(resolveTestEvidencePolicy(config('docs'), root)).toEqual(before);
    rmSync(path.join(root, 'docs/ai-knowledge'), { recursive: true });
    expect(resolveTestEvidencePolicy(config('docs'), root)).toEqual(before);
  });
  it('uses filesystem spelling for existing aliases and preserves missing path segments', () => {
    mkdirSync(path.join(root, 'Docs/ai-knowledge'), { recursive: true });
    const aliases = existsSync(path.join(root, 'DOCS/ai-knowledge'));
    expect(resolveTestEvidencePolicy(config('DOCS'), root)?.excluded_path)
      .toBe(aliases ? 'Docs/ai-knowledge' : 'DOCS/ai-knowledge');
    expect(resolveTestEvidencePolicy(config('DOCS/Missing/Tail'), root)?.excluded_path)
      .toBe(aliases ? 'Docs/Missing/Tail/ai-knowledge' : 'DOCS/Missing/Tail/ai-knowledge');
    expect(resolveTestEvidencePolicy(config('Docs'), root)?.excluded_path).toBe('Docs/ai-knowledge');
    if (!aliases) {
      mkdirSync(path.join(root, 'DOCS/ai-knowledge'), { recursive: true });
      expect(resolveTestEvidencePolicy(config('DOCS'), root)?.excluded_path).toBe('DOCS/ai-knowledge');
    }
  });

  it.skipIf(process.platform === 'win32')('refuses symlink topology behind an aliased ordinary ancestor', () => {
    mkdirSync(path.join(root, 'Docs/Knowledge'), { recursive: true });
    symlinkSync('Knowledge', path.join(root, 'Docs/ai-knowledge'));
    const ancestor = existsSync(path.join(root, 'DOCS')) ? 'DOCS' : 'Docs';
    for (const base of [ancestor, `${ancestor}/ai-knowledge/missing`]) {
      expect(() => resolveTestEvidencePolicy(config(base), root)).toThrow(/ordinary directory/);
    }
  });

  it.each(['..', '../outside'])('rejects unsafe scope %s', (value) => {
    expect(() => resolveTestEvidencePolicy(config(value), root)).toThrow();
  });
  it('rejects a Knowledge root equal to the project directory', () => {
    const project = path.join(root, 'ai-knowledge');
    mkdirSync(project);
    expect(() => resolveTestEvidencePolicy(config('..'), project)).toThrow(/strict descendant/);
  });
  it('rejects a regular-file ancestor', () => {
    writeFileSync(path.join(root, 'docs'), 'file');
    expect(() => resolveTestEvidencePolicy(config('docs'), root)).toThrow();
  });
  it.skipIf(process.platform === 'win32')('rejects root and ancestor symlinks even within the project', () => {
    mkdirSync(path.join(root, 'docs/real'), { recursive: true });
    symlinkSync('real', path.join(root, 'docs/ai-knowledge'));
    symlinkSync('docs', path.join(root, 'alias'));
    for (const value of ['docs', 'alias', 'alias/missing']) {
      expect(() => resolveTestEvidencePolicy(config(value), root)).toThrow();
    }
  });
});
