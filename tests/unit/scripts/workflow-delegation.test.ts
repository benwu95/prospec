import { rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { Gateway } from '../../../scripts/workflow-eval/runner.js';
import { prepareFixture } from '../../../scripts/workflow-eval/fixtures.js';
import { ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';
import { TASKS_VERIFIER_DIMENSIONS } from '../../../src/types/station.js';

const scenario = ScenarioSchema.parse({ version: 1, id: 'quick', setup: 'quick', entry_skill: 'prospec-tasks', task: 'Plan only',
  files: { '.prospec.yaml': 'version: "1.0"\nproject:\n  name: fixture\n',
    '.prospec/changes/x/metadata.yaml': 'name: x\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n',
    '.prospec/changes/x/tasks.md': '- [ ] T1 Correct spelling\n' } });
const report = JSON.stringify({ verdict: 'PASS', dimensions: Object.fromEntries(TASKS_VERIFIER_DIMENSIONS.map((d) => [d, { result: 'PASS', rationale: 'Synthetic test fixture' }])), evidence: 'Synthetic fixture, not model evidence' });
const path = '.prospec/changes/x/tasks-verifier.json';
vi.setConfig({ testTimeout: 90_000 });
describe('fresh-context receipt authority', () => {
  it('refuses a self-written report at the CLI receipt sink', async () => {
    const fixture = await prepareFixture(scenario);
    try {
      const gateway = new Gateway(fixture, scenario, 10000);
      await gateway.apply({ kind: 'write', path, content: report });
      expect((await gateway.apply({ kind: 'submit', schema: 'prospec-tasks', path })).ok).toBe(true);
      expect((await gateway.apply({ kind: 'cli', args: ['change', 'log', '--change', 'x', '--skill', 'prospec-tasks', '--verifier-report', path] })).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('records a separately produced valid report through the actual CLI and invalidates it on edit', async () => {
    const fixture = await prepareFixture(scenario);
    try {
      const gateway = new Gateway(fixture, scenario, 10000, { timeoutMs: 10000,
        delegate: async (_action, context) => {
          expect(Object.keys(context)).toEqual(['.prospec/changes/x/tasks.md']);
          return { content: report, usage: null };
        } });
      expect((await gateway.apply({ kind: 'delegate', schema: 'prospec-tasks', path,
        prompt: 'Independently review this task list', reads: ['.prospec/changes/x/tasks.md'] })).ok).toBe(true);
      expect(gateway.events.at(-1)).toMatchObject({ kind: 'payload', valid: true, source: 'fresh-executor' });
      const args = ['change', 'log', '--change', 'x', '--skill', 'prospec-tasks', '--verifier-report', path];
      expect((await gateway.apply({ kind: 'cli', args })).ok).toBe(true);
      await gateway.apply({ kind: 'write', path, content: report + ' ' });
      expect((await gateway.apply({ kind: 'cli', args })).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('cannot reuse a receipt for another change target', async () => {
    const two = { ...scenario, files: { ...scenario.files,
      '.prospec/changes/y/metadata.yaml': scenario.files['.prospec/changes/x/metadata.yaml']!.replace('name: x', 'name: y') } };
    const fixture = await prepareFixture(two);
    try {
      const gateway = new Gateway(fixture, two, 10000, { timeoutMs: 10000, delegate: async () => ({ content: report, usage: null }) });
      await gateway.apply({ kind: 'delegate', schema: 'prospec-tasks', path, prompt: 'Review x', reads: ['.prospec/changes/x/tasks.md'] });
      expect((await gateway.apply({ kind: 'cli', args: ['change', 'log', '--change', 'y', '--skill', 'prospec-tasks', '--verifier-report', path] })).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
});
