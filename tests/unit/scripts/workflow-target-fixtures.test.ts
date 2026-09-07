import { readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareFixture, fixtureCli, suiteCount } from '../../../scripts/workflow-eval/fixtures.js';
import { OracleSchema, ScenarioSchema, SCENARIO_IDS } from '../../../scripts/workflow-eval/protocol.js';
import { execute as archive } from '../../../src/services/archive.service.js';

// Spawns the frozen CLI through tsx: a FILE-level bound, since a later file default outranks a per-test one (PB-010).
vi.setConfig({ testTimeout: 90_000 });

const root = resolve('tests/fixtures/workflow-eval');
describe('target isolation workflow fixtures', () => {
  it('enumerates exactly eight matching public/private pairs without private inputs', async () => {
    for (const section of ['public', 'private']) {
      expect((await readdir(join(root, section))).sort()).toEqual(SCENARIO_IDS.map((id) => `${id}.json`).sort());
    }
    for (const id of SCENARIO_IDS) {
      const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(root, 'public', `${id}.json`), 'utf8')));
      const oracle = OracleSchema.parse(JSON.parse(await readFile(join(root, 'private', `${id}.json`), 'utf8')));
      expect(scenario.id).toBe(oracle.id);
      expect(scenario).not.toHaveProperty('routes');
      expect(Object.keys(scenario.files).some((name) => /oracle|private/.test(name))).toBe(false);
    }
  });
  it.each(['stale-delta', 'multi-change'])('%s refuses only the invalid target', async (id) => {
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(root, 'public', `${id}.json`), 'utf8')));
    const oracle = OracleSchema.parse(JSON.parse(await readFile(join(root, 'private', `${id}.json`), 'utf8')));
    const fixture = await prepareFixture(scenario);
    try {
      const count = await suiteCount(fixture.cwd);
      const before = await readFile(join(fixture.cwd, '.prospec/changes/x/metadata.yaml'), 'utf8');
      if (id === 'multi-change') {
        const a = await archive({ cwd: fixture.cwd, names: ['x'], dryRun: true });
        expect(a.refused).toEqual([]);
        const b = await archive({ cwd: fixture.cwd, names: ['y'], dryRun: true });
        expect(b.refused).toHaveLength(1);
      } else {
        const result = await archive({ cwd: fixture.cwd, names: ['x'], dryRun: true });
        expect(result.refused).toHaveLength(1);
      }
      expect(await readFile(join(fixture.cwd, '.prospec/changes/x/metadata.yaml'), 'utf8')).toBe(before);
      expect(await suiteCount(fixture.cwd) - count).toBe(oracle.suite_runs);
      expect(oracle.forbidden_commands).toContain('archive');
      expect(JSON.parse(fixtureCli(fixture.cwd, ['status', '--json'])).errors).toEqual([]);
    } finally {
      await rm(fixture.cwd, { recursive: true, force: true });
    }
  });
});
