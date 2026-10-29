import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { collectModuleDigests, computeChangeState, computeEvidenceStates, computeTestState } from '../../../src/lib/drift-sources.js';
import { assessCurrentDrift, assessCurrentTestEvidence } from '../../../src/lib/drift-assessment.js';
import { validateConfig, resolveTestCommand } from '../../../src/lib/config.js';
import { assessVerificationContext } from '../../../src/lib/verification-context.js';
import { DRIFT_CHECK_IDS } from '../../../src/types/drift-report.js';
const gitCalls = vi.hoisted(() => ({ count: 0, logOne: 0, recording: 0, updateIndex: 0, adds: 0, failConfig: false, addAfterListing: false, observedAddition: false, addOnStatus: 0, statusCount: 0, spawns: 0 }));
const configRace = vi.hoisted(() => ({ onFirstConfigRead: null as (() => void) | null }));
vi.mock('node:fs', async (original) => {
  const actual = await original<typeof import('node:fs')>();
  return { ...actual, readFileSync: ((p: unknown, ...rest: unknown[]) => {
    const out = (actual.readFileSync as (...a: unknown[]) => unknown)(p, ...rest);
    if (configRace.onFirstConfigRead && String(p).endsWith('.prospec.yaml')) {
      const hook = configRace.onFirstConfigRead; configRace.onFirstConfigRead = null; hook();
    }
    return out;
  }) as typeof actual.readFileSync };
});
vi.mock('node:child_process', async (original) => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, spawnSync: ((...args: unknown[]) => {
    gitCalls.spawns++;
    return (actual.spawnSync as (...a: unknown[]) => unknown)(...args);
  }) as typeof actual.spawnSync, execFileSync: ((file: string, args: string[], opts: unknown) => {
    if (file === 'git') gitCalls.count++;
    if (file === 'git' && args[0] === 'log' && args.includes('-1')) gitCalls.logOne++;
    // The source digest's work-tree recording: locating the index, then git against its copies.
    if (file === 'git' && (args.includes('--git-path') || String((opts as { env?: NodeJS.ProcessEnv } | undefined)?.env?.GIT_INDEX_FILE ?? '').includes('prospec-digest-'))) {
      gitCalls.recording++;
      if (args.includes('update-index')) gitCalls.updateIndex++;
      if (args.includes('add')) gitCalls.adds++;
    }
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

it('keeps ordinary assessment within five Git subprocesses besides one git log -1 per path group and the work-tree recording (REQ-LIB-070)', async () => {
  write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n');
  write('prospec/ai-knowledge/modules/lib/README.md', '# lib\n');
  write('src/lib/input.ts', 'export const value = 1;');
  // A born HEAD, so every path group is asked (an unborn one fails the first query).
  execFileSync('git', ['-c', 'user.email=t@t.dev', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'], { cwd: root });
  gitCalls.count = 0;
  gitCalls.logOne = 0;
  gitCalls.recording = 0;
  await assessCurrentDrift(root);
  expect(gitCalls.recording).toBe(5);
  // One query for the source group and one for the README group.
  expect(gitCalls.logOne).toBe(2);
  expect(gitCalls.count - gitCalls.recording - gitCalls.logOne).toBeLessThanOrEqual(5);
  expect(gitCalls.count - gitCalls.recording - gitCalls.logOne).toBeGreaterThanOrEqual(3);
});

it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('records a refused work tree once, however many modules read it (REQ-LIB-070)', () => {
  const map = { modules: Array.from({ length: 20 }, (_, i) => ({ name: `m${i}`, paths: [`src/m${i}`], keywords: [] })) };
  for (let i = 0; i < 20; i++) write(`src/m${i}/a.ts`, `${i}`);
  write('junk.txt', 'unreadable\n');
  chmodSync(path.join(root, 'junk.txt'), 0o000);
  gitCalls.adds = 0;
  try {
    const digests = collectModuleDigests(root, map, {
      knowledgePath: path.join(root, 'prospec/ai-knowledge'),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
    });
    expect([...digests.values()].every((d) => d.digest === null)).toBe(true);
    expect(gitCalls.adds).toBe(1);
  } finally {
    chmodSync(path.join(root, 'junk.txt'), 0o644);
  }
});

it('records object ids only for changed files a module lists whose entry the index does not already hold (REQ-LIB-070)', async () => {
  write('prospec/ai-knowledge/module-map.yaml', 'modules:\n  - name: lib\n    paths: [src/lib]\n    keywords: []\n');
  write('src/lib/input.ts', 'export const value = 1;');
  execFileSync('git', ['add', 'src/lib/input.ts'], { cwd: root });
  write('docs/outside.md', 'not in any module\n');
  gitCalls.count = 0;
  gitCalls.recording = 0;
  gitCalls.updateIndex = 0;
  await assessCurrentDrift(root);
  expect(gitCalls.recording).toBe(3);
  expect(gitCalls.updateIndex).toBe(0);
});

it('spends a module-count-independent number of Git subprocesses on source digests (REQ-LIB-070)', () => {
  const spent = (modules: number, commit: boolean) => {
    const map = { modules: Array.from({ length: modules }, (_, i) => ({ name: `m${i}`, paths: [`src/m${i}`], keywords: [] })) };
    for (let i = 0; i < modules; i++) write(`src/m${i}/a.ts`, `${i}`);
    if (commit) {
      execFileSync('git', ['add', '.'], { cwd: root });
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'modules'], { cwd: root });
    }
    gitCalls.count = 0;
    collectModuleDigests(root, map, {
      knowledgePath: path.join(root, 'prospec/ai-knowledge'),
      specsPath: path.join(root, 'prospec/specs'),
      generatedArtifacts: [],
    });
    return gitCalls.count;
  };
  const uncommitted = [spent(2, false), spent(20, false)];
  expect(uncommitted[0]).toBe(uncommitted[1]);
  const committed = [spent(2, true), spent(20, true)];
  expect(committed[0]).toBe(committed[1]);
});

it('spends no Git subprocess beyond the work-tree recording on a handed-over inventory, for bookkeeping modules and subdirectory projects alike (REQ-LIB-070)', () => {
  const project = path.join(root, 'proj');
  mkdirSync(path.join(project, '.prospec/changes/c'), { recursive: true });
  writeFileSync(path.join(project, '.prospec/changes/c/proposal.md'), '# c\n');
  mkdirSync(path.join(project, 'src'), { recursive: true });
  writeFileSync(path.join(project, 'src/a.ts'), 'a\n');
  const { inventory } = computeEvidenceStates(project);
  expect([...inventory!.entries.keys()]).toContain('src/a.ts');
  gitCalls.count = 0;
  gitCalls.recording = 0;
  const digests = collectModuleDigests(project, {
    modules: [{ name: 'src', paths: ['src'], keywords: [] }, { name: 'bk', paths: ['.prospec'], keywords: [] }],
  }, {
    knowledgePath: path.join(project, 'prospec/ai-knowledge'),
    specsPath: path.join(project, 'prospec/specs'),
    generatedArtifacts: [],
    inventory,
  });
  expect(digests.get('src')?.digest).toMatch(/^source-v1:/);
  expect(digests.get('bk')?.digest).toBeNull();
  expect(gitCalls.recording).toBe(5);
  expect(gitCalls.count).toBe(5);
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

describe('assessCurrentTestEvidence — narrow target assessment with live recheck (REQ-LIB-080)', () => {
  const freshMetadata = (digest: string) =>
    'name: x\ncreated_at: today\nstatus: tasks\nscale: full\n' +
    `test_provenance:\n  fingerprint_version: snapshot-v2\n  scope: repository-inputs-v2\n  attempt_id: a1\n  command: node -e 0\n  exit_code: 0\n  digest: ${digest}\n  date: "2026-09-01"\n` +
    `test_attempt:\n  id: a1\n  outcome: passed\n  command: node -e 0\n  exit_code: 0\n  before_digest: ${digest}\n  after_digest: ${digest}\n`;
  const withCommand = `version: "1.0"\nproject:\n  name: t\ntech_stack:\n  test_command: ${process.execPath} -e 0\n`;

  it('certifies fresh green from live facts, rechecks true, and never spawns the suite or the full collector set', async () => {
    write('.prospec.yaml', withCommand);
    const digest = computeChangeState(root).digest!;
    write('.prospec/changes/x/metadata.yaml', freshMetadata(digest));
    gitCalls.count = 0; gitCalls.spawns = 0;
    const a = await assessCurrentTestEvidence(root, 'x');
    expect(a.decision).toEqual({ verdict: 'pass', attemptId: 'a1' });
    expect(a.facts.currentDigest).toBe(digest);
    expect(gitCalls.spawns).toBe(0);
    // the narrow snapshot only — the full assessment needs four to six subprocesses
    expect(gitCalls.count).toBeLessThanOrEqual(3);
    expect(a.recheck()).toBe(true);
    expect(gitCalls.spawns).toBe(0);
  });

  it.each([
    ['config', () => write('.prospec.yaml', withCommand + '# edited\n')],
    ['metadata (attempt)', () => write('.prospec/changes/x/metadata.yaml', freshMetadata(computeChangeState(root).digest!).replace('outcome: passed', 'outcome: running'))],
    ['backfill draft', () => write('.prospec/changes/x/backfill-draft.md', '# draft\n')],
    ['snapshot (source input)', () => write('src/new.ts', 'export const later = 1;\n')],
  ])('refuses a %s change observed after collection', async (_n, mutate) => {
    write('.prospec.yaml', withCommand);
    write('.prospec/changes/x/metadata.yaml', freshMetadata(computeChangeState(root).digest!));
    const a = await assessCurrentTestEvidence(root, 'x');
    expect(a.decision.verdict).toBe('pass');
    mutate();
    expect(a.recheck()).toBe(false);
  });

  it('refuses when the resolved command changes even though the config bytes are untouched (package.json test script appears)', async () => {
    write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: t\ntech_stack:\n  package_manager: pnpm\n');
    write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: today\nstatus: tasks\nscale: full\n');
    const a = await assessCurrentTestEvidence(root, 'x');
    expect(a.decision).toMatchObject({ verdict: 'exempt', exemption: 'no-command' });
    expect(a.recheck()).toBe(true);
    write('package.json', JSON.stringify({ scripts: { test: 'vitest' } }));
    expect(a.recheck()).toBe(false);
  });

  it('exempts a no-command project outside Git without demanding a snapshot, and still rechecks its metadata facts', async () => {
    rmSync(path.join(root, '.git'), { recursive: true, force: true });
    const a = await assessCurrentTestEvidence(root, 'x');
    expect(a.decision).toMatchObject({ verdict: 'exempt', exemption: 'no-command' });
    expect(a.facts.currentDigest).toBeNull();
    expect(a.recheck()).toBe(true);
    write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: today\nstatus: tasks\nscale: full\ndescription: edited\n');
    expect(a.recheck()).toBe(false);
  });

  it('refuses (F-1) when .prospec.yaml is rewritten between the bytes read and the config parse — the verdict never lands on a command the bytes do not prove', async () => {
    write('.prospec.yaml', withCommand);
    write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: today\nstatus: tasks\nscale: full\n');
    configRace.onFirstConfigRead = () => write('.prospec.yaml', 'version: "1.0"\nproject:\n  name: t\n');
    await expect(assessCurrentTestEvidence(root, 'x')).rejects.toThrow(/\.prospec\.yaml changed/);
  });

  it('refuses (throws) on unreadable target metadata or missing config rather than fabricating an exemption', async () => {
    write('.prospec/changes/x/metadata.yaml', 'name: [unclosed\n');
    await expect(assessCurrentTestEvidence(root, 'x')).rejects.toThrow();
    write('.prospec/changes/x/metadata.yaml', 'name: x\ncreated_at: today\nstatus: tasks\nscale: full\n');
    rmSync(path.join(root, '.prospec.yaml'));
    await expect(assessCurrentTestEvidence(root, 'x')).rejects.toThrow(/Config file/);
  });

  it('a sibling change with red evidence never enters the target facts', async () => {
    write('.prospec.yaml', withCommand);
    write('.prospec/changes/x/metadata.yaml', freshMetadata(computeChangeState(root).digest!));
    write('.prospec/changes/y/metadata.yaml', 'name: y\ncreated_at: today\nstatus: implemented\nscale: full\ntest_provenance:\n  command: node -e 1\n  exit_code: 1\n  digest: Z\n  date: "2026-09-01"\n');
    const a = await assessCurrentTestEvidence(root, 'x');
    expect(a.decision.verdict).toBe('pass');
    expect(JSON.stringify(a.facts)).not.toContain('"y"');
  });
});


describe('Knowledge-excluded assessment scope', () => {
  function baseline() {
    const command = `${process.execPath} -e 0`;
    write('.prospec.yaml', `project:\n  name: t\ntech_stack:\n  test_command: ${command}\ntest_evidence:\n  exclude_knowledge: true\n`);
    write('prospec/ai-knowledge/README.md', '# Knowledge before\n');
    const configBytes = readFileSync(path.join(root, '.prospec.yaml'));
    const config = validateConfig(configBytes.toString(), path.join(root, '.prospec.yaml'));
    const state = computeTestState(root, { config, configBytes, command: resolveTestCommand(config, root) });
    expect(state.digest).not.toBeNull();
    const identity = { fingerprint_version: state.identity.fingerprintVersion, scope: state.identity.scope, test_policy: state.identity.testPolicy };
    write('.prospec/changes/x/metadata.yaml', JSON.stringify({
      name: 'x', created_at: '2026-09-01', status: 'implemented', scale: 'full',
      test_attempt: { ...identity, id: 'original', date: '2026-09-01', outcome: 'passed', command, exit_code: 0, before_digest: state.digest, after_digest: state.digest },
      test_provenance: { ...identity, attempt_id: 'original', date: '2026-09-01', command, exit_code: 0, digest: state.digest },
    }));
    write('.prospec/changes/x/proposal.md', '# Proposal\n');
    write('.prospec/changes/x/delta-spec.md', '# Delta\n');
  }

  it('reuses tests through Knowledge edits while full report and grader context remain stale', async () => {
    baseline();
    const metadata = readFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'));
    const narrow = await assessCurrentTestEvidence(root, 'x');
    expect(narrow.decision).toMatchObject({ verdict: 'pass', reuse: { attempt_id: 'original' } });
    const full = await assessCurrentDrift(root);
    const context = assessVerificationContext(root, 'x');
    expect(context.context.test_attempt.status).toBe('passed');
    write('prospec/ai-knowledge/README.md', '# Knowledge after\n');
    expect(narrow.recheck()).toBe(true);
    expect(full.recheck()).toBe(false);
    expect(context.recheck()).toBe(false);
    const current = await assessCurrentDrift(root);
    expect(current.report.test_evidence?.x).toMatchObject({ attempt_id: 'original' });
    expect(current.snapshot.digest).not.toBe(full.snapshot.digest);
    const renewed = assessVerificationContext(root, 'x');
    expect(renewed.context.test_attempt.status).toBe('passed');
    expect(renewed.context.context_id).not.toBe(context.context.context_id);
    expect(renewed.recheck()).toBe(true);
    expect(readFileSync(path.join(root, '.prospec/changes/x/metadata.yaml'))).toEqual(metadata);
    write('src/new.ts', 'export const changed = true;');
    expect(narrow.recheck()).toBe(false);
    expect((await assessCurrentTestEvidence(root, 'x')).decision.verdict).toBe('refuse');
  });

  it('rechecks config bytes and refuses unsafe Knowledge policy without fabricating a no-command exemption', async () => {
    baseline();
    const narrow = await assessCurrentTestEvidence(root, 'x');
    const context = assessVerificationContext(root, 'x');
    const configPath = path.join(root, '.prospec.yaml');
    write('.prospec.yaml', readFileSync(configPath, 'utf8') + 'knowledge:\n  base_path: ../outside\n');
    expect(narrow.recheck()).toBe(false);
    expect(context.recheck()).toBe(false);
    const invalid = await assessCurrentTestEvidence(root, 'x');
    expect(invalid.facts.currentDigest).toBeNull();
    expect(invalid.facts.commandUnavailableReason).toBeNull();
    expect(invalid.decision.verdict).toBe('refuse');
    expect(assessVerificationContext(root, 'x').context.test_attempt.status).toBe('stale');
  });

  it('shares one Git inventory for opt-in full assessment', async () => {
    baseline();
    gitCalls.count = 0;
    await assessCurrentDrift(root);
    expect(gitCalls.count).toBeLessThanOrEqual(6);
  });
});
