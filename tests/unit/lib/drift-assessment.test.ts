import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { computeChangeState } from '../../../src/lib/drift-sources.js';
import { assessCurrentDrift } from '../../../src/lib/drift-assessment.js';
import { DRIFT_CHECK_IDS } from '../../../src/types/drift-report.js';
const gitCalls = vi.hoisted(() => ({ count: 0, failConfig: false, addAfterListing: false, observedAddition: false, addOnStatus: 0, statusCount: 0 }));
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, execFileSync: ((file: string, args: string[], opts: unknown) => {
    if (file === 'git') gitCalls.count++;
    if (gitCalls.failConfig && args[0] === 'config') throw Error('config unreadable');
    if (args[0] === 'status' && gitCalls.addOnStatus > 0 && ++gitCalls.statusCount === gitCalls.addOnStatus) {
      writeFileSync(path.join((opts as { cwd: string }).cwd, 'new-input.ts'), 'unchecked');
    }
    const result = (actual.execFileSync as (...args: unknown[]) => unknown)(file, args, opts);
    if (gitCalls.addAfterListing && args[0] === 'ls-files') {
      gitCalls.addAfterListing = false;
      writeFileSync(path.join((opts as { cwd: string }).cwd, 'new-input.ts'), 'export const unchecked = true;');
    }
    if (args[0] === 'status' && String(result).includes('new-input.ts')) gitCalls.observedAddition = true;
    return result;
  }) as typeof actual.execFileSync };
});
vi.setConfig({ testTimeout: 30_000 });
let root: string;
const write = (p: string, text: string) => { mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); writeFileSync(path.join(root, p), text); };
beforeEach(() => {
  gitCalls.failConfig = false; gitCalls.addAfterListing = false; gitCalls.observedAddition = false; gitCalls.addOnStatus = 0; gitCalls.statusCount = 0;
  root = mkdtempSync(path.join(os.tmpdir(), 'assessment-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: t\n');
  write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: today\nstatus: tasks\nscale: full\n');
  write('.prospec/changes/x/tasks.md', '- [ ] T1 task\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe('current assessment', () => {
  it('collects the full existing registry without writes', async () => {
    const before = readFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'));
    const a = await assessCurrentDrift(root);
    expect(a.report.structural.checks.map((c) => c.id)).toEqual(DRIFT_CHECK_IDS);
    expect(a.recheck()).toBe(true);
    expect(readFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'))).toEqual(before);
  });
  it.each(['tasks.md', 'metadata.yaml', 'delta-spec.md', 'backfill-draft.md'])('refuses a changed workflow observation: %s', async (file) => {
    const a = await assessCurrentDrift(root); write(`.prospec/changes/x/${file}`, 'changed'); expect(a.recheck()).toBe(false);
  });
  /**
   * The shipped-skill roots are inputs to `skill-reference-map`, so a deployment
   * that shifts between collection and a gate's write must make the recheck
   * false. An expected-but-absent root counts too: a first sync landing mid-gate
   * is exactly the case a snapshot taken before it would certify wrongly.
   */
  describe('observes every configured shipped-skill root', () => {
    const configured = 'version: "1.0"\nproject:\n  name: t\nagents:\n  - claude\n';

    it('refuses a reference added under a deployed skill after collection', async () => {
      write('.prospec.yaml', configured);
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      const a = await assessCurrentDrift(root);
      expect(a.recheck()).toBe(true);
      write('.claude/skills/prospec-tasks/references/orphan.md', '# orphan\n');
      expect(a.recheck()).toBe(false);
    });

    it('refuses a deployed skill whose bytes changed after collection', async () => {
      write('.prospec.yaml', configured);
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      const a = await assessCurrentDrift(root);
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks edited\n');
      expect(a.recheck()).toBe(false);
    });

    it('refuses a deployed file removed after collection', async () => {
      write('.prospec.yaml', configured);
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      write('.claude/skills/prospec-tasks/references/tasks-format.md', '# f\n');
      const a = await assessCurrentDrift(root);
      rmSync(path.join(root, '.claude/skills/prospec-tasks/references/tasks-format.md'));
      expect(a.recheck()).toBe(false);
    });

    it('refuses a first deployment appearing in a root that did not exist', async () => {
      write('.prospec.yaml', configured);
      const a = await assessCurrentDrift(root);
      // Nothing was deployed at collection time — the check failed — and the
      // sync lands before the gate writes.
      expect(a.report.structural.checks.find((c) => c.id === 'skill-reference-map')?.status).toBe('fail');
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      expect(a.recheck()).toBe(false);
    });

    it('observes directory membership, not only the files the collector reads', async () => {
      write('.prospec.yaml', configured);
      write('.gitignore', '.claude/\n');
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      const a = await assessCurrentDrift(root);
      expect(a.recheck()).toBe(true);
      // A project's own skill is outside the check, so the collected inputs are
      // byte-identical before and after; the deployment is gitignored, so the
      // repository fingerprint does not move either. Only observing the ROOT can
      // see it — which is the whole point of observing the directory rather than
      // trusting the subset of files that happened to be read.
      write('.claude/skills/my-house-style/SKILL.md', '# mine\n');
      expect(a.recheck()).toBe(false);
    });

    it('observes a deployment git never tracked', async () => {
      write('.prospec.yaml', configured);
      write('.gitignore', '.claude/\n');
      write('.claude/skills/prospec-tasks/SKILL.md', '# tasks\n');
      const a = await assessCurrentDrift(root);
      write('.claude/skills/prospec-tasks/SKILL.md', '# edited while ignored\n');
      expect(a.recheck()).toBe(false);
    });
  });

  it('detects change membership, source and ignore config mutations', async () => {
    const a = await assessCurrentDrift(root); write('.prospec/changes/new/proposal.md', 'new'); expect(a.recheck()).toBe(false);
    const b = await assessCurrentDrift(root); write('input.txt', 'new'); expect(b.recheck()).toBe(false);
    const c = await assessCurrentDrift(root); write('.git/info/exclude', 'input.txt\n'); expect(c.recheck()).toBe(false);
  });
});

it('keeps ordinary assessment within six Git subprocesses', async () => {
  write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n');
  write('src/lib/input.ts', 'export const value = 1;');
  gitCalls.count = 0;
  await assessCurrentDrift(root);
  expect(gitCalls.count).toBeLessThanOrEqual(6);
  expect(gitCalls.count).toBeGreaterThanOrEqual(4);
});
it('refuses an unavailable Git configuration observation even with provable content', async () => {
  gitCalls.failConfig = true;
  const a = await assessCurrentDrift(root);
  expect(a.snapshot.digest).not.toBeNull();
  expect(a.recheck()).toBe(false);
});

it('rejects membership added after listing but observed by status during receipt recheck (F-265-1)', async () => {
  gitCalls.addAfterListing = true;
  expect(computeChangeState(root).digest).toBeNull();
  expect(gitCalls.observedAddition).toBe(true);
  rmSync(path.join(root, 'new-input.ts'));
  const assessment = await assessCurrentDrift(root);
  gitCalls.addAfterListing = true;
  expect(assessment.recheck()).toBe(false);
  expect(gitCalls.observedAddition).toBe(true);
});

it('reconciles membership seen during deletion confirmation (F-265-1 sibling)', () => {
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  write('deleted.ts', 'old');
  execFileSync('git', ['add', '.'], { cwd: root });
  execFileSync('git', ['commit', '-qm', 'base'], { cwd: root });
  rmSync(path.join(root, 'deleted.ts'));
  gitCalls.addOnStatus = 2;
  expect(computeChangeState(root).digest).toBeNull();
  expect(gitCalls.observedAddition).toBe(true);
});
