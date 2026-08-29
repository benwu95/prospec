import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
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

describe('CLI E2E — basics', () => {
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
      const coreSection = indexContent.split('**Load-on-Demand Conventions**')[0];
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
