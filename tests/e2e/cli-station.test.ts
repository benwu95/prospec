import { withVerifiedPremise } from '../helpers/premise.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { RELAYED_FIELD_MAX_CHARS } from '../../src/types/station.js';
import { parseYaml } from '../../src/lib/yaml-utils.js';
import { recordCliEvidence } from './helpers/evidence.js';
import { runCliInProcess } from './helpers/run-cli.js';
import { gitIn, imageOf } from '../helpers/git-fixture.js';
import { usePrivateTmpdir } from '../helpers/private-tmpdir.js';

// Every delegation snapshot this file builds lands under a root only this file uses (O-1 pin: none may remain).
usePrivateTmpdir('cli-station');

// In-process runs still shell out to git via the drift/status/check services;
// keep the generous file-level timeout the git-bound e2e files use (PB-010).
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });

let tmpDir: string;
const runCli = (args: string[], options: { cwd?: string } = {}) =>
  runCliInProcess(args, { cwd: options.cwd ?? tmpDir });

async function authorPremise(name: string): Promise<void> {
  const file = path.join(tmpDir, '.prospec/changes', name, 'proposal.md');
  await fs.promises.writeFile(file, withVerifiedPremise(await fs.promises.readFile(file, 'utf8')));
}

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
      await authorPremise(name);
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

    it('change story refuses --introduced-by as an unknown option and creates no change (REQ-TYPES-058 removed)', async () => {
      await fs.promises.writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'station-test' }),
      );
      await runCli(['init', '--name', 'station-test', '--agents', 'claude']);
      const { exitCode, stderr } = await runCli([
        'change', 'story', 'fix-it', '--description', 'x', '--introduced-by', 'offender',
      ]);
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain("unknown option '--introduced-by'");
      expect(fs.existsSync(path.join(tmpDir, '.prospec', 'changes', 'fix-it'))).toBe(false);
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
          withVerifiedPremise('# p\n\n## UI Scope\n\n**Scope:** full\n'),
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
      await authorPremise('codex-change');
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
      await authorPremise('my-change');
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

    it('review merge --json exposes the shared refusal and one-attempt grant through real commands', async () => {
      const changeDir = await initChange();
      const findings = path.join(tmpDir, 'round.json');
      await fs.promises.writeFile(findings, '[]');
      await fs.promises.appendFile(path.join(changeDir, 'metadata.yaml'), `
quality_log:
  - { skill: prospec-escalation, date: '2026-10-01', result: WARN, escalation: { kind: trigger, station: prospec-review, event_id: e1, trigger: oscillation } }
  - { skill: prospec-escalation, date: '2026-10-02', result: WARN, escalation: { kind: trigger, station: prospec-review, event_id: e2, trigger: oscillation } }
`);
      const refused = await runCli(['review', 'merge', '--findings', findings, '--json']);
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout).toBe('');
      expect(JSON.parse(refused.stderr).error.escalation.decision).toMatchObject({ ordinal: 2, recommended: 're-scope' });
      const grant = await runCli(['change', 'log', '--skill', 'prospec-review', '--result', 'WARN', '--warning', 'Manual override: inspect one corrected attempt']);
      expect(grant.exitCode).toBe(0);
      const accepted = await runCli(['review', 'merge', '--findings', findings, '--json']);
      expect(accepted.exitCode).toBe(0);
      expect(JSON.parse(accepted.stdout)).toMatchObject({ totalRows: 0, round: { roundNumber: 1 } });
      expect(accepted.stderr).toBe('');
      const replay = await runCli(['review', 'merge', '--findings', findings, '--json']);
      expect(replay.exitCode).toBe(0);
      expect(JSON.parse(replay.stdout).replay).toBe(true);
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

    it('review merge tracks round and lenses, prints no spend, and refuses --spend/--budget as unknown options (REQ-CLI-043, REQ-TESTS-099)', async () => {
      const changeDir = await initChange();
      const reviewMdPath = path.join(changeDir, 'review.md');
      const findingsR1 = path.join(tmpDir, 'round1.json');
      await fs.promises.writeFile(
        findingsR1,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
        ]),
      );
      const r1 = await runCli(['review', 'merge', '--findings', findingsR1]);
      expect(r1.exitCode).toBe(0);
      expect(r1.stdout).toContain('round=1');
      expect(r1.stdout).not.toMatch(/\bspend\b/);
      expect(r1.stdout).not.toContain('🚨 Circuit Breaker Tripped');

      // Round 2: one new critical against one carried-forward fixed → 1/2 fix-induced, at (not over) the 0.5 threshold
      const findingsR2 = path.join(tmpDir, 'round2.json');
      await fs.promises.writeFile(
        findingsR2,
        JSON.stringify([
          { id: 'F-1', location: 'src/a.ts:1', severity: 'critical', lens: 'correctness', status: 'fixed', summary: 'bug1', repro: 'pnpm a' },
          { id: 'F-2', location: 'src/b.ts:2', severity: 'critical', lens: 'correctness', summary: 'bug2', repro: 'pnpm b' },
        ]),
      );
      const r2 = await runCli(['review', 'merge', '--findings', findingsR2, '--round', '2', '--lenses', 'correctness,security']);
      expect(r2.exitCode).toBe(0);
      expect(r2.stdout).toContain('round=2');
      expect(r2.stdout).toContain('fix_induced_ratio=50.0%');
      expect(r2.stdout).not.toMatch(/\bspend\b/);
      expect(r2.stdout).not.toContain('🚨 Circuit Breaker Tripped');
      const reviewMd = await fs.promises.readFile(reviewMdPath, 'utf-8');
      expect(reviewMd).toContain('lenses="correctness,security"');
      expect(reviewMd).toContain('round="2"');
      expect(reviewMd).not.toMatch(/spend_before|round_spend|cumulative_spend/);

      // The retired spend flags are unknown options: refused at the parser, nothing written
      for (const flag of ['--spend', '--budget']) {
        const refused = await runCli(['review', 'merge', '--findings', findingsR2, '--round', '2', flag, '4000']);
        expect(refused.exitCode, flag).not.toBe(0);
        expect(refused.stderr).toContain(`unknown option '${flag}'`);
        expect(await fs.promises.readFile(reviewMdPath, 'utf-8')).toBe(reviewMd);
      }

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

    it('verify record carries run-level --executor onto each judgment dimension (flag form)', async () => {
      await initChange();
      await recordCliEvidence(tmpDir, 'my-change');
      const { exitCode, stdout, stderr } = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
        '--executor', 'strongest-tier',
      ]);
      expect(exitCode, stderr).toBe(0);
      // Legacy fixture has no delta-spec: disclose the gap and cap the grade.
      expect(stdout).toContain('Quality Grade: A');
      expect(stdout).toContain('empty requirement set');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'my-change', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('executor: strongest-tier');
      expect(metadata).not.toMatch(/\bspend:/);
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
      // The seeded Language Policy alone declares every station; the rest stay undeclared.
      expect(parsed.map((r) => [r.name, r.stations])).toEqual(
        parsed.map((r) => [r.name, r.name === 'Language Policy' ? 'all' : null]),
      );
      expect(parsed.filter((r) => r.stations === 'all')).toHaveLength(1);

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
      // Legacy fixture has no delta-spec: disclose the gap and cap the grade.
      expect(stdout).toContain('Quality Grade: A');
      expect(stdout).toContain('empty requirement set');
      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'init-compat', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('status: verified');
      expect(metadata).toContain('grade: A');
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

    it('verify record refuses an empty --executor at the parser and --spend as an unknown option (REQ-CLI-038)', async () => {
      await initChange();
      const empty = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--graded-by', 'fresh-subagent',
        '--executor', '',
      ]);
      expect(empty.exitCode).not.toBe(0);
      expect(empty.stderr).toContain('non-empty executor');
      // Evidence recorded and all three judgment verdicts supplied, so the only thing that
      // can refuse this invocation is the flag itself — an accepted --spend would exit 0.
      await recordCliEvidence(tmpDir, 'my-change');
      const metadataPath = path.join(tmpDir, '.prospec', 'changes', 'my-change', 'metadata.yaml');
      const before = await fs.promises.readFile(metadataPath, 'utf-8');
      const spend = await runCli([
        'verify', 'record',
        '--dimension', 'delta-spec-compliance=PASS',
        '--dimension', 'constitution=PASS',
        '--dimension', 'design=not-applicable',
        '--graded-by', 'fresh-subagent',
        '--spend', '12345',
      ]);
      expect(spend.exitCode).not.toBe(0);
      expect(spend.stderr).toContain("unknown option '--spend'");
      expect(await fs.promises.readFile(metadataPath, 'utf-8')).toBe(before);
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
      await authorPremise('mutation');
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
      await authorPremise('plan-me');
    const proposalPath = path.join(tmpDir, '.prospec/changes/plan-me/proposal.md');
    await fs.promises.writeFile(
      proposalPath,
      withVerifiedPremise('# Proposal: plan-me\n\n## User Story\n\n### US-1: Title [P1]\n\n**Acceptance Scenarios:**\n- WHEN action THEN result\n'),
    );
    await runCli(['change', 'story', 'plan-me', '--freeze-scenarios']);
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

  it('refuses --signoff alongside another verdict source or the composed-entry fields (usage error, REQ-CLI-056)', async () => {
    await initChange();
    for (const extra of [['--result', 'PASS'], ['--verifier-report', writeReport('r.json', planReport('PASS'))], ['--grade', 'S'], ['--dimension', 'tests=PASS'], ['--criticals-found', '1'], ['--criticals-fixed', '1'], ['--majors', '1']]) {
      const both = await runCli(['change', 'log', '--skill', 'prospec-plan', '--signoff', 'option-a', ...extra]);
      expect(both.exitCode, extra.join(' ')).not.toBe(0);
      expect(both.stderr, extra.join(' ')).toMatch(/cannot be used with|conflicts/i);
    }
    const bogus = await runCli(['change', 'log', '--skill', 'prospec-plan', '--signoff', 'option-z']);
    expect(bogus.exitCode).not.toBe(0);
  });
});

