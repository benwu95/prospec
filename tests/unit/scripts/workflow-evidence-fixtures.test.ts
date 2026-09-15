import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareFixture, fixtureCli, suiteCount, SETUP_JUDGMENT } from '../../../scripts/workflow-eval/fixtures.js';
import { atomicWrite } from '../../../src/lib/fs-utils.js';
import { DriftReportSchema } from '../../../src/types/drift-report.js';
import { OracleSchema, ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';

// Spawns the frozen CLI through tsx: a FILE-level bound, since a later file default outranks a per-test one (PB-010).
vi.setConfig({ testTimeout: 90_000 });

describe('real evidence fixture setup', () => {
  it.each(['proven-backfill', 'equivalent-commit'])('%s uses actual evidence owners', async (id) => {
    const root = resolve('tests/fixtures/workflow-eval');
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(root, 'public', `${id}.json`), 'utf8')));
    const oracle = OracleSchema.parse(JSON.parse(await readFile(join(root, 'private', `${id}.json`), 'utf8')));
    const fixture = await prepareFixture(scenario);
    try {
      const before = await suiteCount(fixture.cwd);
      const status = JSON.parse(fixtureCli(fixture.cwd, ['status', '--json']));
      expect(status.errors).toEqual([]);
      expect(status.changes[0].next).toBe(oracle.routes[0]);
      if (id === 'proven-backfill') {
        expect(before).toBe(0);
        expect(await readFile(join(fixture.cwd, '.prospec/changes/x/backfill-draft.md'), 'utf8')).toContain('src/value.cjs');
        fixtureCli(fixture.cwd, ['check', '--change', 'x', '--record-tests']);
        await atomicWrite(join(fixture.cwd, '.prospec/judgment.json'), JSON.stringify(SETUP_JUDGMENT));
        fixtureCli(fixture.cwd, ['verify', 'record', '--change', 'x', '--dimensions', '.prospec/judgment.json']);
        expect(await suiteCount(fixture.cwd) - before).toBe(oracle.suite_runs);
      } else {
        expect(before).toBe(1);
        fixtureCli(fixture.cwd, ['check', '--change', 'x', '--json']);
        const report = DriftReportSchema.parse(JSON.parse(await readFile(join(fixture.cwd, 'prospec-report.json'), 'utf8')));
        for (const id of ['test-provenance', 'review-provenance']) {
          expect(report.structural.checks.find((c) => c.id === id)).toMatchObject({ status: 'pass', subjects: ['x'] });
        }
        const metadata = await readFile(join(fixture.cwd, '.prospec/changes/x/metadata.yaml'), 'utf8');
        expect(metadata).toContain('status: verified');
        expect(metadata).toContain('test_provenance:');
        expect(metadata).toContain('review_provenance:');
        expect(await suiteCount(fixture.cwd) - before).toBe(oracle.suite_runs);
      }
    } finally {
      await rm(fixture.cwd, { recursive: true, force: true });
    }
  });
});
