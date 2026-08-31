import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
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

describe('prospec check E2E', () => {
  function writeFixture(rel: string, content: string): void {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  function scaffoldProject(): void {
    writeFixture(
      '.prospec.yaml',
      [
        'version: "1.0"',
        'project:',
        '  name: e2e',
        'paths:',
        '  base_dir: prospec',
        'knowledge:',
        '  base_path: prospec/ai-knowledge',
      ].join('\n'),
    );
    writeFixture('prospec/specs/features/demo.md', '#### REQ-DEMO-001: Demo\nsee REQ-DEMO-001\n');
    writeFixture('.prospec/changes/done/tasks.md', '- [x] T1 implemented ~5 lines\n- [ ] T2 [M] manual step ~5 lines\n');
  }

  /** The no-test-command skip reason is only reachable once the git / changes-dir /
   *  digest guards pass — without a repo the truthful reason is "not a git
   *  repository" (the #103 guard reorder made that ordering observable). */
  function gitInitFixture(): void {
    const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
    git('init', '-q');
    git('config', 'user.email', 'e2e@test.dev');
    git('config', 'user.name', 'e2e');
    git('add', '.');
    git('commit', '-q', '-m', 'fixture');
  }

  it('exits 0 on a consistent project and reports skipped checks honestly', async () => {
    scaffoldProject();
    const { stdout, exitCode } = await runCli(['check', '--strict']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('PASS  req-references');
    expect(stdout).toContain('PASS  task-completion');
    // fixture has no module-map — knowledge-health must degrade to an explicit skip
    expect(stdout).toContain('SKIP  knowledge-health');
    expect(stdout).toContain('module boundaries unknown');
    expect(stdout).toContain('not-checked');
  });

  it('check --record-review --graded-by records the grading context inside review_provenance', async () => {
    scaffoldProject();
    writeFixture(
      '.prospec/changes/done/metadata.yaml',
      ['name: done', 'created_at: 2026-08-01T00:00:00.000Z', 'status: implemented'].join('\n') + '\n',
    );
    gitInitFixture();
    const recorded = await runCli([
      'check', '--record-review', '--graded-by', 'in-session', '--change', 'done',
    ]);
    expect(recorded.exitCode).toBe(0);
    const metadata = fs.readFileSync(
      path.join(tmpDir, '.prospec', 'changes', 'done', 'metadata.yaml'),
      'utf-8',
    );
    // nested under review_provenance, not a stray top-level key (review TQ-2/TQ-4)
    expect(metadata).toMatch(/review_provenance:\n(?:[ \t]+\S[^\n]*\n)*?[ \t]+graded_by: in-session/);
    // the flag is enum-validated at the parser layer (REQ-CLI-012)
    const refused = await runCli(['check', '--record-review', '--graded-by', 'myself']);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('graded-by');
  });

  it('lists the two adjudication checks and the parsed Constitution inventory', async () => {
    scaffoldProject();
    writeFixture(
      'prospec/CONSTITUTION.md',
      '# C\n\n## Principles\n\n### [MUST] Tagged rule\n\n**Verify**: x.\n\n### Untagged rule\n\nprose\n',
    );
    gitInitFixture();
    const { stdout, exitCode } = await runCli(['check']);
    expect(exitCode).toBe(0);
    // both new checks appear with their own status line, with the state PINNED —
    // an alternation over every status would pass whatever the engine reported.
    // This fixture declares no test command, so the honest state is SKIP + reason.
    expect(stdout).toContain('SKIP  test-provenance');
    expect(stdout).toMatch(/SKIP\s+test-provenance[^\n]*no test command configured/);
    expect(stdout).toContain('WARN  constitution-severity');
    expect(stdout).toContain('Constitution rules: 2 parsed');
    expect(stdout).toContain('1 untagged');
  });

  it('--escaped-defects reports honestly with no registered samples and never writes a file', async () => {
    scaffoldProject();
    const { stdout, exitCode } = await runCli(['check', '--escaped-defects']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('no registered samples');
    expect(stdout).toContain('not a 0% escape rate');
    expect(fs.existsSync(path.join(tmpDir, 'escaped-defect-report.json'))).toBe(false);
  });

  it('--escaped-defects --json writes the report with per-gate rates', async () => {
    scaffoldProject();
    writeFixture(
      '.prospec/archive/2026-07-05-offender/metadata.yaml',
      'name: offender\nstatus: archived\nscale: standard\nquality_log:\n' +
        '  - skill: prospec-verify\n    date: "2026-07-05"\n    result: PASS\n    grade: S\n',
    );
    writeFixture(
      '.prospec/changes/fix/metadata.yaml',
      'name: fix\nstatus: implemented\nscale: quick\nintroduced_by: offender\n',
    );
    const { stdout, exitCode } = await runCli(['check', '--escaped-defects', '--json']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('prospec-verify');
    const report = JSON.parse(
      fs.readFileSync(path.join(tmpDir, 'escaped-defect-report.json'), 'utf-8'),
    );
    expect(report.sample_count).toBe(1);
    expect(report.gates[0]).toMatchObject({ gate: 'prospec-verify', passed: 1, escaped: 1 });
  });

  it('exits 1 with --strict on injected drift, 0 without --strict', async () => {
    scaffoldProject();
    writeFixture('prospec/specs/features/demo.md', '#### REQ-DEMO-001: Demo\nsee REQ-DANGLING-999\n');
    const strict = await runCli(['check', '--strict']);
    expect(strict.exitCode).toBe(1);
    expect(strict.stdout).toContain('REQ-DANGLING-999');
    const loose = await runCli(['check']);
    expect(loose.exitCode).toBe(0);
    expect(loose.stdout).toContain('FAIL  req-references');
  });

  it('writes a byte-identical report across two runs apart from generated_at (SC-003)', async () => {
    scaffoldProject();
    await runCli(['check', '--json']);
    const first = fs.readFileSync(path.join(tmpDir, 'prospec-report.json'), 'utf-8');
    await runCli(['check', '--json']);
    const second = fs.readFileSync(path.join(tmpDir, 'prospec-report.json'), 'utf-8');
    const strip = (s: string) => s.replace(/"generated_at": "[^"]+"/, '"generated_at": "X"');
    expect(strip(first)).toBe(strip(second));
  });

  it('--init-ci scaffolds the workflow once and is rerun-safe', async () => {
    scaffoldProject();
    const first = await runCli(['check', '--init-ci']);
    expect(first.exitCode).toBe(0);
    expect(first.stdout).toContain('Created');
    const workflow = fs.readFileSync(
      path.join(tmpDir, '.github/workflows/prospec-check.yml'),
      'utf-8',
    );
    expect(workflow).toContain('permissions:');
    const second = await runCli(['check', '--init-ci']);
    expect(second.stdout).toContain('already exists');
  });
});

describe('prospec mcp E2E', () => {
  // The serve daemon itself is covered by the in-memory contract suite
  // (tests/contract/mcp-server.test.ts) — e2e only freezes the CLI registration.
  it('registers the mcp command with a serve subcommand', async () => {
    const help = await runCli(['mcp', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('serve');
    expect(help.stdout).toContain('read-only');
  });

  it('mcp serve without .prospec.yaml fails on stderr, never stdout', async () => {
    const result = await runCli(['mcp', 'serve']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('.prospec.yaml');
    expect(result.stdout).toBe('');
  });

  it('mcp serve --help documents --cwd', async () => {
    const help = await runCli(['mcp', 'serve', '--help']);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain('--cwd');
  });

  it('mcp serve --cwd resolves .prospec.yaml against the given dir, not the launch dir', async () => {
    // Launch dir (tmpDir) has no config; --cwd points at another config-less dir.
    // The guard must report the --cwd path — proving it honors --cwd rather than
    // falling back to process.cwd() (which would yield the generic message).
    const targetDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-mcp-cwd-'));
    try {
      const result = await runCli(['mcp', 'serve', '--cwd', targetDir]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(targetDir);
      expect(result.stderr).toContain('.prospec.yaml');
      expect(result.stdout).toBe('');
    } finally {
      await fs.promises.rm(targetDir, { recursive: true, force: true });
    }
  });

  describe('prospec quickstart', () => {
    it('scaffolds in one command, deploys the onboarding skill off the entry config, and names the next step', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'e2e-quickstart' }),
      );

      const { stdout, exitCode } = await runCli([
        'quickstart',
        '--name',
        'e2e-quickstart',
        '--agents',
        'claude',
        '--language',
        'English',
      ]);

      expect(exitCode).toBe(0);

      // init + agent sync ran
      expect(fs.existsSync(path.join(tmpDir, '.prospec.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, '.claude/skills/prospec-explore/SKILL.md')),
      ).toBe(true);

      // the excludeFromEntryConfig skill IS deployed on disk (invocable)...
      expect(
        fs.existsSync(
          path.join(tmpDir, '.claude/skills/prospec-quickstart/SKILL.md'),
        ),
      ).toBe(true);

      // ...and CLAUDE.md's registry is slim (claude surfaces SKILL.md frontmatter):
      // no per-skill table at all, so nothing — including the excluded quickstart —
      // is enumerated. Full-table exclusion is covered by the agent-sync unit test
      // (skills array) and the integration contract (AGENTS.md).
      const claudeMd = await fs.promises.readFile(
        path.join(tmpDir, 'CLAUDE.md'),
        'utf-8',
      );
      expect(claudeMd).not.toContain('### /prospec-'); // slim: no per-skill entries
      expect(claudeMd).toContain('/prospec-'); // slim pointer names the command family

      // the hand-off line names the exact next slash command
      expect(stdout).toContain('prospec-quickstart');
    });

    it('is re-runnable: a second run skips init', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'e2e-quickstart-rerun' }),
      );
      const first = await runCli([
        'quickstart',
        '--agents',
        'claude',
        '--language',
        'English',
      ]);
      expect(first.exitCode).toBe(0);

      const { stdout, exitCode } = await runCli([
        'quickstart',
        '--agents',
        'claude',
        '--language',
        'English',
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('skipped');
    });
  });
});