describe('opt-in plan sign-off pause through the CLI (REQ-TESTS-124)', () => {
  const planReport = {
    verdict: 'PASS',
    dimensions: Object.fromEntries(
      ['project_layering', 'blast_radius', 'state_safety', 'delta_spec', 'reuse'].map((d) => [d, { result: 'PASS', rationale: `${d} assessed` }]),
    ),
    evidence: 'audit',
  };
  const candidate = (id: string, chain: string[]) => ({
    id, title: id, overview: 'o', trade_offs: { pros: [], cons: [], blast_radius: 'b' }, call_chain: chain,
  });
  const decision = {
    recommended_option: 'option-a',
    evaluation_matrix: [
      { dimension: 'blast_radius_complexity', winner: 'option-a', score_rationale: 'x' },
      { dimension: 'constitution_layering', winner: 'tie', score_rationale: 'x' },
      { dimension: 'extensibility_simplicity', winner: 'option-a', score_rationale: 'x' },
    ],
    rationale: 'in-session comparison',
    graded_by: 'in-session',
  };
  async function initFullPlan(): Promise<string> {
    await runCli(['init', '--name', 'e2e', '--agents', 'claude']);
    await runCli(['change', 'story', 'pick-arch', '--description', 'fixture']);
      await authorPremise('pick-arch');
    const dir = path.join(tmpDir, '.prospec/changes/pick-arch');
    await fs.promises.writeFile(
      path.join(dir, 'proposal.md'),
      withVerifiedPremise('# Proposal: pick-arch\n\n## User Story\n\n### US-1: Title [P1]\n\n**Acceptance Scenarios:**\n- WHEN action THEN result\n'),
    );
    await runCli(['change', 'story', 'pick-arch', '--freeze-scenarios']);
    await runCli(['change', 'scale', 'full']);
    await runCli(['change', 'plan']);
    // Phase 4 writes the candidates and decision before Phase 6 records the verifier,
    // which stamps the recommendation it audited.
    fs.mkdirSync(path.join(dir, 'candidates'));
    fs.writeFileSync(path.join(dir, 'candidates/option-a.json'), JSON.stringify(candidate('option-a', ['src/lib/a.ts → src/types/a.ts'])));
    fs.writeFileSync(path.join(dir, 'candidates/option-b.json'), JSON.stringify(candidate('option-b', ['src/types/a.ts → src/lib/a.ts'])));
    fs.writeFileSync(path.join(dir, 'candidates/decision.json'), JSON.stringify(decision));
    const report = path.join(tmpDir, 'plan-verifier.json');
    fs.writeFileSync(report, JSON.stringify(planReport));
    expect((await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', report])).exitCode).toBe(0);
    return dir;
  }
  const routeOf = async () =>
    (JSON.parse((await runCli(['status', '--json'])).stdout) as { changes: Array<{ next: string | null; code: string }> }).changes[0]!;

  it('an invalid PROSPEC_PAUSE_AT exits 1 naming the valid station, with no report', async () => {
    await runCli(['init', '--name', 'e2e', '--agents', 'claude']);
    vi.stubEnv('PROSPEC_PAUSE_AT', 'bogus');
    const result = await runCli(['status', '--json']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid pause setting in PROSPEC_PAUSE_AT: bogus');
    expect(result.stderr).toMatch(/Valid station names: plan/);
    expect(result.stdout.trim()).toBe('');
  });

  it('pause → AWAITING HALT → human sign-off → tasks; an empty override never pauses', async () => {
    const dir = await initFullPlan();
    expect((await routeOf()).next).toBe('tasks');

    vi.stubEnv('PROSPEC_PAUSE_AT', 'plan');
    const paused = await routeOf();
    expect(paused.next).toBeNull();
    expect(paused.code).toBe('AWAITING_HUMAN_PLAN_SIGNOFF');
    expect((await runCli(['status'])).stdout).toContain('HALT (awaiting human plan sign-off)');

    vi.stubEnv('PROSPEC_PAUSE_AT', '');
    expect((await routeOf()).next).toBe('tasks');

    vi.stubEnv('PROSPEC_PAUSE_AT', 'plan');
    const refused = await runCli(['change', 'log', '--skill', 'prospec-plan', '--signoff', 'option-b']);
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('recommended_option');
    const signed = await runCli(['change', 'log', '--skill', 'prospec-plan', '--signoff', 'option-a']);
    expect(signed.exitCode).toBe(0);
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'candidates/decision.json'), 'utf-8')).graded_by).toBe('human');
    expect((await routeOf()).next).toBe('tasks');
  });

  it('validate candidates prints the metrics table and exits 0 on valid payloads', async () => {
    await initFullPlan();
    const result = await runCli(['validate', 'candidates', '--change', 'pick-arch']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('| option | direction_violations | touched_modules | estimated_lines | unknown_references |');
    expect(result.stdout).toMatch(/\| option-b \| 1 \|/);
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
      await authorPremise(name);
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
    expect((meta.match(/skill: prospec-review/g) ?? []).length).toBe(2); // counts + accepted receipt
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
      await authorPremise(name);
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
      expect((metadata.match(/skill: prospec-review/g) ?? []).length).toBe(2); // counts + accepted receipt
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
      // Three entries: round-tagged counts, accepted receipt, and round-less close
      expect((metadata.match(/skill: prospec-review/g) ?? []).length).toBe(3);
      expect(metadata).toContain('round: 1');
      expect(metadata).toContain('criticals_found: 1');
      expect(metadata).not.toContain('criticals_found: 99');
      expect(metadata).toContain('log_mismatch: criticals_found expected 1 got 99');

      // Close entry has no count fields or round field
      const parsed = parseYaml<{ quality_log: Array<Record<string, unknown>> }>(metadata);
      const reviewEntries = parsed.quality_log.filter((e) => e.skill === 'prospec-review');
      expect(reviewEntries).toHaveLength(3);
      const [countsEntry, acceptedEntry, closeEntry] = reviewEntries;
      expect(acceptedEntry?.accepted).toBeDefined();
      expect(acceptedEntry?.round).toBeUndefined();
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
      await authorPremise('clean-change');

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

  describe('acceptance freeze and deterministic verify context flow (issue #277, T25)', () => {
    it('executes full workflow: authored story -> freeze -> context -> grader payload with deviation finding -> record', async () => {
      const packageJson = path.join(tmpDir, 'package.json');
      await fs.promises.writeFile(packageJson, JSON.stringify({ name: 'freeze-e2e' }));
      await runCli(['init', '--name', 'freeze-e2e', '--agents', 'claude']);

      const git = (...args: string[]) => execFileSync('git', args, { cwd: tmpDir, stdio: 'pipe' });
      git('init', '-q');
      git('config', 'user.name', 'Fixture');
      git('config', 'user.email', 'fixture@example.com');

      await fs.promises.writeFile(
        path.join(tmpDir, '.prospec.yaml'),
        'version: "1.0"\nproject:\n  name: freeze-e2e\ntech_stack:\n  test_command: node suite.cjs\n',
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'suite.cjs'),
        'process.exitCode = 0;\n',
      );
      await fs.promises.mkdir(path.join(tmpDir, 'prospec/ai-knowledge'), { recursive: true });
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec/CONSTITUTION.md'),
        '# Constitution\n\n## Principles\n\n### [MUST] Tests\n\n**Description**: Tests must pass.\n\n**Verify**: Run tests.\n',
      );
      await fs.promises.writeFile(
        path.join(tmpDir, 'prospec/ai-knowledge/module-map.yaml'),
        'modules:\n  - name: auth\n    description: Auth module\n    paths: [src]\n    keywords: [auth]\n',
      );
      git('add', '.');
      git('commit', '-qm', 'initial');

      // 1. Authored story
      await runCli(['change', 'story', 'feat-auth', '--description', 'User authentication flow']);
      await authorPremise('feat-auth');
      const proposalPath = path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'proposal.md');
      const proposalContent = [
        '# Proposal: feat-auth',
        '',
        '## User Story',
        '',
        '### US-1: User Login [P1]',
        '',
        '**Acceptance Scenarios:**',
        '- WHEN user submits valid credentials THEN token is returned',
        '- WHEN user submits invalid credentials THEN error 401 is returned',
        '',
      ].join('\n');
      await fs.promises.writeFile(proposalPath, withVerifiedPremise(proposalContent));

      // 2. Freeze scenarios
      const freezeResult = await runCli(['change', 'story', 'feat-auth', '--freeze-scenarios']);
      expect(freezeResult.exitCode).toBe(0);
      expect(freezeResult.stdout).toContain('Frozen acceptance scenarios (revision 1)');
      expect(freezeResult.stdout).toContain('Scenarios count: 2');

      // 3. Plan & Delta Spec
      await runCli(['change', 'plan']);
      const deltaPath = path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'delta-spec.md');
      const deltaContent = [
        '# Delta Spec',
        '',
        '## ADDED',
        '',
        '### REQ-AUTH-001: Valid user token',
        '**Feature:** auth',
        '**Story:** US-1',
        '**Description:** Return token on valid credentials.',
        '**Spec:**',
        'Return token on valid credentials.',
        '',
        '### REQ-AUTH-002: Invalid user error',
        '**Feature:** auth',
        '**Story:** US-1',
        '**Description:** Return error 401 on invalid credentials.',
        '**Spec:**',
        'Return error 401 on invalid credentials.',
        '',
      ].join('\n');
      await fs.promises.writeFile(deltaPath, deltaContent);

      // 4. Code tasks & advance to implemented
      const tasksPath = path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'tasks.md');
      await fs.promises.writeFile(
        tasksPath,
        '- [x] T1 Implement login token\n- [x] T2 Implement 401 error\n',
      );
      await runCli(['change', 'status', 'implemented']);

      // 5. Fresh review and test prerequisites
      git('add', '.');
      git('commit', '-qm', 'implemented code');
      await runCli(['check', '--change', 'feat-auth', '--record-review']);
      await runCli(['check', '--change', 'feat-auth', '--record-tests']);

      // 6. Verification context projection
      const contextResult = await runCli(['verify', 'context', '--change', 'feat-auth']);
      expect(contextResult.exitCode).toBe(0);
      expect(contextResult.stdout).toContain('Verification context prepared for feat-auth');

      const contextPath = path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'verify-context.json');
      expect(fs.existsSync(contextPath)).toBe(true);
      const savedContext = JSON.parse(await fs.promises.readFile(contextPath, 'utf-8')) as {
        context_id: string;
        spec: { req_ids: string[] };
      };
      expect(savedContext.context_id).toBeDefined();
      expect(savedContext.spec.req_ids).toEqual(['REQ-AUTH-001', 'REQ-AUTH-002']);

      // 7. Grader returns items and deviation finding
      const judgmentPath = path.join(tmpDir, '.prospec', 'judgment.json');
      const judgmentPayload = [
        {
          name: 'delta-spec-compliance',
          result: 'WARN',
          graded_by: 'fresh-subagent',
          context_id: savedContext.context_id,
          items: [
            {
              req_id: 'REQ-AUTH-001',
              result: 'PASS',
              evidence_kind: 'document',
              evidence: 'verified token generation in src/auth.ts:25',
            },
            {
              req_id: 'REQ-AUTH-002',
              result: 'PASS',
              evidence_kind: 'document',
              evidence: 'verified error 401 in src/auth.ts:40',
            },
          ],
          scenario_findings: [
            {
              scenario_id: 'US-1.1',
              affected_req_ids: ['REQ-AUTH-001'],
              spec_location: 'prospec/specs/features/auth.md:25',
              result: 'WARN',
              summary: 'Token payload format differs from scenario expectation',
              evidence: 'Observed token claims structure differs slightly',
            },
          ],
        },
        {
          name: 'constitution',
          result: 'PASS',
          graded_by: 'fresh-subagent',
        },
        {
          name: 'design',
          result: 'not-applicable',
          graded_by: 'fresh-subagent',
        },
      ];
      await fs.promises.writeFile(judgmentPath, JSON.stringify(judgmentPayload));

      // 8. Record verification
      const recordResult = await runCli([
        'verify',
        'record',
        '--change',
        'feat-auth',
        '--dimensions',
        judgmentPath,
      ]);
      if (recordResult.exitCode !== 0) console.error('RECORD ERROR:', recordResult.stderr);
      expect(recordResult.exitCode).toBe(0);
      expect(recordResult.stdout).toContain('Quality Grade: A');
      expect(recordResult.stdout).toContain('Requirements coverage: 2/2');

      // 9. Assert scenario/spec dual positioning and report content
      const verifyMd = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'verify.md'),
        'utf-8',
      );
      expect(verifyMd).toContain('Scenario Deviation Findings');
      expect(verifyMd).toContain('US-1.1');
      expect(verifyMd).toContain('prospec/specs/features/auth.md:25');
      expect(verifyMd).toContain('REQ-AUTH-001');
      expect(verifyMd).toContain('Requirements Compliance');
      expect(verifyMd).toContain('REQ-AUTH-001');
      expect(verifyMd).toContain('REQ-AUTH-002');

      const metadata = await fs.promises.readFile(
        path.join(tmpDir, '.prospec', 'changes', 'feat-auth', 'metadata.yaml'),
        'utf-8',
      );
      expect(metadata).toContain('grade: A');
      expect(metadata).toMatch(/coverage_summary:\s*"?2\/2"?/);
    });
  });
});

