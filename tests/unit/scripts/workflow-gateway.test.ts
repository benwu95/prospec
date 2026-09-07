import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Gateway } from '../../../scripts/workflow-eval/runner.js';
import { prepareFixture } from '../../../scripts/workflow-eval/fixtures.js';
import { ScenarioSchema } from '../../../scripts/workflow-eval/protocol.js';
import { atomicWrite } from '../../../src/lib/fs-utils.js';

// Spawns the frozen CLI through tsx: a FILE-level bound, since a later file default outranks a per-test one (PB-010).
vi.setConfig({ testTimeout: 90_000 });

const scenario = ScenarioSchema.parse({ version: 1, id: 'quick', setup: 'quick', entry_skill: 'prospec-tasks',
  task: 'Plan only', files: { '.prospec.yaml': 'version: "1.0"\nproject:\n  name: fixture\n',
    '.prospec/changes/x/metadata.yaml': 'name: x\ncreated_at: "2026-09-05"\nstatus: story\nscale: quick\n',
    '.prospec/changes/x/proposal.md': 'A spelling correction' } });
describe('mediated workflow gateway', () => {
  it('rejects non-owned roots including the developer repository', () => {
    expect(() => new Gateway({ cwd: process.cwd(), initialSuiteCount: 0 }, scenario, 10000)).toThrow(/owned/i);
  });
  it('records every proposal before permitting or rejecting its effects', async () => {
    const fixture = await prepareFixture(scenario);
    try {
      const gateway = new Gateway(fixture, scenario, 10000);
      const result = await gateway.apply({ kind: 'read', path: '.prospec/changes/x/proposal.md' });
      expect(result.ok).toBe(true);
      expect(gateway.events.map((e) => e.kind)).toEqual(['attempt', 'read']);
      const write = await gateway.apply({ kind: 'write', path: '.prospec/changes/x/tasks.md', content: '# Tasks' });
      expect(write.ok).toBe(true);
      expect(await readFile(join(fixture.cwd, '.prospec/changes/x/tasks.md'), 'utf8')).toBe('# Tasks');
      for (const path of ['../oracle.json', '/tmp/private', '.git/config', '.prospec.yaml', 'src/value.cjs', '.prospec/changes/x/metadata.yaml']) {
        expect((await gateway.apply({ kind: 'write', path, content: 'bad' })).ok).toBe(false);
        expect(gateway.events.at(-2)?.kind).toBe('attempt');
        expect(gateway.events.at(-1)?.kind).toBe('denied');
      }
      for (const args of [['archive', 'x'], ['check', '--change', '../x'], ['check', '--unknown'], ['status', ';', 'touch', '/tmp/x']]) {
        expect((await gateway.apply({ kind: 'cli', args })).ok).toBe(false);
      }
      expect((await gateway.apply({ kind: 'shell', command: 'echo hi' })).ok).toBe(false);
      expect((await gateway.apply({ kind: 'read', path: 'tests/fixtures/workflow-eval/private/quick.json' })).ok).toBe(false);
      expect((await gateway.apply({ kind: 'cli', args: ['status', '--json'] })).ok).toBe(true);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('refuses symlink ancestors for reads, writes and CLI payload paths', async () => {
    const fixture = await prepareFixture(scenario);
    const outside = await mkdtemp(join(tmpdir(), 'workflow-outside-'));
    try {
      await symlink(outside, join(fixture.cwd, '.prospec/changes/x/link'));
      const gateway = new Gateway(fixture, scenario, 10000);
      for (const action of [
        { kind: 'read', path: '.prospec/changes/x/link/payload.json' },
        { kind: 'write', path: '.prospec/changes/x/link/payload.json', content: '{}' },
        { kind: 'submit', schema: 'prospec-tasks', path: '.prospec/changes/x/link/payload.json' },
        { kind: 'cli', args: ['verify', 'record', '--change', 'x', '--dimensions', '.prospec/changes/x/link/payload.json'] },
      ]) expect((await gateway.apply(action)).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
  it('emits invalid payload observations instead of silently accepting JSON', async () => {
    const fixture = await prepareFixture(scenario);
    try {
      const gateway = new Gateway(fixture, scenario, 10000);
      await gateway.apply({ kind: 'write', path: '.prospec/changes/x/report.json', content: '{"verdict":"PASS"}' });
      expect((await gateway.apply({ kind: 'submit', schema: 'prospec-tasks', path: '.prospec/changes/x/report.json' })).ok).toBe(false);
      expect(gateway.events.at(-1)).toMatchObject({ kind: 'payload', valid: false });
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('observes pending/timeout and stops accepting effects after the terminal', async () => {
    const pending = { ...scenario, delegation: { id: 'v', polls: ['pending' as const, 'timeout' as const] } };
    const fixture = await prepareFixture(pending);
    try {
      const gateway = new Gateway(fixture, pending, 10000);
      expect((await gateway.apply({ kind: 'wait', delegation_id: 'unknown' })).ok).toBe(false);
      expect((await gateway.apply({ kind: 'wait', delegation_id: 'v' })).text).toContain('pending');
      expect((await gateway.apply({ kind: 'wait', delegation_id: 'v' })).text).toContain('timeout');
      await gateway.apply({ kind: 'finish', terminal: 'stop', message: 'Stopped', claims_pass: false });
      expect((await gateway.apply({ kind: 'route', station: 'tasks' })).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('refuses oversized operations and invalid command option combinations', async () => {
    const fixture = await prepareFixture(scenario);
    try {
      const gateway = new Gateway(fixture, scenario, 500);
      for (const args of [['check'], ['status', '--json', '--json'], ['check', '--change'], ['check', '--change', '--json']]) {
        expect((await gateway.apply({ kind: 'cli', args })).ok).toBe(false);
      }
      expect((await gateway.apply({ kind: 'write', path: '.prospec/changes/x/long.md', content: 'a'.repeat(501) })).ok).toBe(false);
      await atomicWrite(join(fixture.cwd, '.prospec/changes/x/large.json'), 'a'.repeat(1000));
      expect((await gateway.apply({ kind: 'read', path: '.prospec/changes/x/large.json' })).ok).toBe(false);
      expect((await gateway.apply({ kind: 'submit', schema: 'review', path: '.prospec/changes/x/large.json' })).ok).toBe(false);
      await atomicWrite(join(fixture.cwd, '.prospec/changes/x/bad.json'), 'not json');
      expect((await gateway.apply({ kind: 'submit', schema: 'review', path: '.prospec/changes/x/bad.json' })).ok).toBe(false);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
  it('uses the suite result, not the structural-check CLI exit status', async () => {
    const backfill = ScenarioSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'tests/fixtures/workflow-eval/public/proven-backfill.json'), 'utf8')));
    const fixture = await prepareFixture(backfill);
    try {
      await atomicWrite(join(fixture.cwd, 'src/value.cjs'), 'module.exports = () => 41;');
      const gateway = new Gateway(fixture, backfill, 100000);
      await gateway.apply({ kind: 'cli', args: ['check', '--change', 'x', '--record-tests'] });
      expect(gateway.events.filter((e) => e.kind === 'suite')).toMatchObject([{ exit_code: 1 }]);
    } finally { await rm(fixture.cwd, { recursive: true, force: true }); }
  });
});
