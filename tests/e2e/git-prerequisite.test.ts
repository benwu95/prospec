/**
 * E2E for the CLI entry's git work-tree requirement (REQ-SETUP-025): refusals
 * leave the directory untouched and name the right remedy, the check follows
 * `--cwd`, and the commands that read no project run without git.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';
import { gitIn, imageOf } from '../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 90_000 });

const CONFIG = 'version: "1.0"\nproject:\n  name: git-prerequisite\n';

let root: string;
let outside: string;
let repo: string;

const runCli = (args: string[], cwd: string) => runCliInProcess(args, { cwd });

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-git-prerequisite-')));
  // Keep git from finding a repository above the temporary directory.
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
  outside = path.join(root, 'outside');
  fs.mkdirSync(outside);
  repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  gitIn(repo, 'init', '-q');
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe('refusal outside a git work tree', () => {
  it('refuses initialized commands before they act, naming git init, and writes nothing', async () => {
    fs.writeFileSync(path.join(outside, '.prospec.yaml'), CONFIG);
    for (const args of [['status'], ['upgrade', '--no-interactive']]) {
      const before = imageOf(outside);
      const { exitCode, stderr } = await runCli(args, outside);
      expect(exitCode, args.join(' ')).toBe(1);
      expect(stderr).toContain(`${outside} is not inside a git work tree`);
      expect(stderr).toContain('git init');
      expect(imageOf(outside), args.join(' ')).toEqual(before);
    }
  });

  it('refuses init and quickstart in an empty directory without creating a file', async () => {
    for (const args of [['init', '--name', 'x', '--agents', 'claude'], ['quickstart', '--name', 'x', '--agents', 'claude']]) {
      const { exitCode, stderr } = await runCli(args, outside);
      expect(exitCode, args[0]).toBe(1);
      expect(stderr).toContain('not inside a git work tree');
      expect(fs.readdirSync(outside), args[0]).toEqual([]);
    }
  });

  it('tells the user to install git when no git executable is on PATH', async () => {
    fs.writeFileSync(path.join(repo, '.prospec.yaml'), CONFIG);
    const before = imageOf(repo);
    vi.stubEnv('PATH', path.join(root, 'no-git-bin'));
    const { exitCode, stderr } = await runCli(['status'], repo);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('git was not found');
    expect(stderr).toContain('Install git');
    expect(stderr).not.toContain('git init');
    expect(imageOf(repo)).toEqual(before);
  });

  it('probes the --cwd target, not the directory the command was launched from', async () => {
    fs.writeFileSync(path.join(outside, '.prospec.yaml'), CONFIG);
    const { exitCode, stderr } = await runCli(['mcp', 'serve', '--cwd', outside], repo);
    expect(exitCode).toBe(1);
    expect(stderr).toContain(`${outside} is not inside a git work tree`);
  });

  it('reports ConfigNotFound first for an uninitialized directory outside a work tree', async () => {
    const { exitCode, stderr } = await runCli(['status'], outside);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('.prospec.yaml');
    expect(stderr).toContain('prospec init');
    expect(stderr).not.toContain('git work tree');
  });
});

describe('commands that pass the check', () => {
  it('initializes a project in a subdirectory of a repository', async () => {
    const pkg = path.join(repo, 'pkg');
    fs.mkdirSync(pkg);
    const { exitCode } = await runCli(['init', '--name', 'sub', '--agents', 'claude'], pkg);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(pkg, '.prospec.yaml'))).toBe(true);
  });

  it('runs the exempt commands outside a work tree and without git exactly as inside a repository', async () => {
    const exempt = [
      ['--version'],
      ['--help'],
      ['status', '--help'],
      ['help'],
      ['print-template', 'skills/prospec-upgrade.hbs'],
      ['config', 'example'],
    ];
    for (const args of exempt) {
      const inside = await runCli(args, repo);
      expect(await runCli(args, outside), `${args.join(' ')} outside`).toEqual(inside);
      vi.stubEnv('PATH', path.join(root, 'no-git-bin'));
      expect(await runCli(args, outside), `${args.join(' ')} without git`).toEqual(inside);
      vi.unstubAllEnvs();
      vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
    }
  });
});
