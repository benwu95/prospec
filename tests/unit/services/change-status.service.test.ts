import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import {
  execute,
  STATION_SETTABLE_STATUSES,
} from '../../../src/services/change-status.service.js';
import { InvalidTransitionError, PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/metadata.yaml';

function seed(status: string): void {
  vol.fromJSON({
    [PATH]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
# station note
status: ${status}
scale: standard
`,
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
  function seedWithTasks(opts: { scale?: string; status?: string; tasks?: string }): void {
    const files: Record<string, string> = {
      [PATH]: `name: add-widget
created_at: 2026-07-13T09:51:00.000Z
status: ${opts.status ?? 'tasks'}
scale: ${opts.scale ?? 'standard'}
`,
    };
    if (opts.tasks !== undefined) files[`${DIR}/tasks.md`] = opts.tasks;
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

  it('exempts a backfill (no tasks.md by contract)', async () => {
    seedWithTasks({ scale: 'backfill', status: 'story' });
    const result = await execute({ cwd: CWD, to: 'implemented' });
    expect(result.changed).toBe(true);
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
