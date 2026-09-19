import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runCliInProcess } from './helpers/run-cli.js';

describe('status CLI e2e — escalation loops and output formatting (T19, REQ-CLI-023, REQ-CLI-039)', () => {
  let tmpDir: string;

  const runCli = (args: string[]) => runCliInProcess(args, { cwd: tmpDir });

  const writeReport = (filename: string, report: unknown): string => {
    const p = path.join(tmpDir, filename);
    fs.writeFileSync(p, JSON.stringify(report));
    return p;
  };

  const planReport = (verdict: string) => ({
    verdict,
    dimensions: Object.fromEntries(
      ['project_layering', 'blast_radius', 'state_safety', 'delta_spec', 'reuse'].map((d) => [
        d,
        { result: verdict === 'FLAWS' && d === 'reuse' ? 'FLAWS' : 'PASS', rationale: `${d} assessed` },
      ]),
    ),
    evidence: 'synthetic e2e report',
  });

  const tasksReport = (verdict: string) => ({
    verdict,
    dimensions: Object.fromEntries(
      ['bidirectional_coverage', 'dag_topological_order', 'tdd_module_closure', 'task_sizing_schema'].map(
        (d) => [
          d,
          {
            result: verdict === 'FLAWS' && d === 'bidirectional_coverage' ? 'FLAWS' : 'PASS',
            rationale: `${d} assessed`,
          },
        ],
      ),
    ),
    evidence: 'synthetic e2e report',
  });

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'prospec-escalation-e2e-'));
    await fs.promises.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-e2e' }));
    await runCli(['init', '--name', 'test-e2e', '--agents', 'claude']);
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('escalates on 3 consecutive plan verifier FLAWS (Loop 1)', async () => {
    await runCli(['change', 'story', 'loop1', '--description', 'loop 1 test']);
    await runCli(['change', 'plan']);

    const reportFile = writeReport('plan-flaws.json', planReport('FLAWS'));
    for (let i = 0; i < 3; i++) {
      const res = await runCli(['change', 'log', '--skill', 'prospec-plan', '--verifier-report', reportFile]);
      expect(res.exitCode).toBe(0);
    }

    const jsonRes = await runCli(['status', '--json']);
    const statusJson = JSON.parse(jsonRes.stdout) as {
      changes: Array<{
        next: string | null;
        code: string;
        nextSkill?: string;
        nextSkillPath?: string;
        nextReferenceMap?: unknown[];
      }>;
    };
    expect(statusJson.changes[0]?.code).toBe('ESCALATE_TO_HUMAN');
    expect(statusJson.changes[0]?.next).toBeNull();
    expect(statusJson.changes[0]?.nextSkill).toBeUndefined();
    expect(statusJson.changes[0]?.nextSkillPath).toBeUndefined();
    expect(statusJson.changes[0]?.nextReferenceMap).toBeUndefined();

    const humanRes = await runCli(['status']);
    expect(humanRes.stdout).toContain('HALT (escalated to human)');
    expect(humanRes.stdout).toContain('HALT — human intervention required; station retry limit exceeded');
    expect(humanRes.stdout).toContain('[ESCALATE_TO_HUMAN]');
    expect(humanRes.stdout).not.toContain('action:  invoke skill');
    expect(humanRes.stdout).not.toContain('fallback: read');
    expect(humanRes.stdout).not.toContain('— terminal (periodic prospec-learn)');
  });

  it('escalates on 3 consecutive tasks verifier FLAWS (Loop 2)', async () => {
    await runCli(['change', 'story', 'loop2', '--description', 'loop 2 test']);
    await runCli(['change', 'plan']);
    await runCli(['change', 'tasks']);

    const reportFile = writeReport('tasks-flaws.json', tasksReport('FLAWS'));
    for (let i = 0; i < 3; i++) {
      const res = await runCli(['change', 'log', '--skill', 'prospec-tasks', '--verifier-report', reportFile]);
      expect(res.exitCode).toBe(0);
    }

    const humanRes = await runCli(['status']);
    expect(humanRes.stdout).toContain('HALT (escalated to human)');
    expect(humanRes.stdout).toContain('HALT — human intervention required; station retry limit exceeded');
    expect(humanRes.stdout).toContain('[ESCALATE_TO_HUMAN]');
  });

  it('escalates on 3 consecutive below-bar verify grades (Loop 3)', async () => {
    await runCli(['change', 'story', 'loop3', '--description', 'loop 3 test']);
    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'loop3', 'metadata.yaml');
    const content = [
      'name: loop3',
      'created_at: 2026-01-01T00:00:00.000Z',
      'status: verified',
      'scale: standard',
      'quality_log:',
      '  - skill: prospec-verify',
      '    date: 2026-01-02T00:00:00.000Z',
      '    result: FAIL',
      '    grade: C',
      '  - skill: prospec-verify',
      '    date: 2026-01-03T00:00:00.000Z',
      '    result: FAIL',
      '    grade: B',
      '  - skill: prospec-verify',
      '    date: 2026-01-04T00:00:00.000Z',
      '    result: FAIL',
      '    grade: D',
      '',
    ].join('\n');
    await fs.promises.writeFile(metaPath, content);

    const humanRes = await runCli(['status']);
    expect(humanRes.stdout).toContain('HALT (escalated to human)');
    expect(humanRes.stdout).toContain('HALT — human intervention required; station retry limit exceeded');
    expect(humanRes.stdout).toContain('[ESCALATE_TO_HUMAN]');
  });

  it('distinguishes escalated output from terminal archived output', async () => {
    // 1. Terminal archived change in clean directory
    await runCli(['change', 'story', 'done-change', '--description', 'done change test']);
    const metaPath = path.join(tmpDir, '.prospec', 'changes', 'done-change', 'metadata.yaml');
    await fs.promises.writeFile(
      metaPath,
      'name: done-change\ncreated_at: 2026-01-01T00:00:00.000Z\nstatus: archived\nscale: standard\n',
    );

    const cleanRes = await runCli(['status']);
    expect(cleanRes.stdout).toContain('No in-progress changes');
    expect(cleanRes.stdout).not.toContain('HALT');
    expect(cleanRes.stdout).not.toContain('ESCALATE_TO_HUMAN');

    // 2. Direct formatter comparison for escalated vs terminal route
    const { formatStatusOutput } = await import('../../src/cli/formatters/status-output.js');
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.map(String).join(' '));

    try {
      // Format escalated report
      formatStatusOutput(
        {
          clean: false,
          changes: [
            {
              name: 'escalated-change',
              status: 'plan',
              scale: 'standard',
              current: 'plan',
              next: null,
              code: 'ESCALATE_TO_HUMAN',
              blockingGates: ['fix flaws'],
              reasons: ['the prospec-plan verifier has failed 3 consecutive times'],
            },
          ],
          errors: [],
        },
        'normal',
      );
      const escalatedOutput = logs.join('\n');
      expect(escalatedOutput).toContain('— HALT (escalated to human)');
      expect(escalatedOutput).toContain('HALT — human intervention required; station retry limit exceeded');
      expect(escalatedOutput).not.toContain('— terminal (periodic prospec-learn)');
      expect(escalatedOutput).not.toContain('invoke skill');

      logs.length = 0;

      // Format terminal archived report
      formatStatusOutput(
        {
          clean: false,
          changes: [
            {
              name: 'archived-change',
              status: 'archived',
              scale: 'standard',
              current: 'archive',
              next: null,
              code: 'TERMINAL',
              blockingGates: [],
              reasons: ['status `archived` — all workflow stations complete'],
            },
          ],
          errors: [],
        },
        'normal',
      );
      const terminalOutput = logs.join('\n');
      expect(terminalOutput).toContain('— terminal (periodic prospec-learn)');
      expect(terminalOutput).not.toContain('HALT');
      expect(terminalOutput).not.toContain('ESCALATE_TO_HUMAN');
      expect(terminalOutput).not.toContain('invoke skill');
    } finally {
      console.log = origLog;
    }
  });
});
