/**
 * E2E tests for prospec CLI.
 *
 * Uses real tmp directories and spawns actual CLI process.
 * memfs does NOT propagate to child processes, so we test
 * with the real filesystem here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { parse as parseYamlRaw } from 'yaml';
import { promisify } from 'node:util';
import { RELAYED_FIELD_MAX_CHARS } from '../../src/types/station.js';

// Every test here spawns a cold `node dist/cli/index.js` subprocess (full CLI
// import graph). Under the full parallel suite, CPU contention makes an
// occasional cold start exceed a tight timeout — a load flake, not a
// real hang (each `runCli` still self-limits via execFile's 60s timeout below).
// Give the whole file generous headroom above that 60s so a genuinely stuck
// child is caught by execFile, never by a premature vitest timeout.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

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
      timeout: 60000,
      env: { ...process.env, NO_COLOR: '1', PROSPEC_MOCK_HOME: tmpDir },
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

    // issue #131 — the registration must survive the real serializer: `#131`
    // unquoted opens a YAML comment and the value disappears on read-back.
    it('records --issue and round-trips a reference that would read as a comment', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'issue-test' }),
      );
      await runCli(['init', '--name', 'issue-test', '--agents', 'claude']);

      const { exitCode } = await runCli([
        'change',
        'story',
        'linked-story',
        '--description',
        'Linked to a tracker item',
        '--issue',
        '#131',
      ]);
      expect(exitCode).toBe(0);

      const metadataRaw = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'linked-story', 'metadata.yaml'),
        'utf-8',
      );
      expect(parseYamlRaw(metadataRaw)).toMatchObject({ issue: '#131' });

      const { stdout } = await runCli(['status']);
      expect(stdout).toContain('#131');
    });

    it('leaves no issue key in metadata.yaml when --issue is omitted', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'issue-test' }),
      );
      await runCli(['init', '--name', 'issue-test', '--agents', 'claude']);
      await runCli(['change', 'story', 'unlinked-story', '--description', 'No tracker item']);

      const metadataRaw = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'unlinked-story', 'metadata.yaml'),
        'utf-8',
      );
      // absent, not `issue: ""` / `issue: null` — the two must stay distinguishable
      expect(metadataRaw).not.toContain('issue');
      expect(parseYamlRaw(metadataRaw)).not.toHaveProperty('issue');

      const { stdout } = await runCli(['status']);
      expect(stdout).not.toContain('issue:');
    });

    // The value lands in `prospec status`'s per-change block and in the archive
    // summary that is copied verbatim into the committed audit trail, so a
    // multi-line value is collapsed to one line at the sinks (the same defence
    // `escapeTableCell` / `toInlineCodeSpan` apply) rather than being validated.
    it('collapses a multi-line --issue so it cannot forge structure', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'issue-test' }),
      );
      await runCli(['init', '--name', 'issue-test', '--agents', 'claude']);

      const { exitCode } = await runCli([
        'change',
        'story',
        'forged-story',
        '--issue',
        '#131\n\n## Forged Heading\n\n- **Quality Grade**: S',
      ]);
      expect(exitCode).toBe(0);

      const metadataRaw = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'forged-story', 'metadata.yaml'),
        'utf-8',
      );
      expect(parseYamlRaw(metadataRaw)).toMatchObject({
        issue: '#131 ## Forged Heading - **Quality Grade**: S',
      });
      // structure-scoped: no metadata LINE may begin with the forged heading
      expect(metadataRaw.split('\n').some((l) => l.startsWith('## Forged'))).toBe(false);

      // and the status block stays one change, not four stray lines
      const { stdout } = await runCli(['status']);
      const issueLines = stdout.split('\n').filter((l) => l.includes('issue:'));
      expect(issueLines).toHaveLength(1);
      expect(stdout.split('\n').some((l) => l.startsWith('## Forged'))).toBe(false);
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

  describe('prospec status', () => {
    it('should report the clean state when nothing is in flight', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'status-test' }),
      );
      await runCli(['init', '--name', 'status-test', '--agents', 'claude']);

      const { stdout, exitCode } = await runCli(['status']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('No in-progress changes');
    });

    it('should route an in-flight change to its next station', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'status-test' }),
      );
      await runCli(['init', '--name', 'status-test', '--agents', 'claude']);
      await runCli(['change', 'story', 'add-feature', '--description', 'Routing e2e']);

      const { stdout, exitCode } = await runCli(['status']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('add-feature');
      expect(stdout).toContain('/prospec-plan');
      // Solution B (REQ-CLI-039): the next station is surfaced as an actionable
      // skill target — the resolved path (from the configured `claude` agent),
      // plus the read-first instruction — never a hardcoded skills directory.
      expect(stdout).toContain('.claude/skills/prospec-plan/SKILL.md');
      expect(stdout).toContain('before executing station checks');
    });

    it('should fail without .prospec.yaml', async () => {
      const { exitCode } = await runCli(['status']);
      expect(exitCode).not.toBe(0);
    });

    // End to end over the real artifacts a Windows checkout produces
    // (the Git for Windows installer sets `core.autocrlf=true` and this repo ships
    // no `.gitattributes`): both the router and the drift engine read tasks.md, and
    // both used to see an empty task list under CRLF.
    it('routes and checks a CRLF task list exactly like its LF form', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'crlf-test' }),
      );
      await runCli(['init', '--name', 'crlf-test', '--agents', 'claude']);
      await runCli(['change', 'story', 'add-feature', '--description', 'CRLF routing e2e']);
      await runCli(['change', 'scale', 'quick']);
      await runCli(['change', 'tasks']);

      const tasksPath = path.join(tmpDir, '.prospec', 'changes', 'add-feature', 'tasks.md');
      const TASKS = ['- [x] T1 done', '- [ ] T2 pending', '- [ ] T3 [M] manual', ''].join('\n');
      const taskCompletion = async (): Promise<unknown> => {
        await runCli(['check', '--json']);
        const report = JSON.parse(
          await fs.promises.readFile(path.join(tmpDir, 'prospec-report.json'), 'utf-8'),
        ) as { structural: { checks: { id: string; status: string }[] } };
        return report.structural.checks.find((c) => c.id === 'task-completion');
      };

      await fs.promises.writeFile(tasksPath, TASKS);
      const lfStatus = await runCli(['status']);
      const lfCheck = await taskCompletion();

      await fs.promises.writeFile(tasksPath, TASKS.replace(/\n/g, '\r\n'));
      const crlfStatus = await runCli(['status']);
      const crlfCheck = await taskCompletion();

      expect(crlfStatus.stdout).toBe(lfStatus.stdout);
      expect(crlfCheck).toEqual(lfCheck);
      // Anti-vacuity: both sides would also agree on "no tasks parsed at all".
      expect(lfStatus.stdout).toContain('1/2');
      expect(lfCheck).toBeDefined();
    });
  });

  describe('prospec spec show', () => {
    const SPEC = [
      '---',
      'feature: widget',
      'status: active',
      'story_count: 1',
      'req_count: 2',
      '---',
      '',
      '## US-1: A story [P0]',
      '',
      '#### REQ-WIDGET-001: first',
      'Body one.',
      '',
      '#### REQ-WIDGET-002: second',
      'Body two.',
      '',
    ].join('\n');

    async function seedSpec(): Promise<void> {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'spec-show-test' }),
      );
      await runCli(['init', '--name', 'spec-show-test', '--agents', 'claude']);
      const featuresDir = path.join(tmpDir, 'prospec/specs/features');
      await fs.promises.mkdir(featuresDir, { recursive: true });
      await fs.promises.writeFile(path.join(featuresDir, 'widget.md'), SPEC);
    }

    it('should print only the requested requirement, under its story heading', async () => {
      await seedSpec();
      const { stdout, stderr, exitCode } = await runCli([
        'spec',
        'show',
        'widget',
        '--req',
        'REQ-WIDGET-002',
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toBe(
        '## US-1: A story [P0]\n\n#### REQ-WIDGET-002: second\nBody two.\n',
      );
    });

    it('should exit non-zero and name an unmatched selector on stderr', async () => {
      await seedSpec();
      const { stdout, stderr, exitCode } = await runCli([
        'spec',
        'show',
        'widget',
        '--req',
        'REQ-WIDGET-001,REQ-WIDGET-404',
      ]);
      // The hit is still printed: a partial answer plus a named miss beats both a
      // silent empty success and discarding what did resolve.
      expect(exitCode).toBe(1);
      expect(stdout).toContain('#### REQ-WIDGET-001: first');
      expect(stderr).toContain('REQ-WIDGET-404');
    });

    it('should print the whole spec when no selector is given', async () => {
      await seedSpec();
      const { stdout, exitCode } = await runCli(['spec', 'show', 'widget']);
      expect(exitCode).toBe(0);
      expect(stdout).toBe(SPEC);
    });

    it('should refuse a selector flag that carries no usable id', async () => {
      await seedSpec();
      for (const empty of ['', ',', '  ']) {
        const { stdout, stderr, exitCode } = await runCli([
          'spec',
          'show',
          'widget',
          '--req',
          empty,
        ]);
        // Falling through to the whole-spec branch printed the entire capability
        // record with exit 0 — the read this command replaces, and exactly the
        // argument a station loop builds from an empty REQ list.
        expect(exitCode, JSON.stringify(empty)).not.toBe(0);
        expect(stdout, JSON.stringify(empty)).not.toContain('#### REQ-WIDGET-001');
        expect(stderr, JSON.stringify(empty)).toMatch(/no usable id/i);
      }
    });

    it('should refuse an absent feature and name the ones that exist', async () => {
      await seedSpec();
      const { stderr, exitCode } = await runCli(['spec', 'show', 'nope']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('widget');
    });
  });

  describe('prospec archive', () => {
    async function writeVerifiedChange(name: string): Promise<void> {
      const changeDir = path.join(tmpDir, '.prospec', 'changes', name);
      await fs.promises.mkdir(changeDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(changeDir, 'metadata.yaml'),
        `name: ${name}\ncreated_at: 2026-07-01T00:00:00.000Z\nstatus: verified\nscale: standard\n`,
      );
      await fs.promises.writeFile(
        path.join(changeDir, 'proposal.md'),
        '# Proposal\n\n## User Story\n\nAs a dev, I want X, so that Y.\n',
      );
      await fs.promises.writeFile(
        path.join(changeDir, 'delta-spec.md'),
        '# Delta Spec\n\n## ADDED\n\n### REQ-LIB-001: New helper\n\n**Feature:** alpha\n**Story:** US-1\n\n**Description:**\nDetails.\n\n---\n',
      );
      await fs.promises.writeFile(path.join(changeDir, 'tasks.md'), '- [x] T1 do it ~5 lines\n');
    }

    beforeEach(async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'archive-test' }),
      );
      await runCli(['init', '--name', 'archive-test', '--agents', 'claude']);
    });

    it('previews every mutation with --dry-run and writes nothing', async () => {
      await writeVerifiedChange('feat-x');

      const { stdout, exitCode } = await runCli(['archive', 'feat-x', '--dry-run']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Dry-run — nothing was written');
      expect(stdout).toContain('feat-x');
      expect(stdout).toContain('summary.md');
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes', 'feat-x'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'archive'))).toBe(false);
    });

    it('archives a verified change and syncs Feature Specs', async () => {
      await writeVerifiedChange('feat-x');

      const { stdout, exitCode } = await runCli(['archive', 'feat-x']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('archived feat-x');
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes', 'feat-x'))).toBe(false);
      const today = new Date().toISOString().slice(0, 10);
      const archiveDir = path.join(tmpDir, '.prospec', 'archive', `${today}-feat-x`);
      expect(fs.existsSync(path.join(archiveDir, 'summary.md'))).toBe(true);
      const meta = await fs.promises.readFile(path.join(archiveDir, 'metadata.yaml'), 'utf-8');
      expect(meta).toContain('status: archived');
      expect(
        fs.existsSync(path.join(tmpDir, 'prospec', 'specs', 'features', 'alpha.md')),
      ).toBe(true);
    });

    // Spec-loss guards, end to end (REQ-CLI-034). Asserted through the real
    // compiled CLI because the thing under test is the exit code and the bytes on
    // disk — neither is observable from the service's return value alone.
    async function writeLossyChange(name: string, specBlock: string): Promise<void> {
      await writeVerifiedChange(name);
      const featuresDir = path.join(tmpDir, 'prospec', 'specs', 'features');
      await fs.promises.mkdir(featuresDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(featuresDir, 'alpha.md'),
        `---\nfeature: alpha\nstatus: active\nlast_updated: 2026-01-01\n---\n\n# alpha\n\n## User Stories\n\n### US-1: a story\n\n#### REQ-LIB-002: existing\nOld body.\n- WHEN a happens, THEN b follows\n\n---\n\n## Edge Cases\n\n- none\n`,
      );
      await fs.promises.writeFile(
        path.join(tmpDir, '.prospec', 'changes', name, 'delta-spec.md'),
        `# Delta Spec\n\n## MODIFIED\n\n### REQ-LIB-002: existing\n\n**Feature:** alpha\n**Story:** US-1\n\n**Spec:**\n${specBlock}\n\n**Priority:** High\n\n---\n`,
      );
    }

    const alphaSpec = (): string =>
      fs.readFileSync(path.join(tmpDir, 'prospec', 'specs', 'features', 'alpha.md'), 'utf-8');

    it('exits 1 and leaves the feature spec untouched when a bullet would be dropped', async () => {
      await writeLossyChange('feat-loss', 'A new body that restates nothing.');
      const before = alphaSpec();

      const { stderr, exitCode } = await runCli(['archive', 'feat-loss']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('- WHEN a happens, THEN b follows');
      expect(alphaSpec()).toBe(before);
    });

    it('exits 1 on --dry-run too — a clean preview must mean a clean run', async () => {
      await writeLossyChange('feat-loss', 'A new body that restates nothing.');
      const { exitCode } = await runCli(['archive', 'feat-loss', '--dry-run']);
      expect(exitCode).toBe(1);
    });

    it('exits 1 and writes nothing when a landing block is truncated by a foreign label', async () => {
      await writeLossyChange(
        'feat-trunc',
        'A new body.\n\n**Scenarios:**\n- WHEN a happens, THEN b follows',
      );
      const before = alphaSpec();

      const { stderr, exitCode } = await runCli(['archive', 'feat-trunc']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Scenarios');
      expect(alphaSpec()).toBe(before);
    });

    // The recovery path, end to end (REQ-CLI-034). Holding the feature-spec write
    // is only half a guard: the first implementation held it AFTER the bundle had
    // moved and the change was stamped `archived`, so the remedy the CLI printed
    // was unreachable and the REQ could never land. The verdict now runs before
    // anything moves, which makes "fix the block and re-run" literally true.
    it('leaves the change in place — nothing archived — when the sync would lose text', async () => {
      await writeLossyChange('feat-recover', 'A new body that restates nothing.');

      const { exitCode } = await runCli(['archive', 'feat-recover']);
      expect(exitCode).toBe(1);
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes', 'feat-recover'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'archive'))).toBe(false);
      const meta = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'feat-recover', 'metadata.yaml'),
        'utf-8',
      );
      expect(meta).toContain('status: verified');
      expect(meta).not.toContain('status: archived');
    });

    it('archives cleanly on the re-run after the delta-spec is fixed', async () => {
      await writeLossyChange('feat-recover', 'A new body that restates nothing.');
      expect((await runCli(['archive', 'feat-recover'])).exitCode).toBe(1);

      // The remedy the CLI printed: declare the removal, then re-run. No hand-moving.
      const deltaPath = path.join(tmpDir, '.prospec', 'changes', 'feat-recover', 'delta-spec.md');
      const delta = await fs.promises.readFile(deltaPath, 'utf-8');
      await fs.promises.writeFile(
        deltaPath,
        delta.replace(
          '**Priority:** High',
          '**Dropped:**\n- WHEN a happens, THEN b follows\n\n**Priority:** High',
        ),
      );

      const { exitCode } = await runCli(['archive', 'feat-recover']);
      expect(exitCode).toBe(0);
      expect(alphaSpec()).toContain('A new body that restates nothing.');
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes', 'feat-recover'))).toBe(false);
    });

    it('exits 0 and writes once the drop is declared deliberate', async () => {
      await writeLossyChange(
        'feat-declared',
        'A new body that restates nothing.\n\n**Dropped:**\n- WHEN a happens, THEN b follows',
      );

      const { exitCode } = await runCli(['archive', 'feat-declared']);
      expect(exitCode).toBe(0);
      expect(alphaSpec()).toContain('A new body that restates nothing.');
    });

    it('refuses a non-verified named target with exit 1', async () => {
      const changeDir = path.join(tmpDir, '.prospec', 'changes', 'feat-y');
      await fs.promises.mkdir(changeDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(changeDir, 'metadata.yaml'),
        'name: feat-y\ncreated_at: 2026-07-01T00:00:00.000Z\nstatus: tasks\nscale: quick\n',
      );

      const { stderr, exitCode } = await runCli(['archive', 'feat-y']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('refused feat-y');
      expect(fs.existsSync(changeDir)).toBe(true);
    });

    it('requires at least one change name', async () => {
      const { exitCode, stderr } = await runCli(['archive']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('names');
    });
  });

  describe('prospec knowledge generate (removed, issue #107)', () => {
    it('is no longer a command — content generation is /prospec-knowledge-generate judgment work', async () => {
      await fs.promises.writeFile(path.join(tmpDir, '.prospec.yaml'), 'project:\n  name: t\n');
      const { exitCode, stderr } = await runCli(['knowledge', 'generate']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("unknown command 'generate'");
    });
  });

  describe('cli-first station commands (issue #107)', () => {
    async function initChange(name = 'my-change'): Promise<string> {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'station-test' }),
      );
      await runCli(['init', '--name', 'station-test', '--agents', 'claude']);
      await runCli(['change', 'story', name, '--description', 'station test change']);
      return path.join(tmpDir, '.prospec', 'changes', name);
    }

    it('change scale + change status advance forward and refuse a backward jump', async () => {
      const changeDir = await initChange();
      expect((await runCli(['change', 'scale', 'quick'])).exitCode).toBe(0);
      expect((await runCli(['change', 'status', 'tasks'])).exitCode).toBe(0);
      const back = await runCli(['change', 'status', 'story']);
      expect(back.exitCode).not.toBe(0);
      expect(back.stderr).toContain('forward-only');
      const metadata = await fs.promises.readFile(path.join(changeDir, 'metadata.yaml'), 'utf-8');
      expect(metadata).toContain('scale: quick');
      expect(metadata).toContain('status: tasks');
    });

    it('change log appends a structured quality_log entry with escaped user text', async () => {
      const changeDir = await initChange();
      const { exitCode } = await runCli([
        'change', 'log',
        '--skill', 'prospec-review',
        '--result', 'WARN',
        '--warning', 'tricky: [value] with #comment',
        '--criticals-found', '1',
        '--criticals-fixed', '1',
        '--majors', '0',
      ]);
      expect(exitCode).toBe(0);
      const metadata = await fs.promises.readFile(path.join(changeDir, 'metadata.yaml'), 'utf-8');
      expect(metadata).toContain('skill: prospec-review');
      expect(metadata).toContain('criticals_found: 1');
      // a malformed result is refused by commander's choices
      const bad = await runCli(['change', 'log', '--skill', 's', '--result', 'A']);
      expect(bad.exitCode).not.toBe(0);
    });

    it('change log refuses a judgment dimension without graded_by and records one that carries it', async () => {
      const changeDir = await initChange();
      // the parallel quality_log write path must enforce the same honesty
      // invariant as `verify record` (review DP-7)
      const refused = await runCli([
        'change', 'log',
        '--skill', 'prospec-plan',
        '--result', 'PASS',
        '--dimension', 'architecture=PASS:judgment',
      ]);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('grading context');
      const ok = await runCli([
        'change', 'log',
        '--skill', 'prospec-plan',
        '--result', 'PASS',
        '--dimension', 'architecture=PASS:judgment:fresh-subagent',
      ]);
      expect(ok.exitCode).toBe(0);
      const metadata = await fs.promises.readFile(path.join(changeDir, 'metadata.yaml'), 'utf-8');
      expect(metadata).toContain('graded_by: fresh-subagent');
      // graded_by stays a judgment-only field on this grammar too
      const machine = await runCli([
        'change', 'log',
        '--skill', 'prospec-plan',
        '--result', 'PASS',
        '--dimension', 'tests=PASS:machine:fresh-subagent',
      ]);
      expect(machine.exitCode).not.toBe(0);
      expect(machine.stderr).toContain('judgment dimensions only');
    });

    it('change progress reports code-task X/Y and flips exactly one checkbox', async () => {
      const changeDir = await initChange();
      await fs.promises.writeFile(
        path.join(changeDir, 'tasks.md'),
        '# Tasks\n\n- [ ] T1 first ~10 lines\n- [ ] T2 [M] manual step\n- [ ] T3 second ~10 lines\n',
      );
      const report = await runCli(['change', 'progress']);
      expect(report.exitCode).toBe(0);
      expect(report.stdout).toContain('Progress 0/2');
      const complete = await runCli(['change', 'progress', '--complete', 'T1']);
      expect(complete.exitCode).toBe(0);
      expect(complete.stdout).toContain('Progress 1/2');
      const tasks = await fs.promises.readFile(path.join(changeDir, 'tasks.md'), 'utf-8');
      expect(tasks).toContain('- [x] T1 first');
      expect(tasks).toContain('- [ ] T3 second');
    });

    it('knowledge update refuses change mode without a delta-spec, pointing at --module', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli(['knowledge', 'update', '--change', 'my-change']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('delta-spec.md not found');
    });

    it('knowledge update --change reports a diff-attributed generated module as stamp-only (REQ-SERVICES-097)', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'stamp-only-test' }),
      );
      await runCli(['init', '--name', 'stamp-only-test', '--agents', 'claude']);
      // module-map so paths attribute to lib / templates
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec', 'ai-knowledge', 'module-map.yaml'),
        'modules:\n' +
          '  - name: lib\n    paths: ["src/lib"]\n    keywords: ["lib"]\n' +
          '  - name: templates\n    paths: ["src/templates"]\n    keywords: ["tpl"]\n',
      );
      // an existing templates README → the REQ-named module lands readme-pending, not a skeleton
      const tplReadme = path.join(
        tmpDir, 'prospec', 'ai-knowledge', 'modules', 'templates', 'README.md',
      );
      await fs.promises.mkdir(path.dirname(tplReadme), { recursive: true });
      await fs.promises.writeFile(
        tplReadme,
        '# Templates\n\n<!-- prospec:auto-start -->\ncontent\n<!-- prospec:auto-end -->\n',
      );
      await runCli(['change', 'story', 'my-change', '--description', 'x']);
      const changeDir = path.join(tmpDir, '.prospec', 'changes', 'my-change');
      // delta-spec names ONLY a templates REQ (module-prefix → templates)
      await fs.promises.writeFile(
        path.join(changeDir, 'delta-spec.md'),
        '# Delta\n\n## MODIFIED\n\n### REQ-TEMPLATES-001: wording\n\n**Before:** a\n\n**After:** b\n',
      );

      // commit a baseline so HEAD exists, THEN create working-tree edits: a templates
      // source (REQ-attributed) and a generated lib artifact (diff-attributed only).
      const git = (...a: string[]) => execFileSync('git', a, { cwd: tmpDir, stdio: 'pipe' });
      git('init', '-q');
      git('config', 'user.email', 't@t.dev');
      git('config', 'user.name', 't');
      git('add', '-A');
      git('commit', '-q', '-m', 'base');
      await fs.promises.mkdir(path.join(tmpDir, 'src', 'templates', 'skills'), { recursive: true });
      await fs.promises.writeFile(path.join(tmpDir, 'src', 'templates', 'skills', 'x.hbs'), 'edited\n');
      await fs.promises.mkdir(path.join(tmpDir, 'src', 'lib'), { recursive: true });
      await fs.promises.writeFile(
        path.join(tmpDir, 'src', 'lib', 'bundled-templates.ts'),
        'export const B = {};\n',
      );

      const { exitCode, stdout } = await runCli(['knowledge', 'update', '--change', 'my-change']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('stamp-only');
      expect(stdout).toContain('- lib');
      // templates is REQ-acknowledged (readme-pending), so it is NOT in the stamp-only list
      const stampSection = stdout.slice(stdout.indexOf('stamp-only'));
      expect(stampSection).not.toContain('templates');
    });

    it('review merge builds the cumulative table and reports round counts', async () => {
      const changeDir = await initChange();
      const findings = path.join(tmpDir, 'round.json');
      await fs.promises.writeFile(
        findings,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug', repro: 'pnpm vitest run a' },
        ]),
      );
      const { exitCode, stdout } = await runCli(['review', 'merge', '--findings', findings]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('criticals_found=1');
      const review = await fs.promises.readFile(path.join(changeDir, 'review.md'), 'utf-8');
      expect(review).toContain('| F-1 | src/a.ts:1 | critical | correctness | fixed | 1 | bug | pnpm vitest run a |');
      const bad = await runCli(['review', 'merge', '--findings', path.join(tmpDir, 'missing.json')]);
      expect(bad.exitCode).not.toBe(0);
    });

    it('review merge lands evidence in review.md and keeps it out of stdout', async () => {
      const changeDir = await initChange();
      const findings = path.join(tmpDir, 'round.json');
      const evidence = 'read a.ts:38-46 — the bound overruns.\n\nSECRET-EVIDENCE-PROSE-MARKER';
      await fs.promises.writeFile(
        findings,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:42', severity: 'critical', lens: 'correctness', status: 'open', summary: 'off-by-one', repro: "pnpm vitest run a -t 'bound'", evidence },
        ]),
      );
      const { exitCode, stdout } = await runCli(['review', 'merge', '--findings', findings]);
      expect(exitCode).toBe(0);
      // the digest names the critical and its repro …
      expect(stdout).toContain('criticals to verify before any fix');
      expect(stdout).toContain("repro: pnpm vitest run a -t 'bound'");
      expect(stdout).toContain('1 evidence block(s)');
      // … and never carries the evidence prose, which is the whole contract
      expect(stdout).not.toContain('SECRET-EVIDENCE-PROSE-MARKER');
      const review = await fs.promises.readFile(path.join(changeDir, 'review.md'), 'utf-8');
      expect(review).toContain('SECRET-EVIDENCE-PROSE-MARKER');
      expect(review).toContain('<!-- prospec:evidence F-1 -->');

      // a critical without a repro is refused, and review.md is left as it was
      const before = await fs.promises.readFile(path.join(changeDir, 'review.md'), 'utf-8');
      await fs.promises.writeFile(
        findings,
        JSON.stringify([
          { id: 'F-2', location: 'src/b.ts:1', severity: 'critical', lens: 'security', summary: 'no repro' },
        ]),
      );
      const refused = await runCli(['review', 'merge', '--findings', findings]);
      expect(refused.exitCode).not.toBe(0);
      expect(refused.stderr).toContain('repro');
      expect(await fs.promises.readFile(path.join(changeDir, 'review.md'), 'utf-8')).toBe(before);
    });

    it('review merge tracks round, spend, and renders circuit breaker escalation (REQ-CLI-043, REQ-TESTS-099)', async () => {
      await initChange();
      const findingsR1 = path.join(tmpDir, 'round1.json');
      await fs.promises.writeFile(
        findingsR1,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
        ]),
      );
      // Round 1 with spend 4000 and budget 6000
      const r1 = await runCli(['review', 'merge', '--findings', findingsR1, '--spend', '4000', '--budget', '6000']);
      expect(r1.exitCode).toBe(0);
      expect(r1.stdout).toContain('round=1');
      expect(r1.stdout).toContain('spend: 4,000, cumulative: 4,000 / 6,000');
      expect(r1.stdout).not.toContain('🚨 Circuit Breaker Tripped');

      // Round 2 introduces fix-induced defect with spend 3000 -> cumulative 7000 > budget 6000
      const findingsR2 = path.join(tmpDir, 'round2.json');
      await fs.promises.writeFile(
        findingsR2,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
          { id: 'F-2', location: 'src/b.ts:2', severity: 'critical', lens: 'correctness', summary: 'bug2', repro: 'pnpm b' },
        ]),
      );
      const r2 = await runCli(['review', 'merge', '--findings', findingsR2, '--round', '2', '--spend', '3000', '--budget', '6000', '--lenses', 'correctness,security']);
      expect(r2.exitCode).toBe(0);
      expect(r2.stdout).toContain('round=2');
      expect(r2.stdout).toContain('spend: 3,000, cumulative: 7,000 / 6,000');
      expect(r2.stdout).toContain('🚨 Circuit Breaker Tripped');
      expect(r2.stdout).toContain('spend_budget_exceeded');
      const reviewMd = await fs.promises.readFile(path.join(tmpDir, '.prospec', 'changes', 'my-change', 'review.md'), 'utf-8');
      expect(reviewMd).toContain('lenses="correctness,security"');
      expect(reviewMd).toContain('round="2"');

      // Invalid option values are rejected with UsageError
      const invalid = await runCli(['review', 'merge', '--findings', findingsR2, '--max-fix-induced-ratio', '1.5']);
      expect(invalid.exitCode).not.toBe(0);
      expect(invalid.stderr).toContain('must be a number between 0.0 and 1.0');
    });

    it('review merge is idempotent without --round, trips the fix-induced axis in round 2, and refuses an out-of-sequence round (REQ-CLI-043, REQ-TESTS-099)', async () => {
      const changeDir = await initChange();
      const reviewMd = path.join(changeDir, 'review.md');
      const findingsR1 = path.join(tmpDir, 'fi-round1.json');
      await fs.promises.writeFile(
        findingsR1,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
        ]),
      );
      const r1 = await runCli(['review', 'merge', '--findings', findingsR1, '--round', '1', '--lenses', 'correctness']);
      expect(r1.exitCode).toBe(0);
      expect(r1.stdout).toContain('round=1');
      const afterR1 = await fs.promises.readFile(reviewMd, 'utf-8');
      // the same round merged again without --round: no `change log` closed it, so it stays round 1, byte-identical
      const again = await runCli(['review', 'merge', '--findings', findingsR1, '--lenses', 'correctness']);
      expect(again.exitCode).toBe(0);
      expect(again.stdout).toContain('round=1');
      expect(await fs.promises.readFile(reviewMd, 'utf-8')).toBe(afterR1);

      // round 2: two new criticals against one carried-forward fixed → 2/3 fix-induced > 0.5
      const findingsR2 = path.join(tmpDir, 'fi-round2.json');
      await fs.promises.writeFile(
        findingsR2,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
          { id: 'F-2', location: 'src/b.ts:2', severity: 'critical', lens: 'correctness', summary: 'bug2', repro: 'pnpm b' },
          { id: 'F-3', location: 'src/c.ts:3', severity: 'critical', lens: 'correctness', summary: 'bug3', repro: 'pnpm c' },
        ]),
      );
      const r2 = await runCli(['review', 'merge', '--findings', findingsR2, '--round', '2', '--lenses', 'correctness']);
      expect(r2.exitCode).toBe(0);
      expect(r2.stdout).toContain('fix_induced_ratio=66.7%');
      expect(r2.stdout).toContain('🚨 Circuit Breaker Tripped');
      expect(r2.stdout).toContain('fix_induced_threshold_exceeded');

      // an out-of-sequence explicit round is refused before the first byte
      const afterR2 = await fs.promises.readFile(reviewMd, 'utf-8');
      const bad = await runCli(['review', 'merge', '--findings', findingsR2, '--round', '1', '--lenses', 'correctness']);
      expect(bad.exitCode).not.toBe(0);
      expect(bad.stderr).toContain('out of sequence');
      expect(await fs.promises.readFile(reviewMd, 'utf-8')).toBe(afterR2);
    });

    it('verify record refuses without the drift report, naming the prerequisite', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('prospec-report.json not found');
    });

    it('verify record refuses a judgment set with no graded_by declared', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('missing graded_by');
    });

    it('verify record rejects a --graded-by outside the two-value enum (parser layer)', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'myself',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr.toLowerCase()).toContain('graded-by');
    });

    it('verify record caps the grade below S and prints the remedy when graded in-session', async () => {
      await initChange();
      // A hand-written all-pass report; the tmpdir is not a git repo, so the
      // freshness guard is unadjudicable and skips honestly (no digest needed).
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec-report.json'),
        JSON.stringify({
          version: 1,
          generated_at: '2026-08-22T00:00:00.000Z',
          structural: {
            checks: [
              { id: 'task-completion', status: 'pass' },
              { id: 'knowledge-health', status: 'pass' },
              { id: 'test-provenance', status: 'pass' },
            ],
            findings: [],
          },
          semantic: { status: 'not-checked' },
          summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
        }),
      );
      const { exitCode, stdout } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'in-session',
      ]);
      expect(exitCode).toBe(0);
      // the cap must land in the GRADE, not only in the narration (review TQ-1)
      expect(stdout).toContain('Quality Grade: A');
      expect(stdout).toContain('Grade capped below S');
      expect(stdout).toContain('fresh context');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'my-change', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('graded_by: in-session');
      expect(metadata).toContain('grade: A');
    });

    it('verify record carries run-level --executor/--spend onto each judgment dimension (flag form)', async () => {
      await initChange();
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec-report.json'),
        JSON.stringify({
          version: 1,
          generated_at: '2026-08-22T00:00:00.000Z',
          structural: {
            checks: [
              { id: 'task-completion', status: 'pass' },
              { id: 'knowledge-health', status: 'pass' },
              { id: 'test-provenance', status: 'pass' },
            ],
            findings: [],
          },
          semantic: { status: 'not-checked' },
          summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
        }),
      );
      const { exitCode, stdout } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
        '--executor', 'strongest-tier',
        '--spend', '12345',
      ]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('Quality Grade: S');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'my-change', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('executor: strongest-tier');
      expect(metadata).toContain('spend: 12345');
    });

    it('verify record refuses the run-level context flags alongside --dimensions (usage error)', async () => {
      await initChange();
      const dims = path.join(tmpDir, 'verdicts.json');
      await fs.promises.writeFile(
        dims,
        JSON.stringify([
          { name: 'delta-spec-compliance', result: 'PASS', graded_by: 'fresh-subagent' },
        ]),
      );
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimensions', dims,
        '--graded-by', 'fresh-subagent',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("cannot be used with option '--dimensions <file>'");
      expect(stderr).not.toContain('unexpected error');
    });

    it('verify record refuses an empty --executor and a negative --spend at the parser', async () => {
      await initChange();
      const empty = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--graded-by', 'fresh-subagent',
        '--executor', '',
      ]);
      expect(empty.exitCode).not.toBe(0);
      expect(empty.stderr).toContain('non-empty executor');
      const negative = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--graded-by', 'fresh-subagent',
        '--spend=-3',
      ]);
      expect(negative.exitCode).not.toBe(0);
      expect(negative.stderr).toContain('non-negative integer');
    });

    it('verify record refuses --dimension and --dimensions together', async () => {
      await initChange();
      const dims = path.join(tmpDir, 'verdicts.json');
      await fs.promises.writeFile(
        dims,
        JSON.stringify([{ name: 'delta-spec-compliance', result: 'PASS' }]),
      );
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimensions', dims,
      ]);
      expect(exitCode).not.toBe(0);
      // Commander's own conflict message — declaring the conflict is what makes the
      // refusal render as a usage error; throwing from the action printed
      // "An unexpected error occurred" over the real reason.
      // The full option spec, closing quote included: `'--dimension` alone also
      // matches the message a self-referential `.conflicts('dimensions')` typo
      // produces, so it would pin that A conflict fired, not which one.
      expect(stderr).toContain("cannot be used with option '--dimension <spec>'");
      expect(stderr).not.toContain('unexpected error');
    });

    it('verify record reads --dimensions and refuses a payload past its ceiling', async () => {
      await initChange();
      const dims = path.join(tmpDir, 'verdicts.json');
      await fs.promises.writeFile(
        dims,
        JSON.stringify([
          {
            name: 'delta-spec-compliance',
            result: 'PASS',
            summary: 's'.repeat(RELAYED_FIELD_MAX_CHARS.summary + 1),
          },
        ]),
      );
      const { exitCode, stderr } = await runCli(['verify', 'record', '--dimensions', dims]);
      expect(exitCode).not.toBe(0);
      // the ceiling refusal must precede the missing-report prerequisite
      expect(stderr).toContain('relayed-field ceiling');
      // and the `--dimension` default must not count as "supplied", or the
      // conflict declaration would make the file form unusable on its own
      expect(stderr).not.toContain('cannot be used with');
    });

    it('learn upsert creates the ledger and emits the audit rule string at threshold', async () => {
      await initChange();
      const lesson = path.join(tmpDir, 'lesson.json');
      await fs.promises.writeFile(
        lesson,
        JSON.stringify({
          key: 'test/lesson',
          description: 'a lesson',
          kind: 'playbook',
          source_change: 'my-change',
          impact_modules: ['lib', 'services'],
        }),
      );
      const first = await runCli(['learn', 'upsert', '--lesson', lesson]);
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain('Ledger entry created');
      const ledger = await fs.promises.readFile(
        path.join(tmpDir, 'prospec', 'ai-knowledge', '_lessons-ledger.md'),
        'utf-8',
      );
      expect(ledger).toContain('| test/lesson |');
      // idempotent for the same source change
      const second = await runCli(['learn', 'upsert', '--lesson', lesson]);
      expect(second.stdout).toContain('Ledger entry unchanged');
    });

    it('learn yield analyzes archived reviews and outputs formatted table and json (REQ-CLI-044, REQ-TESTS-100)', async () => {
      await initChange();
      const archiveDir = path.join(tmpDir, '.prospec', 'archive', '2026-01-01-old-change');
      await fs.promises.mkdir(archiveDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(archiveDir, 'review.md'),
        '# Review Findings: old-change\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n| C-1 | src/a.ts:1 | critical | correctness | fixed | bug |\n| M-1 | src/b.ts:1 | major | security | not-found | false positive |\n',
      );

      const tableRes = await runCli(['learn', 'yield']);
      expect(tableRes.exitCode).toBe(0);
      expect(tableRes.stdout).toContain('Review Lens Confirmed Yield Statistics');
      expect(tableRes.stdout).toContain('correctness');
      expect(tableRes.stdout).toContain('security');

      const jsonRes = await runCli(['learn', 'yield', '--json']);
      expect(jsonRes.exitCode).toBe(0);
      const parsed = JSON.parse(jsonRes.stdout);
      expect(parsed.total_changes_analyzed).toBe(1);
      expect(parsed.stats.length).toBe(2);

      // --corpus adds another archive directory; a path that is not a directory is refused
      const otherCorpus = path.join(tmpDir, 'other-corpus');
      await fs.promises.mkdir(path.join(otherCorpus, '2026-02-01-newer-change'), { recursive: true });
      await fs.promises.writeFile(
        path.join(otherCorpus, '2026-02-01-newer-change', 'review.md'),
        '<!-- prospec:review-metrics round="1" lenses="correctness,security" -->\n# Review Findings: newer-change\n\n| ID | Location | Severity | Lens | Status | Summary |\n|---|---|---|---|---|---|\n',
      );
      const withCorpus = await runCli(['learn', 'yield', '--json', '--corpus', otherCorpus]);
      expect(withCorpus.exitCode).toBe(0);
      expect(JSON.parse(withCorpus.stdout).total_changes_analyzed).toBe(2);
      const missing = await runCli(['learn', 'yield', '--corpus', path.join(tmpDir, 'no-such-dir')]);
      expect(missing.exitCode).not.toBe(0);
      expect(missing.stderr).toContain('--corpus');
    });

    it('validate slug exits 0 on PASS and 1 on FAIL (machine gate)', async () => {
      await initChange();
      expect((await runCli(['validate', 'slug', 'user-profile'])).exitCode).toBe(0);
      const bad = await runCli(['validate', 'slug', 'a/../b']);
      expect(bad.exitCode).toBe(1);
      expect(bad.stdout).toContain('FAIL');
    });

    it('archive finalize --dry-run writes NOTHING (parent/child flag shadowing)', async () => {
      // `--dry-run` is declared on both `archive` and `archive finalize`;
      // commander binds it to the parent, so reading the subcommand's own opts
      // silently wrote on a dry run. Reverting to `opts.dryRun` turns this red.
      await initChange();
      const bundle = path.join(tmpDir, '.prospec', 'archive', '2026-07-30-my-change');
      await fs.promises.mkdir(bundle, { recursive: true });
      await fs.promises.writeFile(
        path.join(bundle, 'summary.md'),
        '# my-change\n\n## Review & Verify\n\n- grade: S\n',
      );
      const specsDir = path.join(tmpDir, 'prospec', 'specs', 'features');
      await fs.promises.mkdir(specsDir, { recursive: true });
      const specPath = path.join(specsDir, 'f.md');
      const specBefore = '---\nfeature: f\nstory_count: 0\nreq_count: 0\n---\n\n## US-1: s\n';
      await fs.promises.writeFile(specPath, specBefore);

      const { exitCode, stdout } = await runCli(['archive', 'finalize', 'my-change', '--dry-run']);
      expect(exitCode).toBe(0);
      expect(stdout).toContain('dry-run');
      expect(fs.existsSync(path.join(tmpDir, 'prospec', 'specs', '_archived-history'))).toBe(false);
      expect(await fs.promises.readFile(specPath, 'utf-8')).toBe(specBefore);
    });

    it('archive finalize refuses without an archived bundle', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli(['archive', 'finalize', 'my-change']);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('No archived bundle');
    });

    it('agent triggers --write inserts only missing keys, preserving the config', async () => {
      await initChange();
      const configPath = path.join(tmpDir, '.prospec.yaml');
      const before = await fs.promises.readFile(configPath, 'utf-8');
      const scaffold = path.join(tmpDir, 'triggers.yaml');
      await fs.promises.writeFile(scaffold, 'skill_triggers:\n  prospec-verify:\n    - 驗證\n');
      const { exitCode } = await runCli(['agent', 'triggers', '--write', scaffold]);
      expect(exitCode).toBe(0);
      const after = await fs.promises.readFile(configPath, 'utf-8');
      expect(after).toContain('prospec-verify:');
      expect(after).toContain('- 驗證');
      expect(after).toContain(before.split('\n')[0]!);
      // unknown skill name is refused before touching the config
      await fs.promises.writeFile(scaffold, 'skill_triggers:\n  prospec-nope:\n    - x\n');
      const bad = await runCli(['agent', 'triggers', '--write', scaffold]);
      expect(bad.exitCode).not.toBe(0);
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