describe('CLI E2E — delegation tickets (REQ-TESTS-125, REQ-CLI-057)', () => {
  const FINDINGS = JSON.stringify([{ id: 'F-1', location: 'src/a.ts:1', severity: 'minor', lens: 'correctness', summary: 'nit' }]);
  const DELEGATED = '.prospec/changes/my-change/.delegated';
  const PAYLOAD = `${DELEGATED}/review-reviewer-1-1.json`;
  const CHECKPOINT = `${DELEGATED}/review-reviewer-1-1.checkpoint`;
  const SEEDED = '# Review Findings: my-change\n\n| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |\n|----|----|----|----|----|----|----|----|\n';
  const git = (...args: string[]) => gitIn(tmpDir, ...args);
  const read = (file: string) => fs.readFileSync(path.join(tmpDir, file), 'utf8');
  const write = (file: string, text: string) => {
    fs.mkdirSync(path.dirname(path.join(tmpDir, file)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, file), text);
  };
  const ticketOf = (stem: string) => JSON.parse(read(`${DELEGATED}/${stem}.ticket.json`)) as {
    checkpoint: { entries: Array<{ path: string; kind: string; sha256?: string }> };
  };

  async function setup(): Promise<string> {
    write('package.json', JSON.stringify({ name: 'delegation-test' }));
    await runCli(['init', '--name', 'delegation-test', '--agents', 'claude']);
    await runCli(['change', 'story', 'my-change', '--description', 'delegation test change']);
      await authorPremise('my-change');
    write('.gitignore', '.prospec/\n');
    git('init', '-q', '-b', 'main');
    write('src/a.ts', 'committed a\n');
    write('src/b.ts', 'committed b\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('commit', '-q', '--allow-empty', '-m', 'second');
    git('branch', 'other');
    // Uncommitted work the delegate must not lose.
    write('src/a.ts', 'uncommitted work\n');
    write('src/new.ts', 'untracked work\n');
    const changeDir = path.join(tmpDir, '.prospec', 'changes', 'my-change');
    fs.writeFileSync(path.join(changeDir, 'review.md'), SEEDED);
    return changeDir;
  }

  const issue = (role = 'reviewer') => runCli(['change', 'delegate', '--station', 'review', '--role', role, '--round', '1']);
  const receive = (stem = 'review-reviewer-1-1') => runCli(['change', 'delegate', '--receive', stem]);

  it('refuses --reason and --accept-current-tree on a receive or an issue — the three modes are exclusive (C-4 pin)', async () => {
    await setup();
    const withAccept = await runCli(['change', 'delegate', '--receive', 'review-reviewer-1-1', '--accept-current-tree']);
    expect(withAccept.exitCode).not.toBe(0);
    expect(withAccept.stderr).toMatch(/--accept-current-tree.*cannot be used with.*--receive|--receive.*cannot be used with.*--accept-current-tree/);
    const withReason = await runCli(['change', 'delegate', '--station', 'review', '--role', 'x', '--round', '1', '--reason', 'why']);
    expect(withReason.exitCode).not.toBe(0);
    expect(withReason.stderr).toMatch(/cannot be used with/);
    // The two acting modes exclude each other too (T-15 pin): neither branch runs.
    const both = await runCli(['change', 'delegate', '--receive', 'review-a-1-1', '--spawn-failed', 'review-b-1-1']);
    expect(both.exitCode).not.toBe(0);
    expect(both.stderr).toMatch(/cannot be used with/);
    expect(both.stderr).not.toMatch(/No delegation ticket/);
    expect(fs.existsSync(path.join(tmpDir, DELEGATED))).toBe(false);
  });

  /** Every entry under `.git` with its mode and bytes (M-5: the mode rides along, so a chmod shows too). */
  const gitImage = () => imageOf(path.join(tmpDir, '.git'));
  function setGitWritable(writable: boolean): void {
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (writable) fs.chmodSync(full, 0o755);
          walk(full);
          if (!writable) fs.chmodSync(full, 0o555);
        } else fs.chmodSync(full, writable ? 0o644 : 0o444);
      }
    };
    const root = path.join(tmpDir, '.git');
    if (writable) fs.chmodSync(root, 0o755);
    walk(root);
    if (!writable) fs.chmodSync(root, 0o555);
  }

  afterEach(() => {
    if (fs.existsSync(path.join(tmpDir, '.git'))) setGitWritable(true);
  });

  it.each([
    ['an edited file', () => write('src/b.ts', 'delegate edit\n'), 'content'],
    ['a deleted file', () => fs.rmSync(path.join(tmpDir, 'src/b.ts')), 'content'],
    ['an added file', () => write('src/extra.ts', 'delegate file\n'), 'content'],
    ['reset --soft', () => git('reset', '-q', '--soft', 'HEAD~1'), 'head'],
    ['reset --hard', () => git('reset', '-q', '--hard'), 'content'],
    ['a branch switch', () => git('switch', '-q', 'other'), 'head'],
    ['a dropped stash entry', () => git('stash', 'drop', '-q'), 'stash'],
  ])('refuses %s at receipt, naming the facet and the checkpoint, then refuses the merge and every new attempt', async (_label, damage, facet) => {
    const changeDir = await setup();
    if (facet === 'stash') {
      write('src/b.ts', 'stashed\n');
      git('stash', '-q');
    }
    expect((await issue()).exitCode).toBe(0);
    write(PAYLOAD, FINDINGS);
    damage();
    const receipt = await receive();
    expect(receipt.exitCode).toBe(1);
    expect(receipt.stdout).toMatch(/refused review-reviewer-1-1 \(mutated\)/);
    expect(receipt.stdout).toMatch(new RegExp(`\\n  ${facet}: pre-spawn \\S.* → now \\S`));
    expect(receipt.stdout).toContain(`checkpoint: ${fs.realpathSync(tmpDir)}/${CHECKPOINT}`);
    expect(receipt.stdout).toMatch(/recovery is the orchestrator's with the human's consent/);
    const merge = await runCli(['review', 'merge', '--findings', path.join(tmpDir, PAYLOAD)]);
    expect(merge.exitCode).not.toBe(0);
    expect(merge.stderr).toMatch(/Unsettled review delegation — nothing was written/);
    expect(fs.readFileSync(path.join(changeDir, 'review.md'), 'utf8')).toBe(SEEDED);
    for (const role of ['reviewer', 'lens-security']) {
      const again = await issue(role);
      expect(again.exitCode, role).not.toBe(0);
      expect(again.stderr, role).toMatch(/review-reviewer-1-1 is refused/);
    }
  });

  it('admits a new attempt once the human recovered the tree by hand from git and the checkpoint files', async () => {
    await setup();
    expect((await issue()).exitCode).toBe(0);
    const head = git('rev-parse', 'HEAD');
    // The delegate commits the uncommitted work and deletes the untracked file.
    git('commit', '-qam', 'delegate commit');
    fs.rmSync(path.join(tmpDir, 'src/new.ts'));
    expect((await receive()).exitCode).toBe(1);
    // The human's recovery: git for HEAD, the branch and the index; the checkpoint for the bytes.
    git('reset', '-q', '--soft', head);
    git('reset', '-q');
    const entry = ticketOf('review-reviewer-1-1').checkpoint.entries.find((e) => e.path === 'src/new.ts')!;
    fs.copyFileSync(path.join(tmpDir, CHECKPOINT, 'blobs', entry.sha256!), path.join(tmpDir, 'src/new.ts'));
    expect(read('src/new.ts')).toBe('untracked work\n');
    const next = await issue();
    expect(next.exitCode).toBe(0);
    expect(next.stdout).toContain('review-reviewer-1-2');
  });

  it('keeps the checkpoint when the human accepts the current tree, and the sink discloses it', async () => {
    await setup();
    expect((await issue()).exitCode).toBe(0);
    git('reset', '-q', '--hard');
    expect((await receive()).exitCode).toBe(1);
    const accepted = await runCli(['change', 'delegate', '--spawn-failed', 'review-reviewer-1-1', '--reason', 'the human accepted the loss', '--accept-current-tree']);
    expect(accepted.exitCode).toBe(0);
    expect(accepted.stdout).toContain('kept the checkpoint');
    expect(accepted.stdout).toContain(CHECKPOINT);
    expect(fs.existsSync(path.join(tmpDir, CHECKPOINT, 'blobs'))).toBe(true);
    const findings = path.join(tmpDir, 'round.json');
    fs.writeFileSync(findings, FINDINGS);
    const merge = await runCli(['review', 'merge', '--findings', findings]);
    expect(merge.exitCode).toBe(0);
    expect(merge.stdout).toContain('1 attempt(s) ended by a human accepting the current repository state');
    expect(merge.stdout).toContain('1 attempt(s) refused as mutated');
    expect(fs.existsSync(path.join(tmpDir, CHECKPOINT, 'blobs'))).toBe(true);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'issues, receives and ends a delegation under a read-only .git, leaving .git and every facet byte-identical',
    async () => {
      await setup();
      const { captureRepoState } = await import('../../src/lib/repo-state.js');
      setGitWritable(false);
      const expectUnchanged = async (label: string, run: () => Promise<{ exitCode: number; stdout: string; stderr: string }>) => {
        const image = gitImage();
        const facets = captureRepoState(tmpDir);
        const result = await run();
        expect(result.exitCode, `${label}: ${result.stderr}`).toBe(0);
        expect(gitImage(), label).toEqual(image);
        expect(captureRepoState(tmpDir), label).toEqual(facets);
        return result;
      };
      await expectUnchanged('issue', () => issue());
      write(PAYLOAD, FINDINGS);
      const received = await expectUnchanged('receive', () => receive());
      expect(received.stdout).toContain('Received review-reviewer-1-1');
      await expectUnchanged('second issue', () => issue('lens-security'));
      await expectUnchanged('spawn-failed', () => runCli(['change', 'delegate', '--spawn-failed', 'review-lens-security-1-1', '--reason', 'spawn refused: rate limit']));
    },
  );

  it('an untouched tree is received, merges after the loop\'s own fix, and the merge reports the covered round', async () => {
    const changeDir = await setup();
    expect((await issue()).exitCode).toBe(0);
    write(PAYLOAD, FINDINGS);
    expect((await receive()).exitCode).toBe(0);
    write('src/a.ts', 'fixed by the orchestrator\n');
    const merge = await runCli(['review', 'merge', '--findings', path.join(tmpDir, PAYLOAD)]);
    expect(merge.exitCode).toBe(0);
    expect(merge.stdout).toContain('Delegation: 1 received (every repository facet matched at receipt) — review-reviewer-1-1');
    expect(fs.readFileSync(path.join(changeDir, 'review.md'), 'utf8')).not.toBe(SEEDED);
  });

  it('a merge with no ticket discloses that the round was not covered, naming both causes', async () => {
    await setup();
    const findings = path.join(tmpDir, 'round.json');
    fs.writeFileSync(findings, FINDINGS);
    const merge = await runCli(['review', 'merge', '--findings', findings]);
    expect(merge.exitCode).toBe(0);
    expect(merge.stdout).toContain('Delegation: not covered by delegate mutation detection — no unsettled delegation ticket (none was issued, or an earlier run of this command already settled them)');
  });
});

