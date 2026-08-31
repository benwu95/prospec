import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseYamlRaw } from 'yaml';
import { runCliInProcess } from './helpers/run-cli.js';

// In-process runs still shell out to git via the drift/status/check services;
// keep the generous file-level timeout the git-bound e2e files use (PB-010).
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let tmpDir: string;
const runCli = (args: string[], options: { cwd?: string } = {}) =>
  runCliInProcess(args, { cwd: options.cwd ?? tmpDir });

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-e2e-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('prospec upgrade E2E', () => {
  it('fails on an uninitialized project (config-existence gate)', async () => {
    const { exitCode, stderr } = await runCli(['upgrade']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('.prospec.yaml');
  });

  it('records the prospec version, prints a report + next step, leaves existing init-created docs untouched, and back-fills missing ones', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'e2e-upgrade' }),
    );
    await runCli(['init', '--name', 'e2e-upgrade', '--agents', 'claude']);

    // The CLI must NOT touch any init-created doc — mark one to prove it stays
    const lifecyclePath = path.join(tmpDir, 'prospec', 'ai-knowledge', '_status-lifecycle.md');
    await fs.promises.writeFile(lifecyclePath, 'CUSTOM\n');

    // `init` does not create raw-scan.md — upgrade refreshes it (like agent sync)
    const rawScanPath = path.join(tmpDir, 'prospec', 'ai-knowledge', 'raw-scan.md');
    expect(fs.existsSync(rawScanPath)).toBe(false);

    const { stdout, exitCode } = await runCli(['upgrade']);
    expect(exitCode).toBe(0);

    // version recorded in the `version` field (= the prospec version)
    const cfg = parseYamlRaw(
      await fs.promises.readFile(path.join(tmpDir, '.prospec.yaml'), 'utf-8'),
    ) as { version?: string };
    expect(cfg.version).toMatch(/^\d+\.\d+\.\d+/);

    // the init-created doc is byte-unchanged (consent-gated skill owns doc formats)
    expect(await fs.promises.readFile(lifecyclePath, 'utf-8')).toBe('CUSTOM\n');

    // the deterministic raw-scan.md is now refreshed (the one allowed ai-knowledge write)
    expect(fs.existsSync(rawScanPath)).toBe(true);
    expect(stdout).toContain('raw-scan refreshed');

    expect(stdout).toContain('Upgrade report');
    expect(stdout).toContain('prospec-upgrade');
    // `init` wrote artifact_language: English, so this deliberate choice must NOT
    // be nagged — it reports triggers up to date, never the unset-language nudge.
    expect(stdout).toContain('skill triggers up to date');
    expect(stdout).not.toContain('no artifact_language set');

    // docs inventory: fixed line format the /prospec-upgrade skill parses —
    // every init-created doc listed with its template, none missing after init
    expect(stdout).toContain('Docs inventory:');
    expect(stdout).toContain(
      'prospec/ai-knowledge/_glossary.md (template: init/glossary.md.hbs)',
    );
    expect(stdout).not.toContain('MISSING');

    // a doc deleted since init is BACK-FILLED by the CLI (rendered from its
    // template) — closing the gap where an already-initialized project could not
    // obtain a newly-added init doc without re-running `prospec init` (which the
    // .prospec.yaml gate blocks). issue #48 → upgrade-create-missing-docs
    const glossaryPath = path.join(tmpDir, 'prospec', 'ai-knowledge', '_glossary.md');
    await fs.promises.rm(glossaryPath);
    const second = await runCli(['upgrade']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain(
      'created 1 missing doc(s): prospec/ai-knowledge/_glossary.md',
    );
    expect(second.stdout).not.toContain('MISSING');
    // the file is actually recreated on disk, rendered from its template
    expect(fs.existsSync(glossaryPath)).toBe(true);
    expect((await fs.promises.readFile(glossaryPath, 'utf-8')).length).toBeGreaterThan(0);
  });

  it('nudges a pre-feature project (no artifact_language) that it can set one, and keeps the field absent', async () => {
    // Hand-write a .prospec.yaml as a pre-feature CLI would: no artifact_language
    // field at all. `prospec init` always writes the field, so this state can only
    // come from an older CLI — exactly the user this nudge targets.
    const configPath = path.join(tmpDir, '.prospec.yaml');
    await fs.promises.writeFile(
      configPath,
      'version: 0.1.0\nproject:\n  name: legacy\nagents:\n  - claude\n',
    );

    // Use --no-interactive (the /prospec-upgrade skill's exact invocation): print
    // the report, never prompt. The report path is what the skill parses.
    const { stdout, exitCode } = await runCli(['upgrade', '--no-interactive']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('no artifact_language set');
    expect(stdout).toContain('prospec-upgrade');
    // The misleading "up to date" line must not appear for an unset language.
    expect(stdout).not.toContain('skill triggers up to date');

    // Upgrade must NOT answer the prompt for the user: the field stays absent…
    const afterFirst = parseYamlRaw(
      await fs.promises.readFile(configPath, 'utf-8'),
    ) as { artifact_language?: string };
    expect(afterFirst.artifact_language).toBeUndefined();

    // …so a second upgrade still surfaces the nudge (idempotent until opt-in).
    const second = await runCli(['upgrade', '--no-interactive']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain('no artifact_language set');
  });

  it('preserves user comments and formatting in .prospec.yaml across an upgrade', async () => {
    const configPath = path.join(tmpDir, '.prospec.yaml');
    await fs.promises.writeFile(
      configPath,
      '# my prospec config\nversion: 0.1.0\nproject:\n  name: legacy # the project name\nagents:\n  - claude\nartifact_language: English\n',
    );

    const { exitCode } = await runCli(['upgrade']);
    expect(exitCode).toBe(0);

    const after = await fs.promises.readFile(configPath, 'utf-8');
    // Comments survive the version bump (writeConfig merges in place).
    expect(after).toContain('# my prospec config');
    expect(after).toContain('# the project name');
    // The version was actually updated.
    expect(after).toMatch(/version:\s*"?\d+\.\d+\.\d+/);
    expect(after).not.toContain('0.1.0');
  });

  it('never rewrites the curated trust zone (CONSTITUTION / index.md / _conventions)', async () => {
    await fs.promises.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'e2e-upgrade-zone3' }),
    );
    await runCli(['init', '--name', 'e2e-upgrade-zone3', '--agents', 'claude']);

    const kb = path.join(tmpDir, 'prospec', 'ai-knowledge');
    const constitution = path.join(tmpDir, 'prospec', 'CONSTITUTION.md');
    const rootIndex = path.join(tmpDir, 'prospec', 'index.md');
    await fs.promises.writeFile(constitution, '# MY CURATED CONSTITUTION\n');
    await fs.promises.writeFile(rootIndex, '# MY CURATED INDEX\n');
    await fs.promises.writeFile(path.join(kb, '_conventions.md'), '# MY CURATED CONVENTIONS\n');

    const { exitCode } = await runCli(['upgrade']);
    expect(exitCode).toBe(0);

    expect(await fs.promises.readFile(constitution, 'utf-8')).toBe('# MY CURATED CONSTITUTION\n');
    expect(await fs.promises.readFile(rootIndex, 'utf-8')).toBe('# MY CURATED INDEX\n');
    expect(await fs.promises.readFile(path.join(kb, '_conventions.md'), 'utf-8')).toBe(
      '# MY CURATED CONVENTIONS\n',
    );
  });

  describe('prospec print-template E2E', () => {
    it('prints a valid template without requiring .prospec.yaml', async () => {
      const { stdout, exitCode } = await runCli(['print-template', 'skills/prospec-upgrade.hbs']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Prospec Upgrade Skill');
    });

    it('fails with non-zero exit code for invalid template path', async () => {
      const { stderr, exitCode } = await runCli(['print-template', 'non-existent-template.hbs']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Template file not found');
    });
  });

});

