import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execute as check } from '../../src/services/check.service.js';
import { execute as changeStatus } from '../../src/services/change-status.service.js';
import { execute as reviewMerge } from '../../src/services/review-merge.service.js';
import { execute as verifyRecord } from '../../src/services/verify-record.service.js';
import { assessCurrentTestEvidence } from '../../src/lib/drift-assessment.js';
import { readChangeMetadata } from '../../src/lib/change-metadata.js';
import type { QualityDimension } from '../../src/types/change.js';

vi.setConfig({ testTimeout: 90_000, hookTimeout: 30_000 });
let root: string;
const change = 'example';
const metadataFile = `.prospec/changes/${change}/metadata.yaml`;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
const write = (file: string, text: string) => {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
};
const count = () => Number(read('.prospec/invocations'));
const records = () => {
  const metadata = readChangeMetadata(path.join(root, metadataFile), change).metadata;
  const text = read(metadataFile);
  return {
    attempt: metadata.test_attempt, provenance: metadata.test_provenance,
    attemptBytes: /^test_attempt:\n(?:[ \t].*\n)*/m.exec(text)?.[0],
    provenanceBytes: /^test_provenance:\n(?:[ \t].*\n)*/m.exec(text)?.[0],
  };
};
const run = () => check({ cwd: root, change, recordTests: true });
const report = async () => {
  const result = await check({ cwd: root, json: true });
  if (result.kind !== 'report') throw new Error('Expected a drift report');
  return result.report;
};
const judgment: QualityDimension[] = ['delta-spec-compliance', 'constitution', 'design'].map((name) => ({
  name, result: name === 'design' ? 'not-applicable' : 'PASS', graded_by: 'fresh-subagent',
}));
function seed(enabled = true, base = 'prospec', knowledge?: string, status = 'implemented'): string {
  const knowledgeRoot = knowledge ?? `${base}/ai-knowledge`;
  write('.prospec.yaml', `version: "1.0"\nproject:\n  name: fixture\ntech_stack:\n  test_command: ${JSON.stringify(`${process.execPath} suite.cjs`)}\npaths:\n  base_dir: ${base}\n${knowledge ? `knowledge:\n  base_path: ${knowledge}\n` : ''}${enabled ? 'test_evidence:\n  exclude_knowledge: true\n' : ''}`);
  write('suite.cjs', "const fs=require('node:fs');const p='.prospec/invocations';fs.writeFileSync(p,String(Number(fs.existsSync(p)?fs.readFileSync(p,'utf8'):0)+1));\n");
  write(`${base}/CONSTITUTION.md`, '# Constitution\n\n## Principles\n\n### [MUST] Tests\n\n**Description**: Test behavior.\n\n**Verify**: Tests pass.\n');
  write(`${knowledgeRoot}/modules/example/README.md`, '# Example\n\nExisting Knowledge.\n');
  write(metadataFile, `name: ${change}\ncreated_at: "2026-10-13"\nstatus: ${status}\nscale: full\n`);
  write(`.prospec/changes/${change}/delta-spec.md`, '# Delta Spec\n\n## ADDED\n');
  write(`.prospec/changes/${change}/tasks.md`, '- [x] T1 Implement behavior\n');
  write('src/example.ts', 'export const value = 1;\n');
  write('tests/example.test.ts', 'export const expected = 1;\n');
  write('package.json', '{"name":"fixture"}\n');
  write('pnpm-lock.yaml', 'lockfileVersion: "9.0"\n');
  git('add', '.'); git('commit', '-qm', 'fixture');
  return knowledgeRoot;
}
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'knowledge-evidence-'));
  git('init', '-q'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.com');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('real recorded Knowledge evidence', () => {
  it.each([
    ['prospec', undefined], ['custom-docs', undefined], ['custom-docs', 'independent-knowledge'],
  ])('reuses Knowledge edits across Git states with base %s and knowledge %s', async (base, knowledge) => {
    const knowledgeRoot = seed(true, base, knowledge);
    await check({ cwd: root, change, recordReview: true });
    expect(await run()).toMatchObject({ recorded: true, exitCode: 0 });
    const original = records();
    const metadataBytes = read(metadataFile);
    write(`${knowledgeRoot}/modules/example/README.md`, '# Example\n\nUpdated Knowledge.\n');
    write(`${knowledgeRoot}/new.md`, '# Untracked Knowledge\n');
    for (const state of ['unstaged', 'staged', 'committed', 'amended']) {
      if (state === 'staged') git('add', knowledgeRoot);
      if (state === 'committed') git('commit', '-qm', 'knowledge');
      if (state === 'amended') git('commit', '--amend', '-qm', 'equivalent knowledge');
      const assessment = await assessCurrentTestEvidence(root, change);
      expect(assessment.decision).toMatchObject({ verdict: 'pass', reuse: {
        attempt_id: original.attempt!.id, date: original.provenance!.date,
        command: original.provenance!.command, exit_code: 0,
        test_policy: { version: 1, excluded_path: knowledgeRoot },
      } });
      expect(assessment.recheck()).toBe(true);
      const checked = await report();
      expect(checked.test_evidence?.[change]?.attempt_id).toBe(original.attempt!.id);
      expect(checked.structural.findings.some((f) => f.check === 'test-provenance')).toBe(false);
      expect(checked.structural.findings.some((f) => f.check === 'review-provenance')).toBe(true);
      expect(read(metadataFile)).toBe(metadataBytes);
      expect(count()).toBe(1);
    }
    expect(records()).toEqual(original);
    expect(await run()).toMatchObject({ recorded: true, exitCode: 0 });
    expect(count()).toBe(2);
    expect(records().attempt!.id).not.toBe(original.attempt!.id);
  });

  it('retains default rerun behavior after Knowledge changes', async () => {
    const knowledgeRoot = seed(false);
    await run();
    const original = read(metadataFile);
    write(`${knowledgeRoot}/modules/example/README.md`, '# Changed Knowledge\n');
    expect((await assessCurrentTestEvidence(root, change)).decision.verdict).toBe('refuse');
    expect((await report()).test_evidence?.[change]).toBeUndefined();
    expect(read(metadataFile)).toBe(original);
    expect(count()).toBe(1);
    await run();
    expect(count()).toBe(2);
    expect((await assessCurrentTestEvidence(root, change)).decision).toEqual({ verdict: 'pass', attemptId: records().attempt!.id });
  });

  it.each([false, true])('requires a new baseline when switching from enabled=%s', async (enabled) => {
    seed(enabled);
    await run();
    const original = records();
    const config = read('.prospec.yaml');
    write('.prospec.yaml', enabled
      ? config.replace('test_evidence:\n  exclude_knowledge: true\n', '')
      : `${config}test_evidence:\n  exclude_knowledge: true\n`);
    expect((await assessCurrentTestEvidence(root, change)).decision.verdict).toBe('refuse');
    expect((await report()).test_evidence?.[change]).toBeUndefined();
    expect(records()).toEqual(original);
    expect(count()).toBe(1);
    await run();
    expect((await assessCurrentTestEvidence(root, change)).decision.verdict).toBe('pass');
    expect(count()).toBe(2);
    expect(records().attempt!.id).not.toBe(original.attempt!.id);
  });

  it.each([false, true])('preserves one original run through all gates with unavailable sibling: %s', async (withSibling) => {
    const knowledgeRoot = seed(true, 'prospec', undefined, 'tasks');
    await run();
    const original = records();
    write(`${knowledgeRoot}/modules/example/README.md`, '# Changed Knowledge\n');
    const transitioned = await changeStatus({ cwd: root, change, to: 'implemented', quiet: true });
    expect(transitioned.testGate).toMatchObject({ verdict: 'pass', reuse: { attempt_id: original.attempt!.id } });
    expect(records()).toEqual(original);
    if (withSibling) write('.prospec/changes/sibling/metadata.yaml', read(metadataFile)
      .replace(/^name: .*$/m, 'name: sibling').replace('outcome: passed', 'outcome: unavailable'));
    const findings = `.prospec/changes/${change}/findings.json`;
    write(findings, '[]\n');
    const merged = await reviewMerge({ cwd: root, change, findingsPath: path.join(root, findings), quiet: true });
    expect(merged.testGate).toMatchObject({ verdict: 'pass', reuse: { attempt_id: original.attempt!.id } });
    expect(records()).toEqual(original);
    await check({ cwd: root, change, recordReview: true });
    const verified = await verifyRecord({ cwd: root, change, quiet: true, judgmentDimensions: judgment, warnings: [] });
    expect(verified.dimensions.find((dimension) => dimension.name === 'tests')?.result).toBe('PASS');
    expect(verified.grade).toMatch(/^[SA]$/);
    expect(verified.testReuse).toMatchObject({ attempt_id: original.attempt!.id, date: original.provenance!.date, command: original.provenance!.command, exit_code: 0 });
    expect(records()).toEqual(original);
    expect(count()).toBe(1);
  });
});

