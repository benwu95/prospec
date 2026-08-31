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

describe('CLI E2E — change & spec', () => {
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
      expect(stdout).toMatch(/next:\s+prospec-plan/);
      expect(stdout).not.toMatch(/next:\s+\/prospec-plan/);
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

  describe('prospec change status — Gate C (implemented requires code tasks)', () => {
    async function setup(): Promise<void> {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'gatec-test' }),
      );
      await runCli(['init', '--name', 'gatec-test', '--agents', 'claude']);
      await runCli(['change', 'story', 'feat-c', '--description', 'x']);
    }
    const tasksPath = (): string =>
      path.join(tmpDir, '.prospec', 'changes', 'feat-c', 'tasks.md');

    it('refuses `change status implemented` while a code task is unchecked', async () => {
      await setup();
      await fs.promises.writeFile(tasksPath(), '- [x] T1 done ~5 lines\n- [ ] T2 pending ~5 lines\n');
      const { exitCode, stderr } = await runCli(['change', 'status', 'implemented']);
      expect(exitCode).toBe(1);
      expect(stderr).toContain('1/2 code tasks');
    });

    it('allows it once every code task is checked', async () => {
      await setup();
      await fs.promises.writeFile(tasksPath(), '- [x] T1 done ~5 lines\n- [x] T2 done ~5 lines\n');
      const { exitCode } = await runCli(['change', 'status', 'implemented']);
      expect(exitCode).toBe(0);
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
      // Satisfy archive's mechanized Entry Gate so these tests reach the archive
      // mechanics (the gate's own refusals are unit-tested): a fresh all-passing
      // report + a stamped `lib` module-map/README (the delta-spec's REQ-LIB module)
      // so knowledge-sync passes. tmpDir is not a git repo, so freshness skips.
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec-report.json'),
        JSON.stringify({
          version: 1,
          generated_at: '2026-08-29T00:00:00.000Z',
          structural: { checks: [{ id: 'req-references', status: 'pass' }], findings: [] },
          semantic: { status: 'not-checked' },
          summary: { fail_count: 0, warn_count: 0, skipped_count: 0 },
        }),
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec', 'ai-knowledge', 'module-map.yaml'),
        'modules:\n  - name: lib\n    paths:\n      - src/lib\n    keywords: []\n    last_verified: 2026-07-01T00:00:00.000Z\n',
      );
      await fs.promises.mkdir(path.join(tmpDir, 'prospec', 'ai-knowledge', 'modules', 'lib'), {
        recursive: true,
      });
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec', 'ai-knowledge', 'modules', 'lib', 'README.md'),
        '# lib\n',
      );
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

});