describe('prospec change auto-draft and check --auto-draft E2E', () => {
  const changeDir = (name: string): string =>
    path.join(tmpDir, '.prospec', 'changes', name);

  async function initProject(): Promise<void> {
    await fs.promises.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'e2e-autodraft' }),
    );
    await runCli(['init', '--name', 'e2e-autodraft', '--agents', 'claude']);
  }

  it('creates a complete fix change directory via change auto-draft', async () => {
    await initProject();

    const { stdout, exitCode } = await runCli([
      'change',
      'auto-draft',
      '--target',
      'services',
      '--check',
      'knowledge-size',
      '--reason',
      'README exceeds token budget',
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Drafted fix');
    expect(stdout).toContain('fix-services-knowledge-size');

    const dir = changeDir('fix-services-knowledge-size');
    expect(fs.existsSync(path.join(dir, 'proposal.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'metadata.yaml'))).toBe(true);

    const proposalText = await fs.promises.readFile(path.join(dir, 'proposal.md'), 'utf-8');
    expect(proposalText).toContain('Fix services drift (knowledge-size)');
    expect(proposalText).toContain('README exceeds token budget');
  });

  it('rejects an unknown --scale instead of writing it to disk', async () => {
    await initProject();

    const { exitCode, stderr } = await runCli([
      'change',
      'auto-draft',
      '--target',
      'services',
      '--check',
      'knowledge-size',
      '--reason',
      'x',
      '--scale',
      'gigantic',
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('gigantic');
    expect(fs.existsSync(changeDir('fix-services-knowledge-size'))).toBe(false);
  });

  it('exits non-zero and writes nothing when no drift source is given', async () => {
    await initProject();

    const { exitCode } = await runCli(['change', 'auto-draft']);

    expect(exitCode).not.toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes'))).toBe(false);
  });

  it('check --auto-draft still writes the report and grades the run', async () => {
    await initProject();

    const { exitCode, stdout } = await runCli(['check', '--json', '--auto-draft']);

    expect(exitCode).toBe(0);
    const reportPath = path.join(tmpDir, 'prospec-report.json');
    expect(fs.existsSync(reportPath)).toBe(true);
    // The report the run graded, not just a file: its verdicts must survive the
    // drafting step that runs after it.
    const report = JSON.parse(await fs.promises.readFile(reportPath, 'utf-8'));
    expect(report.structural.checks.length).toBeGreaterThan(0);
    expect(report.summary.fail_count).toBe(0);

    // Whatever was drafted exists on disk under exactly the reported names.
    const drafted = [...stdout.matchAll(/Drafted fix: (\S+)/g)].map((m) => m[1]!);
    const changes = path.join(tmpDir, '.prospec', 'changes');
    const onDisk = fs.existsSync(changes) ? await fs.promises.readdir(changes) : [];
    // Without this the two empty arrays would compare equal and the case would
    // pass on a run that drafted nothing at all.
    expect(drafted.length).toBeGreaterThan(0);
    expect(onDisk.sort()).toEqual(drafted.sort());
    for (const name of onDisk) {
      expect(fs.existsSync(path.join(changes, name, 'proposal.md'))).toBe(true);
      expect(fs.existsSync(path.join(changes, name, 'metadata.yaml'))).toBe(true);
    }
  });

  it('refuses --auto-draft in a mode that returns before the drift run', async () => {
    await initProject();

    const { exitCode, stderr } = await runCli(['check', '--record-tests', '--auto-draft']);

    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('--record-tests');
    expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes'))).toBe(false);
  });

  it('defaults --from-report to the canonical report filename', async () => {
    await initProject();
    await runCli(['check', '--json']);

    // Bare flag, no value: it must find `prospec-report.json` on its own.
    const { exitCode, stdout } = await runCli(['change', 'auto-draft', '--from-report']);

    expect(exitCode).toBe(0);
    expect([...stdout.matchAll(/Drafted fix: (\S+)/g)].length).toBeGreaterThan(0);
  });

  it('exits 1 when a group could not be written, while reporting the run', async () => {
    await initProject();
    await runCli(['check', '--json']);
    // Read-only changes directory: every scaffold write fails, but the service
    // reports each group rather than throwing.
    const changes = path.join(tmpDir, '.prospec', 'changes');
    await fs.promises.mkdir(changes, { recursive: true });
    await fs.promises.chmod(changes, 0o555);
    try {
      const { exitCode, stdout } = await runCli(['change', 'auto-draft', '--from-report']);

      expect(exitCode).toBe(1);
      expect(stdout).toContain('✗ Failed:');
      expect(stdout).toMatch(/\d+ failed/);
    } finally {
      await fs.promises.chmod(changes, 0o755);
    }
  });

  it('check --auto-draft exits non-zero when a scaffold could not be written', async () => {
    await initProject();
    const changes = path.join(tmpDir, '.prospec', 'changes');
    await fs.promises.mkdir(changes, { recursive: true });
    await fs.promises.chmod(changes, 0o555);
    try {
      const { exitCode, stderr } = await runCli(['check', '--json', '--auto-draft', '--quiet']);
      // The CHECK passed; the drafting it was asked to do did not.
      expect(exitCode).toBe(1);
      expect(stderr).toContain('auto-draft failed');
    } finally {
      await fs.promises.chmod(changes, 0o755);
    }
  });

  it('refuses a report source combined with an explicit target', async () => {
    await initProject();
    await runCli(['check', '--json']);

    const { exitCode, stderr } = await runCli([
      'change',
      'auto-draft',
      '--from-report',
      '--target',
      'services',
    ]);

    expect(exitCode).not.toBe(0);
    expect(stderr).toMatch(/--target/);
  });

  it('check --auto-draft-dry-run writes the report but no change directory', async () => {
    await initProject();

    const { exitCode, stdout } = await runCli([
      'check',
      '--json',
      '--auto-draft',
      '--auto-draft-dry-run',
    ]);

    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, 'prospec-report.json'))).toBe(true);
    // It must have had something to preview, or "wrote nothing" is vacuous.
    expect(stdout).toContain('[dry-run]');
    expect([...stdout.matchAll(/Would draft fix: (\S+)/g)].length).toBeGreaterThan(0);
    const changes = path.join(tmpDir, '.prospec', 'changes');
    const entries = fs.existsSync(changes) ? await fs.promises.readdir(changes) : [];
    expect(entries).toEqual([]);
  });
});
