import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';
import { gitIn } from '../helpers/git-fixture.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let cwd: string;
const config = 'project:\n  name: diagnostics\n  naem: unused-value\nartfact_language: private-value\nagents: [codex]\n';
const run = (args: string[]) => runCliInProcess(args, { cwd });

beforeEach(() => {
  cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'prospec-setup-diagnostics-'));
  gitIn(cwd, 'init', '-q');
  fs.writeFileSync(path.join(cwd, '.prospec.yaml'), config);
  fs.mkdirSync(path.join(cwd, 'prospec'));
  fs.writeFileSync(path.join(cwd, 'prospec/CONSTITUTION.md'), '# Project rules\n');
});

afterEach(() => {
  fs.rmSync(cwd, { recursive: true, force: true });
});

describe('CLI config diagnostics', () => {
  it('renders actual init recovery details in verbose mode', async () => {
    fs.unlinkSync(path.join(cwd, '.prospec.yaml'));
    fs.writeFileSync(path.join(cwd, 'AGENTS.md'), 'User instruction\n');
    const result = await run(['init', '--agents', 'codex', '--verbose']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain('Initialization details:');
    expect(result.stdout).toContain('inspect-project');
    expect(result.stdout).toContain('write-config');
    expect(result.stdout).toContain('created: .prospec.yaml');
    expect(result.stdout).toContain('skipped: prospec/CONSTITUTION.md');
    expect(result.stdout).toContain('merged: AGENTS.md');
    expect(fs.readFileSync(path.join(cwd, 'prospec/CONSTITUTION.md'), 'utf8')).toBe('# Project rules\n');
    expect(fs.readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8')).toContain('User instruction');
  });

  it('reports raw nested and root typos once without changing command output or config bytes', async () => {
    const result = await run(['constitution', 'show', '--station', 'plan']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe('# Project rules\n');
    expect(result.stderr).toContain('project.naem');
    expect(result.stderr).toContain('project.name');
    expect(result.stderr).toContain('artfact_language');
    expect(result.stderr).toContain('artifact_language');
    expect(result.stderr.match(/Unknown config field/g)).toHaveLength(2);
    expect(result.stderr).not.toContain('private-value');
    expect(result.stderr).not.toContain('unused-value');
    expect(fs.readFileSync(path.join(cwd, '.prospec.yaml'), 'utf8')).toBe(config);
    const again = await run(['constitution', 'show', '--station', 'plan']);
    expect(again.stderr.match(/Unknown config field/g)).toHaveLength(2);
  });

  it('points a legacy nested field at prospec upgrade, which removes it', async () => {
    fs.writeFileSync(path.join(cwd, '.prospec.yaml'),
      'project:\n  name: diagnostics\ntech_stack:\n  language: typescript\n  source: auto-detected\nagents: [codex]\n');
    const before = await run(['status']);
    expect(before.exitCode, before.stderr).toBe(0);
    expect(before.stderr).toContain('tech_stack.source');
    expect(before.stderr).toContain('prospec upgrade also removes unknown nested fields');

    const upgrade = await run(['upgrade']);
    expect(upgrade.exitCode, upgrade.stderr).toBe(0);
    const upgraded = fs.readFileSync(path.join(cwd, '.prospec.yaml'), 'utf8');
    expect(upgraded).toContain('language: typescript');
    expect(upgraded).not.toContain('auto-detected');

    const after = await run(['status']);
    expect(after.stderr).not.toContain('Unknown config field');
  });

  it('keeps diagnostics on stderr under quiet and never puts them in the command payload', async () => {
    const result = await run(['agent', 'sync', '--cli', 'codex', '--quiet']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr.match(/Unknown config field/g)).toHaveLength(2);
  });

  it('leaves the original validation refusal in charge after advisory warnings', async () => {
    fs.writeFileSync(path.join(cwd, '.prospec.yaml'), 'project:\n  naem: unused\n');
    const result = await run(['constitution', 'show', '--station', 'plan']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown config field');
    expect(result.stderr).toContain('project.naem');
    expect(result.stderr).toContain('CONFIG_INVALID');
    expect(result.stderr).toContain('project.name');
  });

  it('preserves a single structured JSON failure without advisory text', async () => {
    const result = await run(['history', 'import', '--from', 'absent', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    const payload = JSON.parse(result.stderr);
    expect(payload.error).toEqual(expect.objectContaining({
      code: 'UNEXPECTED_ERROR', message: expect.stringContaining('ENOENT'),
    }));
    expect(result.stderr).not.toContain('Unknown config field');
  });

  it('preserves structured JSON success without advisory text', async () => {
    const result = await run(['history', 'paths', '--json']);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toHaveProperty('paths');
    expect(result.stderr).toBe('');
  });

  it.each([['--help'], ['--version'], ['config', 'example']])('keeps project-free command %j free of diagnostics', async (...args) => {
    const result = await run(args);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).not.toContain('Unknown config field');
  });

  it('does not add diagnostics when init refuses an existing config', async () => {
    const result = await run(['init', '--agents', 'codex']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).not.toContain('Unknown config field');
  });

  it('diagnoses an existing quickstart config and leaves first-time quickstart warning-free', async () => {
    const existing = await run(['quickstart', '--agents', 'codex']);
    expect(existing.exitCode).toBe(0);
    expect(existing.stderr.match(/Unknown config field/g)).toHaveLength(2);
    fs.unlinkSync(path.join(cwd, '.prospec.yaml'));
    const fresh = await run(['quickstart', '--agents', 'codex']);
    expect(fresh.exitCode).toBe(0);
    expect(fresh.stderr).not.toContain('Unknown config field');
  });
});
