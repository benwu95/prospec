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
});
