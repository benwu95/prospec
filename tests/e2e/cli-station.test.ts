import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { RELAYED_FIELD_MAX_CHARS } from '../../src/types/station.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { recordCliEvidence } from './helpers/evidence.js';
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
  async function initChange(name = 'my-change'): Promise<string> {
    await fs.promises.writeFile(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'station-test' }),
    );
    await runCli(['init', '--name', 'station-test', '--agents', 'claude']);
    await runCli(['change', 'story', name, '--description', 'station test change']);
    return path.join(tmpDir, '.prospec', 'changes', name);
  }

  describe('cli-first station commands (issue #107)', () => {

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
        '--skill', 'prospec-verify',
        '--result', 'PASS',
        '--grade', 'A',
        '--warning', 'tricky: [value] with #comment',
      ]);
      expect(exitCode).toBe(0);
      const metadata = await fs.promises.readFile(path.join(changeDir, 'metadata.yaml'), 'utf-8');
      expect(metadata).toContain('skill: prospec-verify');
      expect(metadata).toContain('grade: A');
      // a malformed result is refused by commander's choices
      const bad = await runCli(['change', 'log', '--skill', 's', '--result', 'A']);
      expect(bad.exitCode).not.toBe(0);
    });

    /**
     * The next-station reference map through the real CLI (REQ-SERVICES-111,
     * REQ-CLI-023). Every case asserts the pre-existing routing output beside the
     * map, so "additive" is proved rather than assumed.
     */
    describe('status prints the next station reference map', () => {
      const mapOf = async (name: string) => {
        const json = await runCli(['status', '--json']);
        const report = JSON.parse(json.stdout) as {
          clean: boolean;
          changes: Array<{
            name: string;
            next: string | null;
            nextSkillPath?: string;
            blockingGates: string[];
            reasons: string[];
            nextReferenceMap?: Array<{ phase: string; referencePath: string; purpose: string; loading: string; conditionHint?: string }>;
          }>;
        };
        const change = report.changes.find((c) => c.name === name)!;
        expect(change.next, 'routing still resolves a next station').not.toBeUndefined();
        expect(Array.isArray(change.reasons)).toBe(true);
        expect(Array.isArray(change.blockingGates)).toBe(true);
        return change;
      };

      it('quick routes to tasks and lists that station load points', async () => {
        await initChange('quick-change');
        await runCli(['change', 'scale', 'quick']);
        const change = await mapOf('quick-change');
        expect(change.next).toBe('tasks');
        expect(change.nextSkillPath).toBe('.claude/skills/prospec-tasks/SKILL.md');
        expect(change.nextReferenceMap?.map((row) => row.referencePath)).toContain(
          '.claude/skills/prospec-tasks/references/tasks-format.md',
        );
        const human = await runCli(['status']);
        expect(human.stdout).toContain('action:');
        expect(human.stdout).toContain('read:');
        expect(human.stdout).toContain('references/tasks-format.md');
      });

      it('standard routes through plan and lists its per-phase reads', async () => {
        await initChange('standard-change');
        const change = await mapOf('standard-change');
        expect(change.next).toBe('plan');
        const phases = change.nextReferenceMap?.map((row) => row.phase) ?? [];
        expect(phases).toContain('Phase 4: Design plan.md');
        expect(phases).toContain('Phase 5: Generate delta-spec.md');
      });

      it('full keeps the tournament reference its scale reaches', async () => {
        await initChange('full-change');
        await runCli(['change', 'scale', 'full']);
        const change = await mapOf('full-change');
        expect(change.next).toBe('plan');
        const row = change.nextReferenceMap?.find((r) => r.referencePath.endsWith('candidate-evaluation.md'));
        expect(row?.conditionHint).toBeTruthy();
      });

      it('backfill reaches verify with its backfill-only load points', async () => {
        await initChange('backfill-change');
        await runCli(['change', 'scale', 'backfill']);
        await runCli(['change', 'status', 'implemented']);
        const change = await mapOf('backfill-change');
        expect(change.next).toBe('review');
        expect(change.nextReferenceMap?.map((row) => row.referencePath)).toContain(
          '.claude/skills/prospec-review/references/review-format.md',
        );
      });

      it('prints a UI-scoped route without inventing a decision it cannot make', async () => {
        const changeDir = await initChange('ui-change');
        await fs.promises.writeFile(
          path.join(changeDir, 'proposal.md'),
          '# p\n\n## UI Scope\n\n**Scope:** full\n',
        );
        await runCli(['change', 'status', 'plan']);
        const change = await mapOf('ui-change');
        expect(change.next).toBe('design');
        const conditions = (change.nextReferenceMap ?? [])
          .map((row) => row.conditionHint)
          .filter((hint): hint is string => hint !== undefined);
        // The platform adapters are a runtime choice; they are shown WITH their
        // condition rather than silently narrowed to one.
        expect(conditions.some((hint) => hint.includes('design.platform'))).toBe(true);
      });

      it('fabricates no path when the project configures no agent', async () => {
        await initChange('no-agent-change');
        const configPath = path.join(tmpDir, '.prospec.yaml');
        const config = await fs.promises.readFile(configPath, 'utf-8');
        await fs.promises.writeFile(configPath, config.replace(/agents:\n(?:\s+-\s+\w+\n)+/, 'agents: []\n'));
        const change = await mapOf('no-agent-change');
        // Routing still happens; only the deployment-derived halves are absent.
        expect(change.next).toBe('plan');
        expect(change.nextSkillPath).toBeUndefined();
        expect(change.nextReferenceMap).toBeUndefined();
        const human = await runCli(['status']);
        expect(human.stdout).toContain('next:');
        expect(human.stdout).not.toContain('read:');
      });

      it('names the configured host root, not a hardcoded one', async () => {
        await fs.promises.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'station-test' }));
        await runCli(['init', '--name', 'station-test', '--agents', 'codex']);
        await runCli(['change', 'story', 'codex-change', '--description', 'host test']);
        const change = await mapOf('codex-change');
        expect(change.nextSkillPath?.startsWith('.agents/skills/')).toBe(true);
        for (const row of change.nextReferenceMap ?? []) {
          expect(row.referencePath.startsWith('.agents/skills/')).toBe(true);
        }
      });
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

    it('verify record refuses absent current review even without a saved report', async () => {
      await initChange();
      const { exitCode, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('review-provenance');
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
      await recordCliEvidence(tmpDir, 'my-change');
      const { exitCode, stdout, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'in-session',
      ]);
      expect(exitCode, stderr).toBe(0);
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
      await recordCliEvidence(tmpDir, 'my-change');
      const { exitCode, stdout, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
        '--executor', 'strongest-tier',
        '--spend', '12345',
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain('Quality Grade: S');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'my-change', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('executor: strongest-tier');
      expect(metadata).toContain('spend: 12345');
    });

    it('pins the default init Constitution (no declarations) running the unchanged audit path (REQ-SERVICES-113, REQ-TESTS-057)', async () => {
      await initChange('init-compat');
      // Capture the authentic default Constitution generated by `prospec init`
      const initConstitution = await fs.promises.readFile(
        path.join(tmpDir, 'prospec', 'CONSTITUTION.md'),
        'utf-8',
      );
      // Insert a project-authored rule inside ## Principles (before Quality Standards)
      // without check: so constitution-severity passes (no seeded-only warn)
      const constitutionWithAuthorRule = initConstitution.replace(
        '## Quality Standards',
        '### [MUST] Domain Invariants\n\n**Description**: Invariants are checked.\n\n**Verify**: Entity methods enforce invariants.\n\n---\n\n## Quality Standards',
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec', 'CONSTITUTION.md'),
        constitutionWithAuthorRule,
      );

      const { parseConstitutionRules } = await import('../../src/lib/constitution-parser.js');
      const parsed = parseConstitutionRules(constitutionWithAuthorRule);
      expect(parsed.length).toBeGreaterThan(1);
      expect(parsed.every((r) => r.check_id === undefined && r.coverage === undefined)).toBe(true);

      const configPath = path.join(tmpDir, '.prospec.yaml');
      const { parseDocument } = await import('yaml');
      const config = parseDocument(await fs.promises.readFile(configPath, 'utf8'));
      config.setIn(['tech_stack', 'test_command'], `${process.execPath} suite.cjs`);
      await fs.promises.writeFile(configPath, config.toString());
      await fs.promises.writeFile(path.join(tmpDir, 'suite.cjs'), 'process.exitCode = 0;\n');
      const knowledge = path.join(tmpDir, 'prospec/ai-knowledge');
      await fs.promises.mkdir(knowledge, { recursive: true });
      await fs.promises.writeFile(path.join(knowledge, 'module-map.yaml'), 'modules: []\n');
      await fs.promises.writeFile(
        path.join(tmpDir, '.prospec/changes/init-compat/tasks.md'),
        '- [x] T1 Fixture complete\n',
      );

      const { execFileSync } = await import('node:child_process');
      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
      git('init', '-q');
      git('config', 'user.name', 'Fixture');
      git('config', 'user.email', 'fixture@example.com');
      git('add', '.');
      git('commit', '--allow-empty', '-qm', 'fixture with init constitution');

      const rReview = await runCli(['change', 'log', '--change', 'init-compat', '--skill', 'prospec-review', '--result', 'PASS']);
      expect(rReview.exitCode).toBe(0);
      const rRecReview = await runCli(['check', '--change', 'init-compat', '--record-review', '--graded-by', 'fresh-subagent']);
      expect(rRecReview.exitCode).toBe(0);
      const rRecTests = await runCli(['check', '--change', 'init-compat', '--record-tests']);
      expect(rRecTests.exitCode).toBe(0);


      const { exitCode, stdout, stderr } = await runCli([
        'verify', 'record',
        '--change', 'init-compat',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
      ]);
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain('Quality Grade: S');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'init-compat', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('status: verified');
      expect(metadata).toContain('grade: S');
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

      const { exitCode, stdout, stderr } = await runCli(['archive', 'finalize', 'my-change', '--dry-run']);
      expect(exitCode, stderr).toBe(0);
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
      const { exitCode, stderr } = await runCli(['agent', 'triggers', '--write', scaffold]);
      expect(exitCode, stderr).toBe(0);
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

it('reports source mutation during tests and refuses archive through normal command entry', async () => {
  await runCli(['init', '--name', 'mutation', '--agents', 'claude']);
  await runCli(['change', 'story', 'mutation', '--description', 'fixture']);
  await recordCliEvidence(tmpDir, 'mutation');
  await runCli(['change', 'status', 'implemented']);
  fs.writeFileSync(path.join(tmpDir, 'suite.cjs'), "const fs=require('fs');require('assert').strictEqual(fs.readFileSync('input.txt','utf8'),'old');fs.writeFileSync('input.txt','new');");
  fs.writeFileSync(path.join(tmpDir, 'input.txt'), 'old');
  await runCli(['check', '--record-review']);
  const result = await runCli(['check', '--record-tests']);
  expect(result.stdout + result.stderr).toContain('passing evidence is not certified');
  const metadataPath = path.join(tmpDir, '.prospec/changes/mutation/metadata.yaml');
  expect(fs.readFileSync(metadataPath, 'utf8')).toContain('outcome: unprovable');
  const verification = await runCli(['verify', 'record', '--dimension', 'delta-spec-compliance=PASS', '--dimension', 'constitution=PASS', '--dimension', 'design=not-applicable', '--graded-by', 'fresh-subagent']);
  expect(verification.exitCode).toBe(1);
  for (const extra of [[], ['--dry-run']]) {
    const before = fs.readFileSync(metadataPath);
    expect((await runCli(['archive', 'mutation', ...extra])).exitCode).toBe(1);
    expect(fs.readFileSync(metadataPath)).toEqual(before);
  }
});

describe('change log --verifier-report (REQ-CLI-053, issue #266)', () => {
  const planReport = (verdict: string, extra: Record<string, unknown> = {}) => ({
    verdict,
    dimensions: Object.fromEntries(
      ['project_layering', 'blast_radius', 'state_safety', 'delta_spec', 'reuse'].map((d) => [d, { result: verdict === 'FLAWS' && d === 'reuse' ? 'FLAWS' : 'PASS', rationale: `${d} assessed` }]),
    ),
    evidence: 'audit',
    ...extra,
  });
  const writeReport = (name: string, body: unknown): string => {
    const p = path.join(tmpDir, name);
    fs.writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
    return p;
  };
  async function initChange(): Promise<string> {
    await runCli(['init', '--name', 'e2e', '--agents', 'claude']);
    await runCli(['change', 'story', 'plan-me', '--description', 'fixture']);
    await runCli(['change', 'plan']);
    return path.join(tmpDir, '.prospec/changes/plan-me');
  }

  it('records a FLAWS report as result FAIL and status routes back to plan; a later PASS supersedes it', async () => {
    const changeDir = await initChange();
    const flaws = await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', writeReport('r1.json', planReport('FLAWS'))]);
    expect(flaws.exitCode).toBe(0);
    let metadata = fs.readFileSync(path.join(changeDir, 'metadata.yaml'), 'utf-8');
    expect(metadata).toContain('result: FAIL');
    expect(metadata).toContain('reuse: reuse assessed');
    const routed = await runCli(['status', '--json']);
    const route = (JSON.parse(routed.stdout) as { changes: Array<{ next: string; code: string }> }).changes[0]!;
    expect(route.next).toBe('plan');
    expect(route.code).toBe('PLAN_VERIFIER_FAILED');
    expect((await runCli(['status'])).stdout).toContain('[PLAN_VERIFIER_FAILED]');

    expect((await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', writeReport('r2.json', planReport('PASS'))])).exitCode).toBe(0);
    metadata = fs.readFileSync(path.join(changeDir, 'metadata.yaml'), 'utf-8');
    expect(metadata).toContain('result: PASS');
    const after = JSON.parse((await runCli(['status', '--json'])).stdout) as { changes: Array<{ next: string }> };
    expect(after.changes[0]!.next).toBe('tasks');
  });

  it('refuses an unknown verdict enum and an extra key before writing, exit 1 with the field path', async () => {
    const changeDir = await initChange();
    const before = fs.readFileSync(path.join(changeDir, 'metadata.yaml'), 'utf-8');
    const bad = await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', writeReport('bad.json', planReport('FLAW'))]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stderr).toContain('verdict');
    const extra = await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', writeReport('extra.json', planReport('PASS', { bonus: true }))]);
    expect(extra.exitCode).toBe(1);
    expect(fs.readFileSync(path.join(changeDir, 'metadata.yaml'), 'utf-8')).toBe(before);
  });

  it('refuses --verifier-report alongside --result (usage error) and neither at all', async () => {
    await initChange();
    const both = await runCli(['change', 'log', '--skill', 'prospec-plan', '--result', 'PASS', '--verifier-report', writeReport('r.json', planReport('PASS'))]);
    expect(both.exitCode).not.toBe(0);
    expect(both.stderr).toMatch(/cannot be used with|conflicts/i);
    const neither = await runCli(['change', 'log', '--skill', 'prospec-plan']);
    expect(neither.exitCode).toBe(1);
    expect(neither.stderr).toMatch(/--result|--verifier-report/);
  });
});

describe('fresh-test gates through the CLI (REQ-SERVICES-103, REQ-CLI-028, REQ-CLI-043)', () => {
  const metadataOf = (name: string) => fs.readFileSync(path.join(tmpDir, '.prospec/changes', name, 'metadata.yaml'), 'utf8');
  const writeFindings = () => {
    // under .prospec/ so the findings file is not itself a repository input
    const p = path.join(tmpDir, '.prospec/round.json');
    fs.writeFileSync(p, JSON.stringify([{ id: 'F-1', location: 'src/a.ts:1', severity: 'major', lens: 'correctness', summary: 'fixture' }]));
    return p;
  };
  async function initTasksDone(name: string): Promise<void> {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'gate-test' }));
    await runCli(['init', '--name', 'gate-test', '--agents', 'claude']);
    await runCli(['change', 'story', name, '--description', 'gate fixture']);
    fs.writeFileSync(path.join(tmpDir, '.prospec/changes', name, 'tasks.md'), '- [x] T1 done ~1 lines\n');
    await runCli(['change', 'status', 'tasks']);
  }
  const setTestCommand = (command: string | null) => {
    const configPath = path.join(tmpDir, '.prospec.yaml');
    const text = fs.readFileSync(configPath, 'utf8').split('\n').filter((l) => !l.startsWith('  test_command:')).join('\n');
    fs.writeFileSync(configPath, command === null ? text : text.replace(/^tech_stack:\n/m, `tech_stack:\n  test_command: ${command}\n`));
  };

  it('no test command (non-Git): both entrances pass with a deduplicated tests: not-adjudicated WARN under prospec-test-gate', async () => {
    await initTasksDone('nocmd');
    const status = await runCli(['change', 'status', 'implemented']);
    expect(status.exitCode).toBe(0);
    expect(status.stdout).toContain('tests: not-adjudicated (no-command)');
    expect(status.stdout).toContain('recorded in quality_log');
    expect(metadataOf('nocmd')).toContain('status: implemented');
    expect(metadataOf('nocmd')).toContain('skill: prospec-test-gate');
    const merge = await runCli(['review', 'merge', '--findings', writeFindings()]);
    expect(merge.exitCode).toBe(0);
    expect(merge.stdout).toContain('tests: not-adjudicated (no-command)');
    expect(merge.stdout).toContain('criticals_found=0');
    const again = await runCli(['review', 'merge', '--findings', writeFindings()]);
    expect(again.stdout).toContain('already recorded');
    const meta = metadataOf('nocmd');
    expect((meta.match(/skill: prospec-test-gate/g) ?? []).length).toBe(2);
    expect((meta.match(/skill: prospec-review/g) ?? []).length).toBe(1);
  });

  it('a proven backfill passes with the backfill WARN; scale alone is refused with the remediation', async () => {
    await initTasksDone('bf');
    setTestCommand(`${process.execPath} -e 0`);
    fs.rmSync(path.join(tmpDir, '.prospec/changes/bf/tasks.md'));
    await runCli(['change', 'scale', 'backfill']);
    const unproven = await runCli(['change', 'status', 'implemented']);
    expect(unproven.exitCode).toBe(1);
    expect(unproven.stderr).toContain('prospec check --record-tests --change bf');
    expect(metadataOf('bf')).toContain('status: tasks');
    fs.writeFileSync(path.join(tmpDir, '.prospec/changes/bf/backfill-draft.md'), '# draft\n');
    const proven = await runCli(['change', 'status', 'implemented']);
    expect(proven.exitCode).toBe(0);
    expect(proven.stdout).toContain('tests: not-adjudicated (proven-backfill)');
    const merge = await runCli(['review', 'merge', '--findings', writeFindings()]);
    expect(merge.exitCode).toBe(0);
    expect(merge.stdout).toContain('(proven-backfill)');
  });

  it('a known-red run is refused at both entrances even after the command stops resolving; a fresh green passes', async () => {
    await initTasksDone('red');
    await recordCliEvidence(tmpDir, 'red');
    fs.writeFileSync(path.join(tmpDir, 'suite.cjs'), 'process.exitCode = 1;\n');
    const recorded = await runCli(['check', '--record-tests']);
    expect(recorded.exitCode).toBe(0);
    const status = await runCli(['change', 'status', 'implemented']);
    expect(status.exitCode).toBe(1);
    expect(status.stderr).toContain('exited 1');
    expect(status.stderr).toContain('prospec check --record-tests --change red');
    setTestCommand(null);
    const stillRed = await runCli(['change', 'status', 'implemented']);
    expect(stillRed.exitCode).toBe(1);
    expect(stillRed.stderr).toContain('exited 1');
    expect(metadataOf('red')).toContain('status: tasks');
    const merge = await runCli(['review', 'merge', '--findings', writeFindings()]);
    expect(merge.exitCode).toBe(1);
    expect(merge.stderr).toContain('prospec check --record-tests --change red');
    // back to green: a fresh certified run admits the transition
    setTestCommand(`${process.execPath} suite.cjs`);
    fs.writeFileSync(path.join(tmpDir, 'suite.cjs'), 'process.exitCode = 0;\n');
    expect((await runCli(['check', '--record-tests'])).exitCode).toBe(0);
    const green = await runCli(['change', 'status', 'implemented']);
    expect(green.exitCode).toBe(0);
    expect(green.stdout).not.toContain('not-adjudicated');
    expect(metadataOf('red')).toContain('status: implemented');
  });

  it('three distinct failed attempts trip persistent_test_failure on review merge; a replayed attempt never counts twice', async () => {
    await initTasksDone('streak');
    await recordCliEvidence(tmpDir, 'streak');
    fs.writeFileSync(path.join(tmpDir, 'suite.cjs'), 'process.exitCode = 1;\n');
    const reviewPath = path.join(tmpDir, '.prospec/changes/streak/review.md');
    const findings = writeFindings();
    for (const n of [1, 2]) {
      await runCli(['check', '--record-tests']);
      const merge = await runCli(['review', 'merge', '--findings', findings]);
      expect(merge.exitCode).toBe(1);
      expect(merge.stderr).not.toContain('ESCALATE_TO_HUMAN');
      expect(fs.readFileSync(reviewPath, 'utf8')).toContain(`test_failures="${n}"`);
    }
    const replay = await runCli(['review', 'merge', '--findings', findings]);
    expect(replay.exitCode).toBe(1);
    expect(fs.readFileSync(reviewPath, 'utf8')).toContain('test_failures="2"');
    await runCli(['check', '--record-tests']);
    const tripped = await runCli(['review', 'merge', '--findings', findings]);
    expect(tripped.exitCode).toBe(1);
    expect(tripped.stderr).toContain('ESCALATE_TO_HUMAN');
    expect(tripped.stderr).toContain('persistent_test_failure');
    expect(tripped.stderr).toMatch(/3 \/ 3/);
    const review = fs.readFileSync(reviewPath, 'utf8');
    expect(review).toContain('test_failures="3"');
    expect(review).not.toContain('| F-1 |');
    // the only prospec-review entry is the fixture's own; no refused merge logged a round
    expect((metadataOf('streak').match(/skill: prospec-review/g) ?? []).length).toBe(1);
  });

  describe('CLI-owned review round counts (issue #274, REQ-TESTS-121)', () => {
    async function initReviewChange(name = 'rc-test'): Promise<string> {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'review-counts-test' }),
      );
      await runCli(['init', '--name', 'review-counts-test', '--agents', 'claude']);
      await runCli(['change', 'story', name, '--description', 'review counts change']);
      return path.join(tmpDir, '.prospec', 'changes', name);
    }

    it('review merge writes round-tagged quality_log counts, re-merge of same round is idempotent, and change log mismatch coerces to WARN without overwriting truth', async () => {
      const changeDir = await initReviewChange('rc-test');
      const findingsR1 = path.join(tmpDir, 'rc-round1.json');
      await fs.promises.writeFile(
        findingsR1,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm test' },
          { id: 'F-2', location: 'src/b.ts:2', severity: 'major', lens: 'security', summary: 'vuln' },
        ]),
      );

      // 1. review merge writes quality_log counts entry for round 1
      const merge = await runCli(['review', 'merge', '--findings', findingsR1, '--round', '1', '--lenses', 'correctness,security']);
      expect(merge.exitCode).toBe(0);

      const metadataFile = path.join(changeDir, 'metadata.yaml');
      let metadata = await fs.promises.readFile(metadataFile, 'utf-8');
      expect(metadata).toContain('skill: prospec-review');
      expect(metadata).toContain('round: 1');
      expect(metadata).toContain('criticals_found: 1');
      expect(metadata).toContain('criticals_fixed: 1');
      expect(metadata).toContain('majors: 1');
      expect(metadata).toContain('result: WARN');

      // 2. Re-running the same round is idempotent (does not duplicate entry)
      const remerge = await runCli(['review', 'merge', '--findings', findingsR1, '--lenses', 'correctness,security']);
      expect(remerge.exitCode).toBe(0);
      metadata = await fs.promises.readFile(metadataFile, 'utf-8');
      expect((metadata.match(/skill: prospec-review/g) ?? []).length).toBe(1);
      expect((metadata.match(/round: 1/g) ?? []).length).toBe(1);

      // 3. change log with mismatching counts flag pushes log_mismatch to warnings, coerces result >= WARN, and leaves CLI truth intact
      const logMismatch = await runCli([
        'change', 'log',
        '--skill', 'prospec-review',
        '--result', 'PASS',
        '--criticals-found', '99',
        '--change', 'rc-test',
      ]);
      expect(logMismatch.exitCode).toBe(0);

      metadata = await fs.promises.readFile(metadataFile, 'utf-8');
      // Exactly 2 prospec-review entries: round-tagged counts entry + round-less close entry
      expect((metadata.match(/skill: prospec-review/g) ?? []).length).toBe(2);
      expect(metadata).toContain('round: 1');
      expect(metadata).toContain('criticals_found: 1');
      expect(metadata).not.toContain('criticals_found: 99');
      expect(metadata).toContain('log_mismatch: criticals_found expected 1 got 99');

      // Close entry has no count fields or round field
      const parsed = parseYaml<{ quality_log: Array<Record<string, unknown>> }>(metadata);
      const reviewEntries = parsed.quality_log.filter((e) => e.skill === 'prospec-review');
      expect(reviewEntries).toHaveLength(2);
      const [countsEntry, closeEntry] = reviewEntries;
      expect(countsEntry).toMatchObject({
        skill: 'prospec-review',
        round: 1,
        criticals_found: 1,
        criticals_fixed: 1,
        majors: 1,
      });
      expect(closeEntry?.skill).toBe('prospec-review');
      expect(closeEntry?.result).toBe('WARN');
      expect(closeEntry?.round).toBeUndefined();
      expect(closeEntry?.criticals_found).toBeUndefined();
      expect(closeEntry?.criticals_fixed).toBeUndefined();
      expect(closeEntry?.majors).toBeUndefined();
    });

    it('clean review merge injects artifact-language clean sentence and prospec check passes language-policy-drift', async () => {
      // Set up project with traditional Chinese artifact language and valid constitution
      const packageJson = path.join(tmpDir, 'package.json');
      await fs.promises.writeFile(packageJson, JSON.stringify({ name: 'clean-e2e' }));
      await runCli(['init', '--name', 'clean-e2e', '--agents', 'claude', '--language', 'zh-TW', '--trust-zone-language', 'en']);
      await runCli(['agent', 'sync']);

      // Create a change
      await runCli(['change', 'story', 'clean-change', '--description', 'clean change test']);

      const emptyFindings = path.join(tmpDir, 'empty.json');
      await fs.promises.writeFile(emptyFindings, '[]');

      const merge = await runCli(['review', 'merge', '--findings', emptyFindings, '--change', 'clean-change']);
      if (merge.exitCode !== 0) {
        console.error('MERGE STDERR:\n' + merge.stderr + '\nMERGE STDOUT:\n' + merge.stdout);
      }
      expect(merge.exitCode).toBe(0);

      const reviewMd = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'clean-change', 'review.md'),
        'utf-8',
      );
      expect(reviewMd).toContain('<!-- prospec:review-clean -->');
      expect(reviewMd).toContain('本輪審查未發現任何問題。');
      expect(reviewMd).toContain('<!-- prospec:review-clean-end -->');

      // Check quality_log has PASS round counts entry with 0 counts
      const metadataPath = path.join(tmpDir, '.prospec', 'changes', 'clean-change', 'metadata.yaml');
      const metadata = await fs.promises.readFile(metadataPath, 'utf-8');
      expect(metadata).toContain('round: 1');
      expect(metadata).toContain('result: PASS');
      expect(metadata).toContain('criticals_found: 0');
      expect(metadata).toContain('criticals_fixed: 0');
      expect(metadata).toContain('majors: 0');

      // Initialize git repo so prospec check can inspect drift
      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
      git('init', '-q');
      git('config', 'user.name', 'Fixture');
      git('config', 'user.email', 'fixture@example.com');
      git('add', '.');
      git('commit', '-qm', 'initial commit');

      // prospec check passes language-policy-drift
      const check = await runCli(['check']);
      expect(check.stdout).toContain('PASS  language-policy-drift');
    });
  });
});
