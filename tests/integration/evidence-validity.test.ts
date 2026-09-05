import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { execute as check } from '../../src/services/check.service.js';
import { execute as verify } from '../../src/services/verify-record.service.js';
import { execute as status } from '../../src/services/status.service.js';
import { execute as archive } from '../../src/services/archive.service.js';
import type { QualityDimension } from '../../src/types/change.js';
vi.setConfig({ testTimeout: 30_000 });
let root: string;
const write = (name: string, text: string) => { mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); writeFileSync(path.join(root, name), text); };
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
const judgment = (fail: string[] = []): QualityDimension[] => ['delta-spec-compliance', 'constitution', 'design'].map((name) => ({ name, result: fail.includes(name) ? 'FAIL' : name === 'design' ? 'not-applicable' : 'PASS', graded_by: 'fresh-subagent' }));
const record = (fail: string[] = [], warnings: string[] = []) => verify({ cwd: root, change: 'x', quiet: true, judgmentDimensions: judgment(fail), warnings });
const bytes = (): Record<string, string> => Object.fromEntries(readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && !path.join(e.parentPath, e.name).includes(`${path.sep}.git${path.sep}`)).map((e) => [path.relative(root, path.join(e.parentPath, e.name)), readFileSync(path.join(e.parentPath, e.name)).toString('base64')]));
beforeEach(async () => {
  root = mkdtempSync(path.join(os.tmpdir(), 'evidence-lifecycle-'));
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  write('.prospec.yaml', `version: "1.0"\nproject:\n  name: fixture\ntech_stack:\n  test_command: ${process.execPath} suite.cjs\n`);
  write('suite.cjs', "const fs=require('fs');const p='.prospec/suite-count';fs.writeFileSync(p,String(Number(fs.existsSync(p)?fs.readFileSync(p,'utf8'):0)+1));");
  write('prospec/CONSTITUTION.md', '# Constitution\n\n## Principles\n\n### [MUST] Tests\n\n**Description**: Test the behavior.\n\n**Verify**: Tests pass.\n');
  write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: "2026-09-05"\nstatus: implemented\nscale: full\n');
  write('.prospec/changes/x/delta-spec.md', '# Delta Spec\n\n## ADDED\n');
  write('.prospec/changes/x/tasks.md', '- [x] T1 Implement fixture behavior\n');
  git('add', '.'); git('commit', '-qm', 'fixture');
  await check({ cwd: root, change: 'x', recordReview: true });
  await check({ cwd: root, change: 'x', recordTests: true });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('live evidence consumers', () => {
  it('records from live inputs without a saved report', async () => {
    expect((await record()).grade).toBe('A');
  });
  it.each(['B', 'C', 'D'])('refuses archive after normal re-verify grade %s even with an older passing report', async (grade) => {
    expect((await record()).grade).toBe('A');
    await check({ cwd: root, json: true });
    const result = grade === 'B' ? await record([], ['one', 'two', 'three']) : await record(grade === 'C' ? ['delta-spec-compliance'] : ['delta-spec-compliance', 'constitution', 'design']);
    expect(result.grade).toBe(grade);
    const before = bytes();
    for (const dryRun of [true, false]) {
      const refusal = await archive({ cwd: root, names: ['x'], dryRun });
      expect(refusal.refused).toHaveLength(1); expect(bytes()).toEqual(before);
    }
  });
  it('uses current task facts and never writes on archive refusal', async () => {
    await record(); await check({ cwd: root, json: true });
    write('.prospec/changes/x/tasks.md', '- [ ] T1 Implement fixture behavior\n');
    const before = bytes();
    for (const dryRun of [true, false]) {
      expect((await archive({ cwd: root, names: ['x'], dryRun })).refused).toHaveLength(1);
      expect(bytes()).toEqual(before);
    }
  });
  it('archives after an equivalent commit without an extra suite invocation', async () => {
    await record(); git('add', '.'); git('commit', '-qm', 'equivalent inputs');
    const count = readFileSync(path.join(root, '.prospec/suite-count'), 'utf8');
    const result = await archive({ cwd: root, names: ['x'] });
    expect(result.refused).toEqual([]); expect(result.archived).toHaveLength(1);
    expect(readFileSync(path.join(root, '.prospec/suite-count'), 'utf8')).toBe(count);
  });
});

it.each(['delta', 'review provenance', 'test provenance'])('refuses current %s mutation despite an older passing report', async (kind) => {
  await record(); await check({ cwd: root, json: true });
  if (kind === 'delta') write('.prospec/changes/x/delta-spec.md', '# Changed delta\n');
  else {
    const p = path.join(root, '.prospec/changes/x/metadata.yaml');
    const text = readFileSync(p, 'utf8');
    const key = kind === 'review provenance' ? 'review_provenance:' : 'test_provenance:';
    const start = text.indexOf(key); expect(start).toBeGreaterThanOrEqual(0);
    write('.prospec/changes/x/metadata.yaml', text.slice(0, start) + text.slice(start).replace(/digest: [^\n]+/, 'digest: changed'));
  }
  const before = bytes();
  for (const dryRun of [true, false]) {
    expect((await archive({ cwd: root, names: ['x'], dryRun })).refused).toHaveLength(1);
    expect(bytes()).toEqual(before);
  }
});

it('keeps an already stale finding current across an equivalent history amend (F-265-3)', async () => {
  rmSync(path.join(root, '.prospec/changes/x'), { recursive: true });
  write('src/lib/input.ts', 'export const value = 1;');
  write('prospec/ai-knowledge/modules/lib/README.md', '# Lib\n');
  write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n    last_verified: "2026-09-01T00:00:00Z"\n');
  const dated = (args: string[], date: string) => execFileSync('git', args, { cwd: root, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } });
  git('add', '.'); dated(['commit', '-qm', 'source'], '2026-09-03T12:00:00Z');
  await check({ cwd: root, json: true });
  const before = await status({ cwd: root });
  expect(before.drift).toMatchObject({ state: 'findings', count: 1 });
  dated(['commit', '--amend', '--no-edit', '--date', '2026-09-04T12:00:00Z'], '2026-09-04T12:00:00Z');
  expect((await status({ cwd: root })).drift).toEqual(before.drift);
});
