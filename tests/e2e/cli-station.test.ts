import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ExecutorStatsReportSchema, RELAYED_FIELD_MAX_CHARS } from '../../src/types/station.js';
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

describe('CLI E2E — station commands', () => {
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

    it('status surfaces unresolved warnings on the terminal and in --json, cleared by a later PASS (issue #228)', async () => {
      await initChange();
      await runCli([
        'change', 'log',
        '--skill', 'prospec-plan',
        '--result', 'WARN',
        '--warning', 'sizing note',
      ]);

      const human = await runCli(['status']);
      expect(human.stdout).toContain('warn:');
      expect(human.stdout).toContain('sizing note');

      const json = await runCli(['status', '--json']);
      const report = JSON.parse(json.stdout) as {
        changes: Array<{ name: string; unresolvedWarnings?: Array<{ skill: string; warning: string }> }>;
      };
      const change = report.changes.find((c) => c.name === 'my-change');
      expect(change?.unresolvedWarnings).toEqual([
        { skill: 'prospec-plan', warning: 'sizing note', date: expect.any(String) },
      ]);

      // a later same-skill PASS supersedes the WARN
      await runCli(['change', 'log', '--skill', 'prospec-plan', '--result', 'PASS']);
      const json2 = await runCli(['status', '--json']);
      const report2 = JSON.parse(json2.stdout) as {
        changes: Array<{ name: string; unresolvedWarnings?: unknown }>;
      };
      const change2 = report2.changes.find((c) => c.name === 'my-change');
      expect(change2?.unresolvedWarnings).toBeUndefined();
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

});

describe('CLI E2E — executor labels and learn stats (REQ-CLI-012, REQ-CLI-052, REQ-TESTS-112)', () => {
  const write = (rel: string, content: string) => {
    const abs = path.join(tmpDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
  const CONFIG = ['version: "2.0"', 'project:', '  name: e2e', 'paths:', '  base_dir: prospec'];
  const REPORT = JSON.stringify({
    version: 1,
    generated_at: '2026-09-03T00:00:00.000Z',
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
  });

  // `check --record-review` needs a git tree to fingerprint; `verify record` with a
  // digest-less report needs the OPPOSITE (a fingerprintable tree makes it refuse the
  // report as stale) — so the git half is opt-in.
  function scaffold(executors?: string[], withGit = true): void {
    write('.prospec.yaml', [...CONFIG, ...(executors ? ['executors:', ...executors.map((e) => `  - ${e}`)] : [])].join('\n') + '\n');
    write('.prospec/changes/c1/metadata.yaml', 'name: c1\ncreated_at: 2026-09-01T00:00:00.000Z\nstatus: implemented\nscale: standard\n');
    write('prospec-report.json', REPORT);
    if (!withGit) return;
    git('init', '-q');
    git('config', 'user.email', 'e2e@test.dev');
    git('config', 'user.name', 'e2e');
    git('add', '.');
    git('commit', '-q', '-m', 'fixture');
  }
  const metadata = () => fs.readFileSync(path.join(tmpDir, '.prospec/changes/c1/metadata.yaml'), 'utf-8');

  it('check --record-review --executor records the label inside review_provenance; empty label refused at the parser', async () => {
    scaffold();
    const recorded = await runCli(['check', '--record-review', '--graded-by', 'fresh-subagent', '--executor', 'judge', '--change', 'c1']);
    expect(recorded.exitCode).toBe(0);
    expect(metadata()).toMatch(/review_provenance:\n(?:[ \t]+\S[^\n]*\n)*?[ \t]+executor: judge/);
    const empty = await runCli(['check', '--record-review', '--executor', '', '--change', 'c1']);
    expect(empty.exitCode).not.toBe(0);
    expect(empty.stderr).toContain('non-empty executor');
  });

  it('a declared vocabulary refuses an undeclared label through BOTH write paths and leaves metadata unchanged', async () => {
    scaffold(['judge', 'drafter']);
    const before = metadata();
    const review = await runCli(['check', '--record-review', '--graded-by', 'fresh-subagent', '--executor', 'reviewer', '--change', 'c1']);
    expect(review.exitCode).not.toBe(0);
    expect(review.stderr).toContain('not a declared label');
    expect(review.stderr).toContain('judge, drafter');
    expect(metadata()).toBe(before);
  });

  it('a declared vocabulary refuses an undeclared label at verify record too, and records a declared one', async () => {
    scaffold(['judge', 'drafter'], false);
    const before = metadata();
    const verify = await runCli([
      'verify', 'record', '--change', 'c1',
      '--dimension', 'delta-spec-compliance=PASS',
      '--dimension', 'constitution=PASS',
      '--dimension', 'design=not-applicable',
      '--graded-by', 'fresh-subagent',
      '--executor', 'reviewer',
    ]);
    expect(verify.exitCode).not.toBe(0);
    expect(verify.stderr).toContain('not a declared label');
    expect(metadata()).toBe(before);

    const ok = await runCli([
      'verify', 'record', '--change', 'c1',
      '--dimension', 'delta-spec-compliance=PASS',
      '--dimension', 'constitution=PASS',
      '--dimension', 'design=not-applicable',
      '--graded-by', 'fresh-subagent',
      '--executor', 'drafter',
    ]);
    expect(ok.exitCode).toBe(0);
    expect(metadata()).toContain('executor: drafter');
  });

  it('learn stats groups archived metadata per executor; --json writes the report file and keeps stdout human-readable', async () => {
    write('.prospec.yaml', CONFIG.join('\n') + '\n');
    const archived = (name: string, executor: string, grade: string, result: string, review?: string) =>
      write(
        `.prospec/archive/${name}/metadata.yaml`,
        [
          `name: ${name.slice(11)}`,
          'status: archived',
          'quality_log:',
          '  - skill: prospec-verify',
          '    date: 2026-09-02',
          '    result: PASS',
          '    warnings: []',
          `    grade: ${grade}`,
          '    dimensions:',
          '      - name: constitution',
          `        result: ${result}`,
          '        adjudicator: judgment',
          '        graded_by: fresh-subagent',
          `        executor: ${executor}`,
          '        spend: 1000',
          ...(review ? ['review_provenance:', '  digest: d', '  date: 2026-09-01', `  executor: ${review}`] : []),
          '',
        ].join('\n'),
      );
    archived('2026-09-01-a', 'judge', 'S', 'PASS', 'reviewer');
    archived('2026-09-02-b', 'judge', 'C', 'FAIL', 'reviewer');
    archived('2026-09-03-c', 'drafter', 'A', 'WARN');
    write('.prospec/archive/2026-09-04-d/metadata.yaml', 'key: [unclosed');

    const text = await runCli(['learn', 'stats']);
    expect(text.exitCode).toBe(0);
    expect(text.stdout).toContain('Per-Executor Statistics (3 changes analyzed, 1 skipped');
    expect(text.stdout).toContain('judge');
    expect(text.stdout).toContain('S=1 C=1');
    expect(text.stdout).toContain('1 false greens');
    expect(text.stdout).not.toContain('Report written');

    const json = await runCli(['learn', 'stats', '--json']);
    expect(json.exitCode).toBe(0);
    expect(json.stdout).toContain('Per-Executor Statistics');
    expect(json.stdout).toContain('Report written');
    const reportPath = path.join(tmpDir, 'executor-stats-report.json');
    const report = ExecutorStatsReportSchema.parse(JSON.parse(fs.readFileSync(reportPath, 'utf-8')));
    expect(report.total_changes_analyzed).toBe(3);
    expect(report.skipped).toBe(1);
    expect(report.stats.map((s) => s.executor)).toEqual(['drafter', 'judge', 'reviewer']);
    expect(report.stats.find((s) => s.executor === 'judge')?.spend).toEqual({ samples: 2, median: 1000 });
    expect(report.stats.find((s) => s.executor === 'reviewer')?.false_greens).toBe(1);

    const refused = await runCli(['learn', 'stats', '--corpus', path.join(tmpDir, 'nowhere')]);
    expect(refused.exitCode).not.toBe(0);
    expect(refused.stderr).toContain('--corpus');
  });
});
