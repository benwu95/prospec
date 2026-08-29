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

describe('CLI E2E — knowledge, agent & measure', () => {
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

  describe('prospec knowledge verify', () => {
    const initProject = async (): Promise<string> => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'kv-test' }),
      );
      await runCli(['init', '--name', 'kv-test', '--agents', 'claude']);
      const mapPath = path.join(tmpDir, 'prospec', 'ai-knowledge', 'module-map.yaml');
      await fs.promises.mkdir(path.dirname(mapPath), { recursive: true });
      await fs.promises.writeFile(
        mapPath,
        'modules:\n  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n',
      );
      return mapPath;
    };

    it('stamps last_verified into module-map.yaml for a named module', async () => {
      const mapPath = await initProject();
      const { exitCode, stdout } = await runCli(['knowledge', 'verify', 'lib']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('verified lib');
      expect(await fs.promises.readFile(mapPath, 'utf-8')).toContain('last_verified:');
    });

    it('fails on an unknown module without writing', async () => {
      const mapPath = await initProject();
      const before = await fs.promises.readFile(mapPath, 'utf-8');
      const { exitCode } = await runCli(['knowledge', 'verify', 'ghost']);
      expect(exitCode).not.toBe(0);
      expect(await fs.promises.readFile(mapPath, 'utf-8')).toBe(before);
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
      const frontmatter = skillMd.split('---')[1]!;
      expect(frontmatter).toContain(
        'Triggers: explore, compare, investigate, unsure, clarify, 探索, 比較, 調查',
      );
      expect(() => parseYamlRaw(frontmatter)).not.toThrow();

      const claudeMd = await fs.promises.readFile(
        path.join(tmpDir, 'CLAUDE.md'),
        'utf-8',
      );
      // CLAUDE.md registry is slim for claude — the trigger words are surfaced via
      // the SKILL.md frontmatter (asserted above), not duplicated in the entry config.
      expect(claudeMd).not.toContain('**Triggers**:');
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
    beforeEach(async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, '.prospec.yaml'),
        'name: e2e-measure\n',
      );
    });

    it('displays local token measurement report', async () => {
      const claudeProjDir = path.join(tmpDir, '.claude', 'projects');
      await fs.promises.mkdir(claudeProjDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(claudeProjDir, 'test.jsonl'),
        `{"requestId":"r1","message":{"id":"m1","usage":{"input_tokens":100,"output_tokens":20}}}`
      );

      const { stdout, exitCode } = await runCli(['measure']);

      expect(exitCode).toBe(0);
      expect(stdout).toContain('Source: claude');
      expect(stdout).toContain('full-dump');
      expect(stdout).toContain('input tokens');
      expect(stdout).toContain('output tokens');
    });

    it('guides the user via stderr when no local logs are found', async () => {
      const { stderr, exitCode } = await runCli(['measure']);

      expect(exitCode).toBe(1);
      expect(stderr).toContain('No local logs found');
      expect(stderr).toContain('Use an AI CLI to generate some logs first');
    });

    it('projects offline budget when --project-workflow is used', async () => {
      // Set up a fake project and a change
      await fs.promises.rm(path.join(tmpDir, '.prospec.yaml'), { force: true });
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'workflow-test' }),
      );
      await runCli(['init', '--name', 'workflow-test', '--agents', 'claude']);
      
      const changeName = 'feat-workflow';
      const storyRes = await runCli(['change', 'story', changeName, '--description', 'test workflow scale']);
      
      if (storyRes.exitCode !== 0) {
        console.error('STORY STDERR:', storyRes.stderr);
        console.error('STORY STDOUT:', storyRes.stdout);
      }
      expect(storyRes.exitCode).toBe(0);
      
      const changeDir = path.join(tmpDir, '.prospec', 'changes', changeName);
      
      try {
        await fs.promises.access(changeDir);
      } catch {
        const changesLs = await fs.promises.readdir(path.join(tmpDir, '.prospec', 'changes')).catch(() => []);
        console.error('LS .prospec/changes:', changesLs);
        console.error('STORY STDOUT:', storyRes.stdout);
      }
      
      // Inject some metadata to hit the modules/specs logic
      const metadata = await fs.promises.readFile(path.join(changeDir, 'metadata.yaml'), 'utf-8');
      await fs.promises.writeFile(
        path.join(changeDir, 'metadata.yaml'),
        metadata + 'related_modules:\n  - core\n',
      );
      
      await fs.promises.writeFile(
        path.join(changeDir, 'delta-spec.md'),
        '**Feature:** my-feature\n',
      );

      const { stdout, exitCode, stderr } = await runCli([
        'measure', '--project-workflow', 'standard', '--change', changeName
      ]);
      
      expect(stderr).toBe('');
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Scale: standard');
      expect(stdout).toContain('L1 (Constitution, etc.)');
      expect(stdout).toContain('Total Projected Budget');
    });
  });

});
