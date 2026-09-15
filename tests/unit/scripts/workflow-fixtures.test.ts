import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { atomicWrite } from '../../../src/lib/fs-utils.js';
import { execute as status } from '../../../src/services/status.service.js';
import { OracleSchema, ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';

// Spawns the frozen CLI through tsx: a FILE-level bound, since a later file default outranks a per-test one (PB-010).
vi.setConfig({ testTimeout: 90_000 });

const fixtures = resolve('tests/fixtures/workflow-eval');
describe('versioned workflow fixtures', () => {
  it.each([
    ['quick', 'tasks', 'handoff'],
    ['standard-ui', 'design', 'handoff'],
  ])('%s has independent, executable routing expectations', async (id, route, terminal) => {
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(join(fixtures, 'public', `${id}.json`), 'utf8')));
    const oracle = OracleSchema.parse(JSON.parse(await readFile(join(fixtures, 'private', `${id}.json`), 'utf8')));
    expect(scenario.id).toBe(id);
    expect(scenario.setup).toBe(id);
    expect(oracle.id).toBe(id);
    expect(oracle.routes[0]).toBe(route);
    expect(oracle.terminal).toBe(terminal);
    expect(oracle.suite_runs).toBe(0);
    expect(oracle.forbidden_commands).toContain('archive');
    expect(oracle.forbidden_files.length).toBeGreaterThan(0);
    expect(Object.keys(scenario.files).some((p) => p.includes('private') || p.includes('oracle'))).toBe(false);
    const cwd = await mkdtemp(join(tmpdir(), 'workflow-fixture-'));
    try {
      for (const [file, content] of Object.entries(scenario.files)) await atomicWrite(join(cwd, file), content);
      const actual = await status({ cwd });
      expect(actual.errors).toEqual([]);
      expect(actual.changes).toHaveLength(1);
      expect(actual.changes[0]?.next).toBe(oracle.routes[0]);
      const cli = JSON.parse(execFileSync(process.execPath, [
        '--import', import.meta.resolve('tsx'), resolve('src/cli/index.ts'), 'status', '--json',
      ], { cwd, encoding: 'utf8', timeout: 10000 }));
      expect(cli.errors).toEqual([]);
      expect(cli.changes[0]?.next).toBe(oracle.routes[0]);
      for (const file of oracle.required_reads) expect(scenario.files[file], file).toBeDefined();
      for (const file of oracle.forbidden_files) expect(scenario.files[file], file).toBeUndefined();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