const retainedInputs = ['src/example.ts', 'tests/example.test.ts', 'package.json', 'pnpm-lock.yaml', '.prospec.yaml'];
const representations = ['unstaged', 'staged', 'committed', 'untracked'];
describe('retained-input invalidation across Git representations', () => {
  it.each(retainedInputs.flatMap((file) => representations.map((state) => ({ file, state }))))('$file changed while $state refuses the original run', async ({ file, state }) => {
    seed();
    if (state === 'untracked') {
      git('rm', '--cached', file); git('commit', '-qm', 'untrack input');
    }
    await run();
    const original = records();
    const before = read(file);
    write(file, file.endsWith('.json') ? '{"name":"changed"}\n' : `${before}\n${file.endsWith('.ts') ? '//' : '#'} changed input\n`);
    if (state === 'staged' || state === 'committed') git('add', file);
    if (state === 'committed') git('commit', '-qm', 'changed input');
    if (state === 'untracked') expect(git('ls-files', '--others', '--exclude-standard')).toContain(file);
    const assessment = await assessCurrentTestEvidence(root, change);
    expect(assessment.decision.verdict).toBe('refuse');
    expect(assessment.recheck()).toBe(true);
    const checked = await report();
    expect(checked.test_evidence?.[change]).toBeUndefined();
    expect(checked.structural.findings.some((finding) => finding.check === 'test-provenance')).toBe(true);
    expect(records()).toEqual(original);
    expect(count()).toBe(1);
  });
});
