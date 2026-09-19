import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareFixture, fixtureCli, suiteCount } from '../../../scripts/workflow-eval/fixtures.js';
import { OracleSchema, ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';

// Spawns the frozen CLI through tsx: a FILE-level bound, since a later file default outranks a per-test one (PB-010).
vi.setConfig({ testTimeout: 90_000 });

describe('failed and pending workflow fixtures', () => {
  it.each(['reverify-c', 'missing-receipt'])('%s never starts at an archive route', async (id) => {
    const root = resolve('tests/fixtures/workflow-eval');
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(root, 'public', `${id}.json`), 'utf8')));
    const oracle = OracleSchema.parse(JSON.parse(await readFile(join(root, 'private', `${id}.json`), 'utf8')));
    const fixture = await prepareFixture(scenario);
    try {
      const before = await suiteCount(fixture.cwd);
      const report = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(report.errors).toEqual([]);
      expect(report.changes[0].next).toBe(oracle.routes[0]);
      expect(report.changes[0].next).not.toBe('archive');
      if (id === 'reverify-c') {
        expect(report.changes[0].code).toBe('VERIFY_GRADE_BELOW_BAR');
        expect(await readFile(join(fixture.cwd, '.prospec/changes/x/metadata.yaml'), 'utf8')).toContain('status: verified');
      } else {
        expect(scenario.delegation?.polls).toEqual(['pending', 'timeout']);
        expect(oracle.required_signals).toEqual(['pending', 'timeout']);
        expect(oracle.payloads).toEqual([]);
      }
      expect(oracle.terminal).toBe('stop');
      expect(oracle.forbidden_commands).toContain('archive');
      expect(await suiteCount(fixture.cwd) - before).toBe(oracle.suite_runs);
    } finally {
      await rm(fixture.cwd, { recursive: true, force: true });
    }
  });

  it('reverify-c stops routing to verify upon reaching max_station_retries (T20, REQ-TESTS-122)', async () => {
    const root = resolve('tests/fixtures/workflow-eval');
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(root, 'public', 'reverify-c.json'), 'utf8')));
    const fixture = await prepareFixture(scenario);
    try {
      // reverify-c setup already recorded 1 below-bar grade (streak = 1)
      const report1 = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(report1.changes[0].next).toBe('verify');
      expect(report1.changes[0].code).toBe('VERIFY_GRADE_BELOW_BAR');

      // Record 2 more below-bar grades to reach default limit of 3
      const { writeFile } = await import('node:fs/promises');
      const judgmentPath = join(fixture.cwd, '.prospec/test-judgment.json');
      const failingJudgment = [
        { name: 'delta-spec-compliance', result: 'FAIL', graded_by: 'fresh-subagent' },
        { name: 'constitution', result: 'PASS', graded_by: 'fresh-subagent' },
        { name: 'design', result: 'not-applicable', graded_by: 'fresh-subagent' },
      ];
      await writeFile(judgmentPath, JSON.stringify(failingJudgment));

      fixtureCli(fixture.cwd, ['verify', 'record', '--change', 'x', '--dimensions', judgmentPath]);
      // Streak = 2 (N-1): still routes to verify
      const report2 = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(report2.changes[0].next).toBe('verify');

      fixtureCli(fixture.cwd, ['verify', 'record', '--change', 'x', '--dimensions', judgmentPath]);
      // Streak = 3 (N): escalates, MUST NOT route to verify
      const report3 = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(report3.changes[0].next).toBeNull();
      expect(report3.changes[0].code).toBe('ESCALATE_TO_HUMAN');

      // Streak = 4 (N+1): still escalated, cannot re-enter verify
      fixtureCli(fixture.cwd, ['verify', 'record', '--change', 'x', '--dimensions', judgmentPath]);
      const report4 = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(report4.changes[0].next).toBeNull();
      expect(report4.changes[0].code).toBe('ESCALATE_TO_HUMAN');
    } finally {
      await rm(fixture.cwd, { recursive: true, force: true });
    }
  });
});

