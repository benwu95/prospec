import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute } from '../../../src/services/check.service.js';
import { assessCurrentTestEvidence } from '../../../src/lib/drift-assessment.js';
import { parseYaml } from '../../../src/lib/yaml-utils.js';
import type { ChangeMetadata } from '../../../src/types/change.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 });
let root: string;
const put = (name: string, value: string) => {
  mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  writeFileSync(path.join(root, name), value);
};
const metadata = () => parseYaml<ChangeMetadata>(readFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'), 'utf8'));
const run = () => execute({ cwd: root, change: 'x', recordTests: true });
const script = (tail = '') => put('suite.cjs', "const fs=require('node:fs');const counter='count';fs.writeFileSync(counter,String(Number(fs.existsSync(counter)?fs.readFileSync(counter,'utf8'):0)+1));" + tail);
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'test-recording-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
  put('.gitignore', 'count\n.prospec.yaml\n');
  put('.prospec.yaml', `project:\n  name: fixture\ntest_evidence:\n  exclude_knowledge: true\ntech_stack:\n  test_command: ${JSON.stringify(`${process.execPath} suite.cjs`)}\n`);
  put('prospec/ai-knowledge/README.md', 'original');
  put('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: "2026-10-13"\nstatus: implemented\nscale: full\n');
  script(); git('add', '.'); git('commit', '-qm', 'fixture');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('policy-bound test recorder', () => {
  it('writes matching versioned identities and force-runs every explicit request', async () => {
    expect(await run()).toMatchObject({ recorded: true });
    const first = metadata();
    const trace = { fingerprint_version: 'test-inputs-v1', scope: 'repository-inputs-without-knowledge-v1',
      test_policy: { version: 1, excluded_path: 'prospec/ai-knowledge' } };
    expect(first.test_attempt).toMatchObject({ ...trace, outcome: 'passed' });
    expect(first.test_provenance).toMatchObject({ ...trace, attempt_id: first.test_attempt!.id });
    put('prospec/ai-knowledge/README.md', 'updated');
    expect(await run()).toMatchObject({ recorded: true });
    expect(readFileSync(path.join(root, 'count'), 'utf8')).toBe('2');
    expect(metadata().test_attempt!.id).not.toBe(first.test_attempt!.id);
  });
  it('certifies the runner-normalized command when configuration contains repeated whitespace', async () => {
    const file = path.join(root, '.prospec.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace(' suite.cjs', '   suite.cjs'));
    expect(await run()).toMatchObject({ recorded: true });
    expect((await assessCurrentTestEvidence(root, 'x')).decision).toMatchObject({ verdict: 'pass' });
  });
  it('certifies a run that changes only excluded ordinary Knowledge', async () => {
    script("fs.writeFileSync('prospec/ai-knowledge/README.md','updated');");
    expect(await run()).toMatchObject({ recorded: true, treeChangedDuringRun: false });
  });
  it.each(['policy', 'command', 'raw bytes', 'invalid YAML'])('re-reads ignored config after the run: %s', async (mutation) => {
    const replacement = mutation === 'policy' ? "raw.replace('exclude_knowledge: true','exclude_knowledge: false')"
      : mutation === 'command' ? "raw.replace('suite.cjs','other.cjs')" : mutation === 'raw bytes' ? "raw+'# changed\\n'" : "'invalid: ['";
    script(`const raw=fs.readFileSync('.prospec.yaml','utf8');fs.writeFileSync('.prospec.yaml',${replacement});`);
    expect(await run()).toMatchObject({ recorded: false, treeChangedDuringRun: true });
    expect(metadata().test_attempt!.outcome).toBe('unprovable');
    expect(metadata().test_provenance).toBeUndefined();
  });
  it('keeps a real nonzero result durable even if after-capture becomes invalid', async () => {
    script("fs.writeFileSync('.prospec.yaml','invalid: [');process.exit(7);");
    expect(await run()).toMatchObject({ recorded: true, exitCode: 7, treeChangedDuringRun: true });
    expect(metadata().test_provenance!.exit_code).toBe(7);
  });
  it('retains the running prewrite and supersession protection', async () => {
    script("const p='.prospec/changes/x/metadata.yaml';const raw=fs.readFileSync(p,'utf8');require('node:assert').match(raw,/outcome: running/);fs.writeFileSync(p,raw.replace(/id: [^\\n]+/,'id: newer'));");
    expect(await run()).toMatchObject({ recorded: false, reason: expect.stringContaining('superseded') });
    expect(metadata().test_attempt!.id).toBe('newer');
  });
});
