import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { readConfig, validateConfig } from '../../../src/lib/config.js';
import { ConfigInvalid, KnowledgePathMigrationRequired } from '../../../src/types/errors.js';

vi.setConfig({ testTimeout: 30_000 });
let root: string;
beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'config-topology-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const posixOnly = it.skipIf(process.platform === 'win32');
// Permission bits do not restrict root, so an unreadable directory cannot be built there.
const permissionDenial = it.skipIf(process.platform === 'win32' || process.getuid?.() === 0);
const yaml = (extra = '') => `project:\n  name: t\n${extra}`;

describe.each([
  ['repository root', ''],
  ['pkg/ subdirectory', 'pkg'],
])('readConfig path topology — project at the %s', (_label, sub) => {
  let project: string;
  // The repository is always at `root`; the project is either that root or a
  // subdirectory of it, and the rules are judged from the project directory.
  beforeEach(() => {
    execFileSync('git', ['init', '-q'], { cwd: root });
    project = path.join(root, sub);
    mkdirSync(project, { recursive: true });
  });
  const config = (extra = '') => writeFileSync(path.join(project, '.prospec.yaml'), yaml(extra));

  it('accepts artifact directories that do not exist yet', async () => {
    config();
    await expect(readConfig(project)).resolves.toBeTruthy();
    mkdirSync(path.join(project, 'prospec'));
    await expect(readConfig(project)).resolves.toBeTruthy();
  });

  it('accepts ordinary directories and the deprecated knowledge.base_path equal to the default', async () => {
    mkdirSync(path.join(project, 'prospec/specs'), { recursive: true });
    mkdirSync(path.join(project, 'prospec/ai-knowledge'), { recursive: true });
    config('knowledge:\n  base_path: prospec/ai-knowledge\n');
    await expect(readConfig(project)).resolves.toMatchObject({ knowledge: { base_path: 'prospec/ai-knowledge' } });
  });

  posixOnly('refuses a base_dir symlinked to the project root, reporting only the base_dir', async () => {
    symlinkSync('.', path.join(project, 'prospec'));
    config();
    const error = await readConfig(project).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigInvalid);
    expect((error as Error).message).toMatch(/paths\.base_dir: "prospec" is a symlink — replace it with an ordinary directory/);
    expect((error as Error).message).not.toMatch(/prospec\/(specs|ai-knowledge)/);
    expect((error as ConfigInvalid).suggestion).toBe('Fix the directory named above, then run the command again');
  });

  posixOnly('refuses a base_dir symlinked to another project directory', async () => {
    mkdirSync(path.join(project, 'docs'));
    symlinkSync('docs', path.join(project, 'prospec'));
    config();
    await expect(readConfig(project)).rejects.toThrow(/paths\.base_dir: "prospec" is a symlink/);
  });

  it.skipIf(process.platform === 'win32').each(['specs', 'ai-knowledge'])('refuses a symlinked prospec/%s, naming it', async (dir) => {
    mkdirSync(path.join(project, 'prospec/real'), { recursive: true });
    symlinkSync('real', path.join(project, 'prospec', dir));
    config();
    await expect(readConfig(project)).rejects.toThrow(new RegExp(`paths\\.base_dir: "prospec/${dir}" is a symlink`));
  });

  it.each(['specs', 'ai-knowledge'])('refuses a prospec/%s that is a regular file', async (dir) => {
    mkdirSync(path.join(project, 'prospec'));
    writeFileSync(path.join(project, 'prospec', dir), 'file');
    config();
    await expect(readConfig(project)).rejects.toThrow(new RegExp(`paths\\.base_dir: "prospec/${dir}" is not a directory`));
  });

  it('refuses a base_dir that is a regular file', async () => {
    writeFileSync(path.join(project, 'prospec'), 'file');
    config();
    await expect(readConfig(project)).rejects.toThrow(/paths\.base_dir: "prospec" is not a directory/);
  });

  posixOnly('does not judge paths below specs and ai-knowledge', async () => {
    mkdirSync(path.join(project, 'prospec/specs'), { recursive: true });
    mkdirSync(path.join(project, 'prospec/ai-knowledge'), { recursive: true });
    mkdirSync(path.join(project, 'elsewhere'));
    symlinkSync('../../elsewhere', path.join(project, 'prospec/specs/features'));
    symlinkSync('../../elsewhere', path.join(project, 'prospec/ai-knowledge/modules'));
    config();
    await expect(readConfig(project)).resolves.toBeTruthy();
  });

  permissionDenial('refuses a directory that cannot be inspected', async () => {
    mkdirSync(path.join(project, 'prospec/specs'), { recursive: true });
    chmodSync(path.join(project, 'prospec'), 0o000);
    try {
      config();
      await expect(readConfig(project)).rejects.toThrow(/paths\.base_dir: "prospec\/specs" cannot be inspected/);
    } finally {
      chmodSync(path.join(project, 'prospec'), 0o755);
    }
  });

  posixOnly('reports a directory violation in the same error as an unrelated schema error', async () => {
    symlinkSync('.', path.join(project, 'prospec'));
    writeFileSync(path.join(project, '.prospec.yaml'), 'project: {}\n');
    const error = await readConfig(project).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigInvalid);
    expect((error as Error).message).toMatch(/project\.name/);
    expect((error as Error).message).toMatch(/paths\.base_dir: "prospec" is a symlink/);
  });

  posixOnly('skips the directory rule while base_dir itself is out of range', async () => {
    symlinkSync('.', path.join(project, 'prospec'));
    writeFileSync(path.join(project, '.prospec.yaml'), 'project: {}\npaths:\n  base_dir: docs/prospec\n');
    const error = await readConfig(project).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/paths\.base_dir: must be a single directory name/);
    expect((error as Error).message).not.toMatch(/is a symlink/);
  });

  it('refuses literal violations with the field name before touching the filesystem', async () => {
    config('paths:\n  base_dir: docs/prospec\n');
    await expect(readConfig(project)).rejects.toThrow(/paths\.base_dir: must be a single directory name/);
    config('knowledge:\n  base_path: prospec/kb\n');
    await expect(readConfig(project)).rejects.toThrow(/knowledge\.base_path: is no longer configurable/);
  });
});

