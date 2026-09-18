import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  execute,
  STATION_SETTABLE_STATUSES,
} from '../../../src/services/change-status.service.js';
import { InvalidTransitionError, PrerequisiteError, TestGateError } from '../../../src/types/errors.js';
import { TEST_GATE_NOT_ADJUDICATED, TEST_GATE_PRODUCER } from '../../../src/types/station.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

// memfs is invisible to git, so the whole-tree snapshot is injected: the gate's
// freshness rule is what these tests pin, not Git's capture.
const snapshot = vi.hoisted(() => ({ digest: 'D' as string | null, calls: 0, sequence: [] as Array<string | null> }));
vi.mock('../../../src/lib/drift-sources.js', async (original) => {
  const actual = await original<typeof import('../../../src/lib/drift-sources.js')>();
  return {
    ...actual,
    computeChangeState: () => {
      snapshot.calls++;
      if (snapshot.sequence.length > 1) snapshot.digest = snapshot.sequence.shift()!;
      else if (snapshot.sequence.length === 1) snapshot.digest = snapshot.sequence[0]!;
      return snapshot.digest === null
        ? { digest: null, clean: null, reason: 'not a git repository' }
        : { digest: snapshot.digest, clean: true };
    },
  };
});

beforeEach(() => {
  vol.reset();
  snapshot.digest = 'D';
  snapshot.calls = 0;
  snapshot.sequence = [];
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';
const CONFIG = '/repo/.prospec.yaml';
const WITH_COMMAND = 'version: "1.0"\nproject:\n  name: t\ntech_stack:\n  test_command: node -e 0\n';
const NO_COMMAND = 'version: "1.0"\nproject:\n  name: t\n';

/** A certified fresh green record against snapshot digest `D`. */
const FRESH_GREEN = `test_provenance:
  fingerprint_version: snapshot-v2
  scope: repository-inputs-v2
  attempt_id: a1
  command: node -e 0
  exit_code: 0
  digest: D
  date: "2026-09-01"
test_attempt:
  id: a1
  outcome: passed
  command: node -e 0
  exit_code: 0
  before_digest: D
  after_digest: D
`;

function seed(status: string, evidence: string = FRESH_GREEN, config: string = WITH_COMMAND): void {
  vol.fromJSON({
    [CONFIG]: config,
    [PATH]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
# station note
status: ${status}
scale: standard
${evidence}`,
  });
}

describe('change-status service', () => {
  it('advances forward and preserves comments', async () => {
    seed('tasks');
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result).toMatchObject({ from: 'tasks', to: 'implemented', changed: true });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('status: implemented');
    expect(written).toContain('# station note');
  });

  it('allows the quick-path jump (tasks is reachable from story)', async () => {
    seed('story');
    const result = await execute({ cwd: CWD, to: 'tasks' });
    expect(result.changed).toBe(true);
  });

  it('is idempotent when already at the target', async () => {
    seed('implemented');
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(false);
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: implemented');
  });

  it('rejects a backward transition, listing legal forward targets, file untouched', async () => {
    seed('plan');
    let caught: unknown;
    try {
      await execute({ cwd: CWD, to: 'story' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    // gate-owned statuses (verified/archived) never appear in the suggestion
    expect((caught as InvalidTransitionError).suggestion).toBe(
      'Valid transitions from plan: tasks, implemented',
    );
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: plan');
  });

  it('refuses gate-owned targets — verified/archived are minted by verify record / archive only', async () => {
    seed('tasks');
    for (const gateOwned of ['verified', 'archived'] as const) {
      let caught: unknown;
      try {
        await execute({ cwd: CWD, to: gateOwned });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PrerequisiteError);
      expect((caught as PrerequisiteError).message).toContain('gate-owned');
    }
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: tasks');
    expect(STATION_SETTABLE_STATUSES).toEqual(['story', 'plan', 'tasks', 'implemented']);
  });

  it('backward-transition suggestions never list gate-owned targets', async () => {
    seed('implemented');
    let caught: unknown;
    try {
      await execute({ cwd: CWD, to: 'plan' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(InvalidTransitionError);
    const suggestion = (caught as InvalidTransitionError).suggestion;
    expect(suggestion).not.toContain('verified');
    expect(suggestion).not.toContain('archived');
    expect(suggestion).toContain('minted by their own gates');
  });
});

describe('change-scale service', () => {
  it('writes the confirmed scale in place, preserving comments, and is idempotent', async () => {
    seed('story');
    const { execute: scaleExecute } = await import('../../../src/services/change-scale.service.js');
    const first = await scaleExecute({ cwd: CWD, scale: 'full' });
    expect(first).toMatchObject({ scale: 'full', changed: true });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('scale: full');
    expect(written).toContain('# station note');

    const second = await scaleExecute({ cwd: CWD, scale: 'full' });
    expect(second.changed).toBe(false);
  });

  // REQ-SERVICES-076: a scale whose contract forbids an artifact already on disk
  // would be invalid the moment it is written — `validate promote-scaffold` would
  // FAIL and `prospec status` would route the change at a station that must refuse
  // it. The guard reads the same registry the stations refuse from.
  it.each([
    ['backfill', 'plan.md'],
    ['backfill', 'tasks.md'],
    ['quick', 'plan.md'],
    ['quick', 'delta-spec.md'],
  ])('refuses %s while %s exists, leaving metadata byte-identical', async (scale, artifact) => {
    seed('story');
    vol.writeFileSync(`/repo/.prospec/changes/add-widget/${artifact}`, '# stray\n');
    const before = vol.readFileSync(PATH, 'utf-8') as string;
    const { execute: scaleExecute } = await import('../../../src/services/change-scale.service.js');

    await expect(scaleExecute({ cwd: CWD, scale: scale as 'quick' })).rejects.toThrow(
      PrerequisiteError,
    );
    await expect(scaleExecute({ cwd: CWD, scale: scale as 'quick' })).rejects.toThrow(
      new RegExp(`forbids .*${artifact.replace('.', '\\.')}`),
    );
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(before);
  });

  it('names both conflicting artifacts at once', async () => {
    seed('story');
    vol.writeFileSync('/repo/.prospec/changes/add-widget/plan.md', '# p\n');
    vol.writeFileSync('/repo/.prospec/changes/add-widget/tasks.md', '# t\n');
    const { execute: scaleExecute } = await import('../../../src/services/change-scale.service.js');

    await expect(scaleExecute({ cwd: CWD, scale: 'backfill' })).rejects.toThrow(
      /plan\.md and tasks\.md/,
    );
  });

  it('allows a scale whose forbidden set is absent from disk', async () => {
    seed('story');
    vol.writeFileSync('/repo/.prospec/changes/add-widget/proposal.md', '# p\n');
    const { execute: scaleExecute } = await import('../../../src/services/change-scale.service.js');

    // quick forbids plan.md/delta-spec.md — neither exists, so proposal.md alone
    // must not block the write.
    await expect(scaleExecute({ cwd: CWD, scale: 'quick' })).resolves.toMatchObject({
      scale: 'quick',
      changed: true,
    });
  });
});

describe('change-status Gate C — implemented requires all code tasks checked', () => {
  const DIR = '/repo/.prospec/changes/add-widget';
  function seedWithTasks(opts: { scale?: string; status?: string; tasks?: string; evidence?: string; draft?: boolean }): void {
    const files: Record<string, string> = {
      [CONFIG]: WITH_COMMAND,
      [PATH]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: ${opts.status ?? 'tasks'}
scale: ${opts.scale ?? 'standard'}
${opts.evidence ?? FRESH_GREEN}`,
    };
    if (opts.tasks !== undefined) files[`${DIR}/tasks.md`] = opts.tasks;
    if (opts.draft) files[`${DIR}/backfill-draft.md`] = '# draft\n';
    vol.fromJSON(files);
  }

  it('refuses when a code task is unchecked, naming checked/total and the next task', async () => {
    seedWithTasks({ tasks: '- [x] T1 first ~5 lines\n- [ ] T2 second ~5 lines\n' });
    let caught: unknown;
    try {
      await execute({ cwd: CWD, to: 'implemented' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PrerequisiteError);
    expect((caught as PrerequisiteError).message).toMatch(/1\/2 code tasks/);
    expect((caught as PrerequisiteError).suggestion).toContain('T2 second');
    // refuse-before-write
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: tasks');
  });

  it('proceeds when every code task is checked', async () => {
    seedWithTasks({ tasks: '- [x] T1 first ~5 lines\n- [x] T2 second ~5 lines\n' });
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(true);
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: implemented');
  });

  it('ignores [M]/[V] tasks in the completion denominator', async () => {
    seedWithTasks({ tasks: '- [x] T1 code ~5 lines\n- [ ] T2 [M] run a command ~1 lines\n- [ ] T3 [V] verify ~1 lines\n' });
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(true);
  });

  it('exempts a backfill from the code-task check (no tasks.md by contract) — the test gate still applies', async () => {
    seedWithTasks({ scale: 'backfill', status: 'story' });
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(true);
    // same shape, proven draft but no evidence: exempt with a WARN, not a silent pass
    vol.reset();
    seedWithTasks({ scale: 'backfill', status: 'story', evidence: '', draft: true });
    const exempt = await execute({ cwd: CWD, to: 'implemented' });
    expect(exempt.testGate).toMatchObject({ verdict: 'exempt', exemption: 'proven-backfill' });
    // unproven backfill (scale alone) with no evidence: refused
    vol.reset();
    seedWithTasks({ scale: 'backfill', status: 'story', evidence: '' });
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toBeInstanceOf(TestGateError);
  });

  it('applies to quick (which does have a tasks.md)', async () => {
    seedWithTasks({ scale: 'quick', tasks: '- [ ] T1 code ~5 lines\n' });
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(PrerequisiteError);
  });

  it('does not gate a non-implemented transition', async () => {
    seedWithTasks({ status: 'plan', tasks: '- [ ] T1 code ~5 lines\n' });
    const result = await execute({ cwd: CWD, to: 'tasks' });
    expect(result.changed).toBe(true);
  });

  // F-1 regression pin: a tasks.md with ONLY [M]/[V] tasks (zero code tasks) is
  // vacuously complete — the gate must not deadlock it at "0/0 code tasks".
  it('treats zero code tasks (only [M]/[V]) as vacuously complete', async () => {
    seedWithTasks({ tasks: '- [ ] T1 [M] run migration ~1 lines\n- [ ] T2 [V] confirm ~1 lines\n' });
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(true);
    expect(vol.readFileSync(PATH, 'utf-8')).toContain('status: implemented');
  });
});

describe('change-status test gate — implemented requires fresh green evidence (REQ-SERVICES-103, REQ-LIB-080)', () => {
  const read = () => vol.readFileSync(PATH, 'utf-8') as string;

  it('passes with a fresh certified green attempt and reports the verdict without a WARN entry', async () => {
    seed('tasks');
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result).toMatchObject({ changed: true, testGate: { verdict: 'pass' } });
    expect(read()).toContain('status: implemented');
    expect(read()).not.toContain(TEST_GATE_PRODUCER);
  });

  const refusals: Array<[string, string | undefined, RegExp]> = [
    ['no attempt recorded', '', /no test run recorded/],
    ['stale digest', FRESH_GREEN.replaceAll('digest: D', 'digest: OLD'), /stale test run/],
    ['latest attempt failed (exit 1)', FRESH_GREEN.replace('outcome: passed', 'outcome: failed').replace('exit_code: 0\n  before', 'exit_code: 1\n  before'), /failing test attempt/],
    ['durable non-zero provenance', FRESH_GREEN.replace('exit_code: 0\n  digest', 'exit_code: 1\n  digest'), /exited 1/],
    ['attempt still running', FRESH_GREEN.replace('outcome: passed', 'outcome: running'), /uncertified test attempt \(running\)/],
  ];
  it.each(refusals)('refuses %s with the target-scoped remediation and leaves metadata byte-identical', async (_n, evidence, reason) => {
    seed('tasks', evidence);
    const before = read();
    let caught: unknown;
    try {
      await execute({ cwd: CWD, to: 'implemented' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TestGateError);
    const err = caught as TestGateError;
    expect(err.entrance).toBe('implemented');
    expect(err.reason).toMatch(reason);
    expect(err.suggestion).toContain('prospec check --record-tests --change add-widget');
    expect(read()).toBe(before);
  });

  it('refuses an unprovable current snapshot even with a matching record', async () => {
    seed('tasks');
    snapshot.digest = null;
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(/stale test run|unprovable/);
    expect(read()).toContain('status: tasks');
  });

  it('an older PASS record never masks a newer failed attempt', async () => {
    seed('tasks', FRESH_GREEN.replace(/test_attempt:[\s\S]*$/, 'test_attempt:\n  id: a2\n  outcome: failed\n  command: node -e 1\n  exit_code: 1\n'));
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(/failing test attempt/);
  });

  it('applies independently of tasks.md: all code tasks checked cannot bypass missing evidence, nor can a missing tasks.md', async () => {
    seed('tasks', '');
    vol.writeFileSync('/repo/.prospec/changes/add-widget/tasks.md', '- [x] T1 done ~1 lines\n');
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toBeInstanceOf(TestGateError);
    vol.unlinkSync('/repo/.prospec/changes/add-widget/tasks.md');
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toBeInstanceOf(TestGateError);
  });

  it('a no-command project (non-Git) is exempt: status and the deduplicated WARN land in ONE write under the test-gate producer', async () => {
    seed('tasks', '', NO_COMMAND);
    snapshot.digest = null;
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.testGate).toMatchObject({ verdict: 'exempt', exemption: 'no-command', warningRecorded: true });
    const written = read();
    expect(written).toContain('status: implemented');
    expect(written).toContain('# station note');
    expect(written).toContain(`skill: ${TEST_GATE_PRODUCER}`);
    expect(written).toContain(TEST_GATE_NOT_ADJUDICATED);
    expect(written).toContain('(implemented)');
    expect(written).not.toContain('skill: prospec-review');
    expect((written.match(/result: WARN/g) ?? []).length).toBe(1);
  });

  it('a known non-zero failure is refused even when the command no longer resolves', async () => {
    seed('tasks', FRESH_GREEN.replace('exit_code: 0\n  digest', 'exit_code: 1\n  digest'), NO_COMMAND);
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(/exited 1/);
  });

  it('does not re-certify or re-warn on the idempotent no-op', async () => {
    seed('implemented', '', NO_COMMAND);
    const before = read();
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(false);
    expect(result.testGate).toBeUndefined();
    expect(read()).toBe(before);
  });

  it('refuses when the evidence changes between assessment and write (pre-write fence)', async () => {
    seed('tasks');
    // The snapshot moves under the gate after its first observation.
    snapshot.sequence = ['D', 'MOVED'];
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(/changed before the write/);
    expect(read()).toContain('status: tasks');
  });

  it('refuses (never exempts) when .prospec.yaml is missing — an I/O failure is not a no-command fact', async () => {
    seed('tasks', '');
    vol.unlinkSync(CONFIG);
    await expect(execute({ cwd: CWD, to: 'implemented' })).rejects.toThrow(/Config file/);
    expect(read()).toContain('status: tasks');
  });

  it('does not gate a transition that is not into implemented', async () => {
    seed('story', '');
    const result = await execute({ cwd: CWD, to: 'tasks' });
    expect(result.changed).toBe(true);
    expect(result.testGate).toBeUndefined();
    expect(snapshot.calls).toBe(0);
  });
});