describe('CLI E2E — constitution show and learn playbook (REQ-CLI-058, REQ-CLI-059, REQ-TESTS-127)', () => {
  const constitutionFile = () => path.join(tmpDir, 'prospec', 'CONSTITUTION.md');
  const playbookFile = () => path.join(tmpDir, 'prospec', 'ai-knowledge', '_playbook.md');

  async function initProject(): Promise<void> {
    await fs.promises.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'slice-test' }));
    await runCli(['init', '--name', 'slice-test', '--agents', 'claude']);
  }

  const MULTI_STATION = `# Project Constitution: slice-test

> Preamble.

## Principles

### [MUST] Language Policy

**Verify**: stations: all; Documents are in English.

---
### [MUST] Story Rule

**Verify**: stations: story; Stories follow INVEST.

---
### [MUST] Plan And Review Rule

**Verify**: stations: plan, review; check: import-direction; covers: layering.

---
### [MUST] Tasks Rule

**Verify**: stations: tasks; check: test-provenance; covers: suite.

---
### [MUST] Verify Rule

**Verify**: stations: verify; Commits are atomic.

---
### [SHOULD] Undeclared Rule

**Verify**: Reviewed by hand.

---

## Quality Standards

- **Testing**: all public functions have tests
`;

  it('slices each of the four stations smaller than the file, keeping every line verbatim and the undeclared rule', async () => {
    await initProject();
    await fs.promises.writeFile(constitutionFile(), MULTI_STATION);
    const own: Record<string, string> = {
      story: 'Story Rule',
      plan: 'Plan And Review Rule',
      tasks: 'Tasks Rule',
      review: 'Plan And Review Rule',
    };
    for (const [station, rule] of Object.entries(own)) {
      const { stdout, stderr, exitCode } = await runCli(['constitution', 'show', '--station', station]);
      expect(exitCode, stderr).toBe(0);
      expect(stdout.length).toBeLessThan(MULTI_STATION.length);
      for (const line of stdout.split('\n')) expect(MULTI_STATION.split('\n')).toContain(line);
      expect(stdout).toContain(`### [MUST] ${rule}`);
      expect(stdout).toContain('### [MUST] Language Policy');
      expect(stdout).toContain('### [SHOULD] Undeclared Rule');
      expect(stdout).toContain('## Quality Standards');
      expect(stdout).not.toContain('### [MUST] Verify Rule');
      expect(stderr).toContain('included 1 undeclared rule(s)');
    }
  });

  it.each([
    ['no-principles', '# C\n\n## Quality Standards\n\n- x\n'],
    ['no-declarations', '# C\n\n## Principles\n\n### [MUST] A\n\n**Verify**: prose.\n\n## Quality Standards\n'],
    ['no-match', '# C\n\n## Principles\n\n### [MUST] A\n\n**Verify**: stations: verify; prose.\n\n## Quality Standards\n'],
  ])('fails open on %s: stdout is byte-identical to the file, one stderr WARN, exit 0', async (reason, doc) => {
    await initProject();
    await fs.promises.writeFile(constitutionFile(), doc);
    const { stdout, stderr, exitCode } = await runCli(['constitution', 'show', '--station', 'plan']);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(doc);
    const lines = stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('WARN');
    expect(lines[0]).toContain(reason);
    expect(lines[1]).toMatch(/^tokens: full \d+$/);
  });

  // The one documented exception to "byte-identical": the shared formatter
  // sanitizer strips CR (and other control bytes), so a CRLF file round-trips
  // as LF — disclosed here rather than left to the LF fixtures above.
  it('fails open on a CRLF file as the file with every CR removed, exit 0', async () => {
    await initProject();
    const doc = '# C\r\n\r\n## Principles\r\n\r\n### [MUST] A\r\n\r\n**Verify**: prose.\r\n';
    await fs.promises.writeFile(constitutionFile(), doc);
    const { stdout, stderr, exitCode } = await runCli(['constitution', 'show', '--station', 'plan']);
    expect(exitCode).toBe(0);
    expect(doc).toContain('\r');
    expect(stdout).toBe(doc.replace(/\r/g, ''));
    expect(stderr).toContain('no-declarations');
  });

  it('reports the slice and full token counts on stderr, so the documented numbers are reproducible with the command', async () => {
    await initProject();
    await fs.promises.writeFile(constitutionFile(), MULTI_STATION);
    const { stdout, stderr, exitCode } = await runCli(['constitution', 'show', '--station', 'tasks']);
    expect(exitCode).toBe(0);
    const tokens = /^tokens: slice (\d+) \/ full (\d+) \(estimateTokens\)$/m.exec(stderr);
    expect(tokens, stderr).not.toBeNull();
    expect(Number(tokens![1])).toBe(Math.ceil(stdout.length / 4));
    expect(Number(tokens![2])).toBe(Math.ceil(MULTI_STATION.length / 4));
    expect(Number(tokens![1])).toBeLessThan(Number(tokens![2]));
  });

  it('keeps the seeded Constitution whole at every station — only its Language Policy declares stations', async () => {
    await initProject();
    const seeded = await fs.promises.readFile(constitutionFile(), 'utf-8');
    const { stdout, stderr, exitCode } = await runCli(['constitution', 'show', '--station', 'new-story']);
    expect(exitCode).toBe(0);
    expect(stdout).toBe(seeded);
    expect(stderr).toMatch(/included [1-9]\d* undeclared rule\(s\)/);
  });

  it('prints one rule by name and exits 1 on a missing rule, unknown station or missing selector', async () => {
    await initProject();
    await fs.promises.writeFile(constitutionFile(), MULTI_STATION);
    const hit = await runCli(['constitution', 'show', '--rule', 'Tasks Rule']);
    expect(hit.exitCode).toBe(0);
    expect(hit.stdout.startsWith('### [MUST] Tasks Rule')).toBe(true);
    expect(hit.stdout).not.toContain('Story Rule');

    const miss = await runCli(['constitution', 'show', '--rule', 'Nope']);
    expect(miss.exitCode).toBe(1);
    expect(miss.stdout).toBe('');
    expect(miss.stderr).toContain('Language Policy, Story Rule');

    const unknown = await runCli(['constitution', 'show', '--station', 'learn']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain('story, plan');

    const neither = await runCli(['constitution', 'show']);
    expect(neither.exitCode).toBe(1);
    expect(neither.stderr).toContain('--station');
  });

  const PLAYBOOK = `# Team Playbook

\`\`\`markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M ({module}, …) · **Approved-by**: {name}
\`\`\`

## Entries

### PB-001: Lib rule
- **Source**: a · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13
- **TTL**: review by 2027-01-01
- **Guidance**: lib guidance.

### PB-002: Templates rule
- **Source**: b · **Criteria**: freq=3, modules=1 (templates) · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-13
- **TTL**: review by 2027-01-01
- **Guidance**: templates guidance.

## Retired Entries

### PB-003: Retired rule
- **Source**: c · **Criteria**: freq=3, modules=1 (lib) · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-13
- **RETIRED 2026-08-04**: gone.
`;

  it('learn playbook lists every active entry once, prints matched bodies, reads one by id, and refuses an unknown id', async () => {
    await initProject();
    await fs.promises.writeFile(playbookFile(), PLAYBOOK);

    const cat = await runCli(['learn', 'playbook', '--modules', 'lib', '--modules', 'services']);
    expect(cat.exitCode, cat.stderr).toBe(0);
    const catalogLines = cat.stdout.split('\n').filter((l) => /^PB-\d+ · /.test(l));
    expect(catalogLines.map((l) => l.split(' · ')[0])).toEqual(['PB-001', 'PB-002']);
    expect(catalogLines[0]).toContain('relevance: module-match');
    expect(cat.stdout).toContain('- **Guidance**: lib guidance.');
    expect(cat.stdout).not.toContain('templates guidance');
    expect(cat.stdout).not.toContain('PB-003');

    const one = await runCli(['learn', 'playbook', '--id', 'PB-002']);
    expect(one.exitCode).toBe(0);
    expect(one.stdout.startsWith('### PB-002: Templates rule')).toBe(true);
    expect(one.stdout).not.toContain('PB-001');

    const unknown = await runCli(['learn', 'playbook', '--id', 'PB-003']);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain('PB-003');
  });

  it('learn playbook reports an absent playbook in one line and exits 0', async () => {
    await initProject();
    const { stdout, exitCode } = await runCli(['learn', 'playbook', '--modules', 'lib']);
    expect(exitCode).toBe(0);
    expect(stdout.trimEnd().split('\n')).toHaveLength(1);
    expect(stdout).toContain('_playbook.md');
  });

  it('keeps legacy stdout byte-identical for station plus modules when every entry is undeclared', async () => {
    await initProject();
    await fs.promises.writeFile(playbookFile(), PLAYBOOK);
    const legacy = await runCli(['learn', 'playbook', '--modules', 'lib']);
    const fallback = await runCli(['learn', 'playbook', '--station', 'implement', '--modules', 'lib']);
    // Frozen legacy bytes, independent of both selector/formatter executions.
    const expected = 'Playbook catalog (prospec/ai-knowledge/_playbook.md): 2 active, 1 module-matched with full text; read any other with `prospec learn playbook --id <id>`\n'
      + '\nPB-001 · Lib rule · kind: convention · modules: lib, cli · TTL: 2027-01-01 · relevance: module-match\n'
      + '### PB-001: Lib rule\n'
      + '- **Source**: a · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13\n'
      + '- **TTL**: review by 2027-01-01\n'
      + '- **Guidance**: lib guidance.\n'
      + '\nPB-002 · Templates rule · kind: playbook · modules: templates · TTL: 2027-01-01\n';
    expect(legacy.exitCode).toBe(0);
    expect(fallback.exitCode).toBe(0);
    expect(legacy.stdout).toBe(expected);
    expect(fallback.stdout).toBe(expected);
    expect(fallback.stdout).toBe(legacy.stdout);
    expect(fallback.stderr.split('\n').filter((line) => line.includes('fallback'))).toHaveLength(1);
    expect(fallback.stdout).not.toContain('WARN');
  });

  it('selects station bodies independently of module order and refuses invalid selector combinations', async () => {
    await initProject();
    const declared = PLAYBOOK.replace('- **Guidance**: lib guidance.', '- **Stations**: plan\n- **Guidance**: lib guidance.')
      .replace('- **Guidance**: templates guidance.', '- **Stations**: implement\n- **Guidance**: templates guidance.');
    await fs.promises.writeFile(playbookFile(), declared);
    const result = await runCli(['learn', 'playbook', '--station', 'implement', '--modules', 'lib']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('station-selected');
    expect(result.stdout).toContain('templates guidance.');
    expect(result.stdout).not.toContain('lib guidance.');
    expect(result.stdout.indexOf('PB-001 ·')).toBeLessThan(result.stdout.indexOf('PB-002 ·'));
    for (const args of [
      ['--station', 'all'], ['--station', 'plan', '--id', 'PB-001'], ['--station', 'plan', '--modules', ','],
    ]) {
      const invalid = await runCli(['learn', 'playbook', ...args]);
      expect(invalid.exitCode).toBe(1);
      expect(invalid.stderr.length).toBeGreaterThan(0);
    }
  });
});
