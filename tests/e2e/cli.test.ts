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
      expect(stdout).toContain('steering');
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
      // Should indicate already exists
      const output = stderr + (await runCli(['init', '--name', 'x', '--agents', 'claude'])).stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('prospec steering', () => {
    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['steering']);
      expect(exitCode).not.toBe(0);
    });

    it('should run with --dry-run', async () => {
      // Setup: init first
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'steering-test' }),
      );
      await runCli(['init', '--name', 'steering-test', '--agents', 'claude']);

      // Create some source files for scanning
      const srcDir = path.join(tmpDir, 'src');
      await fs.promises.mkdir(srcDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(srcDir, 'index.ts'),
        'export const hello = "world";\n',
      );

      const { exitCode } = await runCli(['steering', '--dry-run']);
      expect(exitCode).toBe(0);
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

  describe('prospec agent sync', () => {
    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['agent', 'sync']);
      expect(exitCode).not.toBe(0);
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
