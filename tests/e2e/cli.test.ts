/**
 * E2E tests for prospec CLI.
 *
 * Uses real tmp directories and spawns actual CLI process.
 * memfs does NOT propagate to child processes, so we test
 * with the real filesystem here.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { parse as parseYamlRaw } from 'yaml';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CLI_PATH = path.resolve(__dirname, '../../dist/cli/index.js');
const NODE = process.execPath; // Use the same Node.js binary

let tmpDir: string;

/**
 * Run the prospec CLI with given args.
 * Returns { stdout, stderr, exitCode }.
 */
async function runCli(
  args: string[],
  options: { cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(NODE, [CLI_PATH, ...args], {
      cwd: options.cwd ?? tmpDir,
      timeout: 15000,
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : 1,
    };
  }
}

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-e2e-'));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

describe('CLI E2E', () => {
  describe('prospec --version', () => {
    it('should print version number and exit 0', async () => {
      const { stdout, exitCode } = await runCli(['--version']);
      expect(exitCode).toBe(0);
      expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('prospec --help', () => {
    it('should print help text with available commands', async () => {
      const { stdout, exitCode } = await runCli(['--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('prospec');
      expect(stdout).toContain('init');
      expect(stdout).toContain('knowledge');
      expect(stdout).toContain('agent');
      expect(stdout).toContain('change');
    });

    it('should show global options', async () => {
      const { stdout } = await runCli(['--help']);
      expect(stdout).toContain('--verbose');
      expect(stdout).toContain('--quiet');
      expect(stdout).toContain('--version');
    });
  });

  describe('prospec init', () => {
    it('should create .prospec.yaml and directory structure', async () => {
      // Create a minimal package.json so tech stack detection works
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'e2e-test-project' }),
      );

      const { exitCode } = await runCli([
        'init',
        '--name',
        'e2e-test-project',
        '--agents',
        'claude',
      ]);

      expect(exitCode).toBe(0);

      // Verify .prospec.yaml was created
      const configPath = path.join(tmpDir, '.prospec.yaml');
      expect(fs.existsSync(configPath)).toBe(true);

      const configContent = await fs.promises.readFile(configPath, 'utf-8');
      expect(configContent).toContain('e2e-test-project');
      expect(configContent).toContain('claude');

      // Verify directory structure
      expect(fs.existsSync(path.join(tmpDir, 'prospec', 'ai-knowledge'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'prospec', 'specs'))).toBe(true);

      // The rendered root index must have base_dir substituted and the
      // pipe-joined table-format line — a hand-built render context once
      // shipped "`/index.md`" and a comma-joined column list unnoticed.
      const indexContent = await fs.promises.readFile(
        path.join(tmpDir, 'prospec', 'index.md'),
        'utf-8',
      );
      expect(indexContent).toContain('located at `prospec/index.md`');
      expect(indexContent).not.toContain('`/index.md`');
      expect(indexContent).toContain(
        '_Table format: Module | Keywords | Aliases | Status | Description | Rationale | Depends On_',
      );
      expect(indexContent).toContain('## Progressive Knowledge Loading Strategy');
      // Core conventions are listed with knowledge-base-prefixed paths; the
      // playbook stays load-on-demand (never core).
      expect(indexContent).toContain('- `prospec/ai-knowledge/_conventions.md`');
      const coreSection = indexContent.split('**Load-on-Demand Conventions (L2)**')[0];
      expect(coreSection).not.toContain('_playbook.md');
    });

    it('should record --language and seed the Constitution Language Policy', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'e2e-lang-project' }),
      );

      const { stdout, exitCode } = await runCli([
        'init',
        '--name',
        'e2e-lang-project',
        '--agents',
        'claude',
        '--language',
        'Traditional Chinese (Taiwan)',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Document language: Traditional Chinese (Taiwan)');
      expect(stdout).toContain('skill_triggers');

      const configContent = await fs.promises.readFile(
        path.join(tmpDir, '.prospec.yaml'),
        'utf-8',
      );
      expect(configContent).toContain('artifact_language: Traditional Chinese (Taiwan)');

      const constitution = await fs.promises.readFile(
        path.join(tmpDir, 'prospec', 'CONSTITUTION.md'),
        'utf-8',
      );
      expect(constitution).toContain('[MUST] Language Policy');
      expect(constitution).toContain('Traditional Chinese (Taiwan)');
    });

    it('should default artifact_language to English in CI mode', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'e2e-default-lang' }),
      );

      const { stdout, exitCode } = await runCli([
        'init',
        '--name',
        'e2e-default-lang',
        '--agents',
        'claude',
      ]);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Document language: English');
      expect(stdout).not.toContain('skill_triggers');
      const configContent = await fs.promises.readFile(
        path.join(tmpDir, '.prospec.yaml'),
        'utf-8',
      );
      expect(configContent).toContain('artifact_language: English');
    });

    it('help output for init is in English and lists --language', async () => {
      const { stdout, exitCode } = await runCli(['init', '--help']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--language');
      expect(stdout).toContain('Initialize Prospec project structure');
      expect(/[\u4e00-\u9fff]/.test(stdout)).toBe(false);
    });

    it('should prevent double initialization', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'double-init' }),
      );

      // First init
      await runCli(['init', '--name', 'double-init', '--agents', 'claude']);

      // Second init should fail
      const { exitCode, stderr } = await runCli([
        'init',
        '--name',
        'double-init',
        '--agents',
        'claude',
      ]);
      expect(exitCode).not.toBe(0);
      // AlreadyExistsError, not a generic crash: pin the distinguishing message
      // + suggestion so a wrong-reason failure (formatGenericError) is caught.
      expect(stderr).toContain('.prospec.yaml already exists');
      expect(stderr).toContain('To reinitialize, delete the existing file first');
    });
  });

  describe('prospec change story', () => {
    it('should create a change with proposal and metadata', async () => {
      // Setup: init first
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'change-test' }),
      );
      await runCli(['init', '--name', 'change-test', '--agents', 'claude']);

      const { exitCode } = await runCli([
        'change',
        'story',
        'add-feature',
        '--description',
        'A new feature for testing',
      ]);
      expect(exitCode).toBe(0);

      // Verify change directory structure
      const changePath = path.join(tmpDir, '.prospec', 'changes', 'add-feature');
      expect(fs.existsSync(path.join(changePath, 'proposal.md'))).toBe(true);
      expect(fs.existsSync(path.join(changePath, 'metadata.yaml'))).toBe(true);
    });

    it('produces parseable metadata.yaml when --description contains quotes', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'quoted-test' }),
      );
      await runCli(['init', '--name', 'quoted-test', '--agents', 'claude']);

      const { exitCode } = await runCli([
        'change',
        'story',
        'quoted-story',
        '--description',
        'say "review" now',
      ]);
      expect(exitCode).toBe(0);

      const metadataRaw = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'quoted-story', 'metadata.yaml'),
        'utf-8',
      );
      const metadata = parseYamlRaw(metadataRaw) as { description: string; status: string };
      expect(metadata.status).toBe('story');
      expect(metadata.description).toBe('say "review" now');
    });
  });

  describe('prospec change plan', () => {
    it('should fail without a prior story', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'plan-test' }),
      );
      await runCli(['init', '--name', 'plan-test', '--agents', 'claude']);

      const { exitCode } = await runCli(['change', 'plan', '--change', 'nonexistent']);
      expect(exitCode).not.toBe(0);
    });
  });

  describe('prospec knowledge generate', () => {
    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['knowledge', 'generate']);
      expect(exitCode).not.toBe(0);
    });
  });

  describe('prospec knowledge init', () => {
    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['knowledge', 'init']);
      expect(exitCode).not.toBe(0);
    });

    it('should generate raw-scan.md and skeleton files', async () => {
      // Setup: init first
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'knowledge-init-test',
          dependencies: { express: '^4.0.0' },
        }),
      );
      await runCli(['init', '--name', 'knowledge-init-test', '--agents', 'claude']);

      // Create some source files
      const srcDir = path.join(tmpDir, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'index.ts'),
        'export const app = "hello";\n',
      );

      const { exitCode, stdout } = await runCli(['knowledge', 'init']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('raw-scan.md');

      // Verify raw-scan.md was created
      const rawScanPath = path.join(tmpDir, 'prospec', 'ai-knowledge', 'raw-scan.md');
      expect(fs.existsSync(rawScanPath)).toBe(true);

      const rawScan = await fs.promises.readFile(rawScanPath, 'utf-8');
      expect(rawScan).toContain('knowledge-init-test');
    });

    it('should not produce files in dry-run mode', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'dry-run-test' }),
      );
      await runCli(['init', '--name', 'dry-run-test', '--agents', 'claude']);

      const { exitCode, stdout } = await runCli(['knowledge', 'init', '--dry-run']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry-run');

      // raw-scan.md should NOT exist
      const rawScanPath = path.join(tmpDir, 'prospec', 'ai-knowledge', 'raw-scan.md');
      expect(fs.existsSync(rawScanPath)).toBe(false);
    });
  });

  describe('prospec knowledge init --raw-scan-only', () => {
    it('rejects the removed `knowledge refresh` command', async () => {
      const { exitCode } = await runCli(['knowledge', 'refresh']);
      expect(exitCode).not.toBe(0);
    });

    it('regenerates raw-scan.md for new code, leaving curated files untouched', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'rawscan-test', dependencies: { express: '^4.0.0' } }),
      );
      await runCli(['init', '--name', 'rawscan-test', '--agents', 'claude']);

      const srcDir = path.join(tmpDir, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, 'index.ts'), 'export const a = 1;\n');

      // First-time scaffold (raw-scan + curated module-map/index.md/_conventions)
      await runCli(['knowledge', 'init']);

      const kbDir = path.join(tmpDir, 'prospec', 'ai-knowledge');
      const rawScanPath = path.join(kbDir, 'raw-scan.md');
      const curatedPaths = [
        path.join(kbDir, 'module-map.yaml'),
        path.join(tmpDir, 'prospec', 'index.md'),
        path.join(kbDir, '_conventions.md'),
      ];

      const rawBefore = await fs.promises.readFile(rawScanPath, 'utf-8');
      const curatedBefore = await Promise.all(
        curatedPaths.map((p) => fs.promises.readFile(p, 'utf-8')),
      );

      // Introduce a new module directory after init
      const newDir = path.join(srcDir, 'newmodule');
      await fs.promises.mkdir(newDir, { recursive: true });
      await fs.promises.writeFile(path.join(newDir, 'thing.ts'), 'export const t = 1;\n');

      const { exitCode, stdout } = await runCli(['knowledge', 'init', '--raw-scan-only']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('raw-scan.md');
      expect(stdout).toContain('left untouched');

      // raw-scan.md reflects the new structure
      const rawAfter = await fs.promises.readFile(rawScanPath, 'utf-8');
      expect(rawAfter).not.toBe(rawBefore);
      expect(rawAfter).toContain('newmodule');

      // curated files are byte-identical (--raw-scan-only never touches them)
      const curatedAfter = await Promise.all(
        curatedPaths.map((p) => fs.promises.readFile(p, 'utf-8')),
      );
      expect(curatedAfter).toEqual(curatedBefore);
    });

    it('does not modify raw-scan.md in dry-run mode', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'rawscan-dry' }),
      );
      await runCli(['init', '--name', 'rawscan-dry', '--agents', 'claude']);
      const srcDir = path.join(tmpDir, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(path.join(srcDir, 'index.ts'), 'export const a = 1;\n');
      await runCli(['knowledge', 'init']);

      const rawScanPath = path.join(tmpDir, 'prospec', 'ai-knowledge', 'raw-scan.md');
      const before = await fs.promises.readFile(rawScanPath, 'utf-8');

      // Add a file, then dry-run --raw-scan-only — must not be reflected
      await fs.promises.writeFile(path.join(srcDir, 'extra.ts'), 'export const x = 1;\n');
      const { exitCode, stdout } = await runCli([
        'knowledge',
        'init',
        '--raw-scan-only',
        '--dry-run',
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry-run');

      const after = await fs.promises.readFile(rawScanPath, 'utf-8');
      expect(after).toBe(before);
    });
  });

  describe('prospec agent sync', () => {
    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['agent', 'sync']);
      expect(exitCode).not.toBe(0);
    });
  });

  describe('prospec agent sync — language and skill triggers', () => {
    async function initZhTwProject(): Promise<void> {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'sync-lang-test' }),
      );
      await runCli([
        'init',
        '--name',
        'sync-lang-test',
        '--agents',
        'claude',
        '--language',
        'Traditional Chinese (Taiwan)',
      ]);
    }

    it('hints to populate skill_triggers for a non-English project and renders the fallback', async () => {
      await initZhTwProject();

      const { stdout, exitCode } = await runCli(['agent', 'sync']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('skill_triggers');
      expect(stdout).toContain('Traditional Chinese (Taiwan)');

      const skillMd = await fs.promises.readFile(
        path.join(tmpDir, '.claude', 'skills', 'prospec-explore', 'SKILL.md'),
        'utf-8',
      );
      expect(skillMd).toContain(
        'or equivalent terms in Traditional Chinese (Taiwan)',
      );
    });

    it('writes custom skill_triggers into the SKILL.md frontmatter and entry config', async () => {
      await initZhTwProject();
      await fs.promises.appendFile(
        path.join(tmpDir, '.prospec.yaml'),
        'skill_triggers:\n  prospec-explore: [探索, 比較, 調查]\n',
      );

      const { stdout, exitCode } = await runCli(['agent', 'sync']);
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain('add them under skill_triggers');

      const skillMd = await fs.promises.readFile(
        path.join(tmpDir, '.claude', 'skills', 'prospec-explore', 'SKILL.md'),
        'utf-8',
      );
      const frontmatter = skillMd.split('---')[1];
      expect(frontmatter).toContain(
        'Triggers: explore, compare, investigate, unsure, clarify, 探索, 比較, 調查',
      );
      expect(() => parseYamlRaw(frontmatter)).not.toThrow();

      const claudeMd = await fs.promises.readFile(
        path.join(tmpDir, 'CLAUDE.md'),
        'utf-8',
      );
      expect(claudeMd).toContain('**Triggers**: explore, compare, investigate, unsure, clarify, 探索, 比較, 調查');
      expect(claudeMd).toContain('**Traditional Chinese (Taiwan)**');
    });

    it('generated artifact skills carry the Language Policy section pointing at the Constitution', async () => {
      await initZhTwProject();
      await runCli(['agent', 'sync']);

      const newStoryMd = await fs.promises.readFile(
        path.join(tmpDir, '.claude', 'skills', 'prospec-new-story', 'SKILL.md'),
        'utf-8',
      );
      expect(newStoryMd).toContain('## Language Policy');
      expect(newStoryMd).toContain("the Constitution's Language Policy rule");
      expect(newStoryMd).not.toContain('written in English');
    });

    it('warns about unknown skill_triggers keys on stderr even in quiet mode', async () => {
      await initZhTwProject();
      await fs.promises.appendFile(
        path.join(tmpDir, '.prospec.yaml'),
        'skill_triggers:\n  prospec-reveiw: [審查]\n',
      );

      const { stderr, exitCode } = await runCli(['agent', 'sync', '-q']);
      expect(exitCode).toBe(0);
      expect(stderr).toContain("skill_triggers: unknown skill 'prospec-reveiw' ignored");
    });
  });

  describe('prospec measure', () => {
    const measureReport = {
      corpus: 'sdd-tasks-v1',
      git_commit: 'abc1234def5678',
      generated_at: '2026-06-11T00:00:00.000Z',
      runs: [
        {
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          pricing: {
            input_usd_per_mtok: 1,
            output_usd_per_mtok: 5,
            cache_read_multiplier: 0.1,
            cache_write_multiplier: 1.25,
          },
          aborted: false,
          spent_usd: 1.2,
          tasks: [],
          summary: {
            measured_tasks: 12,
            skipped_tasks: 0,
            failed_tasks: 0,
            prospec_cache_hit_rate: 0.91,
            comparisons: [
              {
                baseline: 'full-dump',
                baseline_input_cold: 142_000,
                prospec_input_cold: 18_400,
                input_saving_ratio: 0.87,
                baseline_output: 34_000,
                prospec_output: 33_500,
                baseline_effective_cost_usd: 0.426,
                prospec_effective_cost_usd: 0.011,
                effective_cost_saving_ratio: 0.974,
              },
              {
                baseline: 'naive-rag',
                baseline_input_cold: 41_000,
                prospec_input_cold: 18_400,
                input_saving_ratio: 0.551,
                baseline_output: 33_800,
                prospec_output: 33_500,
                baseline_effective_cost_usd: 0.123,
                prospec_effective_cost_usd: 0.011,
                effective_cost_saving_ratio: 0.91,
              },
            ],
          },
        },
      ],
    };

    beforeEach(async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, '.prospec.yaml'),
        'name: e2e-measure\n',
      );
    });

    it('displays per-provider sections with both baselines and warm asterisk note', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'measurement-report.json'),
        JSON.stringify(measureReport),
      );

      const { stdout, exitCode } = await runCli(['measure']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('anthropic');
      expect(stdout).toContain('claude-haiku-4-5');
      expect(stdout).toContain('full-dump');
      expect(stdout).toContain('naive-rag');
      expect(stdout).toContain('warm*');
      expect(stdout).toContain('comparable only within the same provider');
      expect(stdout).toContain('Snapshot: abc1234def56');
    });

    it('guides to the runner via stderr when the report is missing, without calling any API', async () => {
      const { stderr, exitCode } = await runCli(['measure']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('Measurement report not found');
      expect(stderr).toContain('measure:tokens');
    });
  });

  describe('unknown command', () => {
    it('should exit with non-zero code', async () => {
      const { exitCode } = await runCli(['nonexistent']);
      expect(exitCode).not.toBe(0);
    });

    it('should suggest closest command for typos (REQ-CLI-006)', async () => {
      const { stderr } = await runCli(['inti']);
      expect(stderr).toContain('Did you mean init');
    });

    it('should show help hint after error', async () => {
      const { stderr } = await runCli(['nonexistent']);
      expect(stderr).toContain('--help');
    });
  });
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

      // ...but is NOT listed in the always-loaded entry config (Layer 0 stays lean)
      const claudeMd = await fs.promises.readFile(
        path.join(tmpDir, 'CLAUDE.md'),
        'utf-8',
      );
      expect(claudeMd).not.toContain('prospec-quickstart');
      expect(claudeMd).toContain('/prospec-explore');

      // the hand-off line names the exact next slash command
      expect(stdout).toContain('/prospec-quickstart');
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

describe('prospec upgrade E2E', () => {
  it('fails on an uninitialized project (config-existence gate)', async () => {
    const { exitCode, stderr } = await runCli(['upgrade']);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('.prospec.yaml');
  });

  it('records the prospec version, prints a report + next step, and leaves init-created docs untouched', async () => {
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
    expect(stdout).toContain('/prospec-upgrade');
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

    // a doc deleted since init is reported MISSING — and NOT recreated (the
    // consent-gated /prospec-upgrade skill owns creation), issue #48
    const glossaryPath = path.join(tmpDir, 'prospec', 'ai-knowledge', '_glossary.md');
    await fs.promises.rm(glossaryPath);
    const second = await runCli(['upgrade']);
    expect(second.exitCode).toBe(0);
    expect(second.stdout).toContain(
      'prospec/ai-knowledge/_glossary.md — MISSING (template: init/glossary.md.hbs)',
    );
    expect(second.stdout).toContain('1 doc(s) missing');
    expect(fs.existsSync(glossaryPath)).toBe(false);
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
    expect(stdout).toContain('/prospec-upgrade');
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
});
