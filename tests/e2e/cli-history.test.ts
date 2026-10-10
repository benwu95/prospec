import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitIn, imageOf } from '../helpers/git-fixture.js';
import { runCliInProcess } from './helpers/run-cli.js';
vi.setConfig({ testTimeout: 30_000 });
let root: string, main: string, linked: string;
const identity = '2026-10-10-old';
const run = (...args: string[]) => runCliInProcess(args, { cwd: linked });
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'history-cli-'))); main = path.join(root, 'main'); fs.mkdirSync(main);
  fs.writeFileSync(path.join(main, '.prospec.yaml'), 'project:\n  name: test\n');
  gitIn(main, 'init', '-qb', 'main'); gitIn(main, 'add', '.'); gitIn(main, 'commit', '-qm', 'fixture');
  linked = path.join(root, 'linked'); gitIn(main, 'worktree', 'add', '-qb', 'linked', linked);
  const source = path.join(linked, '.prospec/archive', identity); fs.mkdirSync(source, { recursive: true }); fs.writeFileSync(path.join(source, 'summary.md'), 'summary');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
it('prints shared history roots and local diagnostics as JSON and sanitized text', async () => {
  const result = await run('history', 'paths', '--json'); expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ paths: { archiveRoot: path.join(main, '.prospec/archive') }, diagnostics: [{ path: path.join(linked, '.prospec/archive', identity) }] });
  const human = await run('history', 'paths'); expect(human.stdout).toContain(main); expect(human.stderr).toContain('Local-only');
});
it('previews imports without writes then imports and reports identical copies', async () => {
  const before = imageOf(root); const preview = await run('history', 'import', '--from', linked, '--dry-run', '--json');
  expect(preview.exitCode).toBe(0); expect(JSON.parse(preview.stdout).entries[0].outcome).toBe('planned'); expect(imageOf(root)).toEqual(before);
  expect((await run('history', 'import', '--from', linked)).stdout).toContain('imported');
  const repeat = await run('history', 'import', '--from', linked, '--json'); expect(JSON.parse(repeat.stdout).entries[0].outcome).toBe('identical');
});
it('returns nonzero with structured per-entry conflicts and keeps quiet failures visible', async () => {
  const destination = path.join(main, '.prospec/archive', identity); fs.mkdirSync(destination, { recursive: true }); fs.writeFileSync(path.join(destination, 'summary.md'), 'different');
  const result = await run('history', 'import', '--from', linked, '--json'); expect(result.exitCode).toBe(1); expect(JSON.parse(result.stdout).entries[0].outcome).toBe('conflicting');
  const quiet = await run('--quiet', 'history', 'import', '--from', linked); expect(quiet.exitCode).toBe(1); expect(quiet.stdout).toBe(''); expect(quiet.stderr).toContain('conflicting');
});
it('requires --from and reports admission errors as JSON', async () => {
  expect((await run('history', 'import')).exitCode).toBe(1);
  const result = await run('history', 'import', '--from', root, '--json'); expect(result.exitCode).toBe(1); expect(JSON.parse(result.stderr).error.code).toBe('PREREQUISITE_ERROR');
});
it('accepts exact finalize bundle and preserves dry-run without writes', async () => {
  const canonical = path.join(main, '.prospec/archive', identity); fs.mkdirSync(canonical, { recursive: true }); fs.writeFileSync(path.join(canonical, 'summary.md'), '## Review & Verify\nPASS\n');
  fs.rmSync(path.join(linked, '.prospec/archive'), { recursive: true });
  const before = imageOf(root); const result = await run('archive', 'finalize', 'old', '--bundle', identity, '--dry-run');
  expect(result.exitCode, result.stderr).toBe(0); expect(result.stdout).toContain('dry-run'); expect(imageOf(root)).toEqual(before);
});
it('documents read-only paths, copy-only import and exact finalize selector', async () => {
  expect((await run('history', 'paths', '--help')).stdout).toContain('When to use:');
  expect((await run('history', 'import', '--help')).stdout).toContain('--dry-run');
  expect((await run('archive', 'finalize', '--help')).stdout).toContain('--bundle');
});
