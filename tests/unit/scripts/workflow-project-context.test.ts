import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { prepareFixture, disposeFixture } from '../../../scripts/workflow-eval/fixtures.js';
import { SCENARIO_IDS, ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';

vi.setConfig({ testTimeout: 90_000 });
describe('native workflow project prerequisites', () => {
  it.each(SCENARIO_IDS)('%s provides real project context before evidence initialization', async (id) => {
    const scenario = ScenarioSchema.parse(JSON.parse(await readFile(`tests/fixtures/workflow-eval/public/${id}.json`, 'utf8')));
    const { cwd } = await prepareFixture(scenario);
    try {
      for (const path of ['prospec/CONSTITUTION.md', 'prospec/index.md', 'prospec/ai-knowledge/_conventions.md',
        'prospec/ai-knowledge/module-map.yaml', 'prospec/ai-knowledge/modules/fixture/README.md']) {
        const content = await readFile(join(cwd, path), 'utf8');
        expect(content.trim().length, path).toBeGreaterThan(0);
        const committed = execFileSync('git', ['show', `HEAD:${path}`], { cwd, encoding: 'utf8' });
        expect(committed, path).toBe(content);
      }
      if (scenario.files['prospec/CONSTITUTION.md']) {
        expect(await readFile(join(cwd, 'prospec/CONSTITUTION.md'), 'utf8')).toBe(scenario.files['prospec/CONSTITUTION.md']);
      }
      const module = await readFile(join(cwd, 'prospec/ai-knowledge/modules/fixture/README.md'), 'utf8');
      for (const path of Object.keys(scenario.files).filter((p) => p.startsWith('src/') || p === 'README.md' || p === 'suite.cjs')) {
        expect(module).toContain('`' + path + '`');
      }
      expect(module).not.toMatch(/oracle|expected route|verdict.*PASS/i);
    } finally { await disposeFixture(cwd); }
  });
});