describe('deferring knowledge.base_path for prospec upgrade', () => {
  const write = (body: string) => writeFileSync(path.join(root, '.prospec.yaml'), yaml(body));

  it('tells other commands to move the files, delete the field and run prospec upgrade', async () => {
    write('knowledge:\n  base_path: docs/kb\n');
    await expect(readConfig(root)).rejects.toThrow(/knowledge\.base_path: is no longer configurable.*prospec\/ai-knowledge.*delete the field.*prospec upgrade/);
  });

  it('stops with the migration steps after every other rule passes', async () => {
    write('knowledge:\n  base_path: docs/kb\n');
    const error = await readConfig(root, { deferKnowledgeBasePath: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KnowledgePathMigrationRequired);
    expect((error as KnowledgePathMigrationRequired).code).toBe('KNOWLEDGE_PATH_MIGRATION');
    expect((error as Error).message).toContain('docs/kb');
    expect((error as Error).message).toContain('prospec/ai-knowledge');
    expect((error as KnowledgePathMigrationRequired).suggestion).toBe('Move the Knowledge files from "docs/kb" into "prospec/ai-knowledge" (merge when "prospec/ai-knowledge" already exists; skip when the two are the same directory or the old path no longer exists), delete knowledge.base_path from .prospec.yaml, then run prospec upgrade again');
  });

  posixOnly('reports a directory violation before the migration steps', async () => {
    mkdirSync(path.join(root, 'prospec/real'), { recursive: true });
    symlinkSync('real', path.join(root, 'prospec/ai-knowledge'));
    write('knowledge:\n  base_path: docs/kb\n');
    const error = await readConfig(root, { deferKnowledgeBasePath: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigInvalid);
    expect((error as Error).message).toMatch(/paths\.base_dir: "prospec\/ai-knowledge" is a symlink/);
  });

  it('quotes the configured value in the migration steps', async () => {
    write('knowledge:\n  base_path: "docs/kb; rm -rf x"\n');
    const error = await readConfig(root, { deferKnowledgeBasePath: true }).catch((e: unknown) => e);
    expect((error as KnowledgePathMigrationRequired).suggestion).toContain('Move the Knowledge files from "docs/kb; rm -rf x" into');
    expect((error as Error).message).toContain('.prospec.yaml names "docs/kb; rm -rf x"');
  });

  it('reports other configuration errors first, as ConfigInvalid', async () => {
    writeFileSync(path.join(root, '.prospec.yaml'), 'project: {}\nknowledge:\n  base_path: docs/kb\n');
    const error = await readConfig(root, { deferKnowledgeBasePath: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigInvalid);
    expect((error as Error).message).toMatch(/project\.name/);
    expect((error as Error).message).not.toMatch(/knowledge\.base_path/);
  });

  it('judges the deferred value against the configured base_dir', async () => {
    write('paths:\n  base_dir: docs\nknowledge:\n  base_path: docs/ai-knowledge\n');
    await expect(readConfig(root, { deferKnowledgeBasePath: true })).resolves.toMatchObject({ knowledge: { base_path: 'docs/ai-knowledge' } });
    write('paths:\n  base_dir: docs\nknowledge:\n  base_path: prospec/ai-knowledge\n');
    await expect(readConfig(root, { deferKnowledgeBasePath: true })).rejects.toThrow(KnowledgePathMigrationRequired);
  });

  it('keeps refusing an out-of-range base_dir instead of deferring', async () => {
    write('paths:\n  base_dir: docs/prospec\nknowledge:\n  base_path: docs/kb\n');
    await expect(readConfig(root, { deferKnowledgeBasePath: true })).rejects.toThrow(ConfigInvalid);
  });
});

describe('path topology scope', () => {
  posixOnly('does not refuse a project entered through a symlinked directory', async () => {
    const real = path.join(root, 'real');
    mkdirSync(path.join(real, 'prospec'), { recursive: true });
    writeFileSync(path.join(real, '.prospec.yaml'), yaml());
    symlinkSync(real, path.join(root, 'alias'));
    await expect(readConfig(path.join(root, 'alias'))).resolves.toBeTruthy();
  });

  posixOnly('judges validateConfig against the directory of the given source path', () => {
    symlinkSync('.', path.join(root, 'prospec'));
    expect(() => validateConfig(yaml(), path.join(root, '.prospec.yaml'))).toThrow(ConfigInvalid);
  });

  posixOnly('skips the filesystem rule when validateConfig has no source path', () => {
    symlinkSync('.', path.join(root, 'prospec'));
    const cwd = process.cwd();
    process.chdir(root);
    try {
      expect(validateConfig(yaml()).project.name).toBe('t');
    } finally {
      process.chdir(cwd);
    }
  });

  it('never creates the directories it inspects', async () => {
    writeFileSync(path.join(root, '.prospec.yaml'), yaml());
    await readConfig(root);
    expect(readdirSync(root)).toEqual(['.prospec.yaml']);
  });
});
