import { describe, it, expect, vi, beforeEach } from 'vitest';
import { vol } from 'memfs';
import { execute } from '../../../src/services/change-progress.service.js';
import { PrerequisiteError } from '../../../src/types/errors.js';

vi.mock('node:fs', async () => {
  const memfs = await import('memfs');
  return { ...memfs.fs, default: memfs.fs };
});

beforeEach(() => {
  vol.reset();
});

const CWD = '/repo';
const PATH = '/repo/.prospec/changes/add-widget/tasks.md';

const TASKS = `# Tasks: add-widget

## Types

- [x] T1 define the widget schema ~20 lines
- [ ] T2 [P] widen the config type ~10 lines

## Services

- [ ] T3 implement widget.service ~50 lines
- [ ] T4 [M] run \`prospec agent sync\` ~5 lines
- [ ] T5 [V] mutation-verify the new assertions ~10 lines
`;

function seed(content: string = TASKS): void {
  vol.fromJSON({ [PATH]: content });
}

describe('change-progress service', () => {
  it('reports code-task progress with [M]/[V] excluded from the denominator', async () => {
    seed();
    const result = await execute({ cwd: CWD });
    expect(result.progress).toEqual({ checked: 1, total: 3 });
    expect(result.nextTask).toBe('T2 [P] widen the config type ~10 lines');
    expect(result.uncheckedManual).toEqual(['T4 [M] run `prospec agent sync` ~5 lines']);
    expect(result.uncheckedVerification).toEqual([
      'T5 [V] mutation-verify the new assertions ~10 lines',
    ]);
    expect(result.allCodeDone).toBe(false);
  });

  it('flips exactly the named task by its leading ID token', async () => {
    seed();
    const result = await execute({ cwd: CWD, complete: 'T2' });
    expect(result.completedTask).toBe('T2 [P] widen the config type ~10 lines');
    expect(result.progress).toEqual({ checked: 2, total: 3 });
    const written = vol.readFileSync(PATH, 'utf-8') as string;
    expect(written).toContain('- [x] T2 [P] widen the config type ~10 lines');
    expect(written).toContain('- [ ] T3 implement widget.service ~50 lines');
  });

  it('falls back to a 1-based ordinal over all tasks when no ID token matches', async () => {
    seed(TASKS.replace(/T\d+ /g, ''));
    const result = await execute({ cwd: CWD, complete: '2' });
    expect(result.completedTask).toBe('[P] widen the config type ~10 lines');
  });

  it('is a no-op on an already-checked task', async () => {
    seed();
    const before = vol.readFileSync(PATH, 'utf-8');
    const result = await execute({ cwd: CWD, complete: 'T1' });
    expect(result.alreadyChecked).toBe(true);
    expect(result.completedTask).toBeUndefined();
    expect(vol.readFileSync(PATH, 'utf-8')).toBe(before);
  });

  it('reports (Complete) semantics when the last code task flips', async () => {
    seed(TASKS.replace('- [ ] T2', '- [x] T2'));
    const result = await execute({ cwd: CWD, complete: 'T3' });
    expect(result.allCodeDone).toBe(true);
    expect(result.progress).toEqual({ checked: 3, total: 3 });
    expect(result.nextTask).toBeUndefined();
  });

  it('rejects an unknown task selector and a missing tasks.md with guidance', async () => {
    seed();
    await expect(execute({ cwd: CWD, complete: 'T99' })).rejects.toThrow(PrerequisiteError);
    vol.reset();
    vol.fromJSON({ '/repo/.prospec/changes/add-widget/metadata.yaml': 'name: add-widget\n' });
    await expect(execute({ cwd: CWD })).rejects.toThrow(PrerequisiteError);
    await expect(execute({ cwd: CWD })).rejects.toThrow(/tasks\.md not found/);
    await expect(execute({ cwd: CWD })).rejects.toMatchObject({
      suggestion: expect.stringContaining('prospec change tasks'),
    });
  });

  // REQ-SERVICES-076: the suggestion must not send a scale with no task list to a
  // station that refuses it.
  it('does not point a backfill change at the tasks station', async () => {
    vol.fromJSON({
      '/repo/.prospec/changes/add-widget/metadata.yaml': `name: add-widget
created_at: "2026-01-01T00:00:00.000Z"
status: implemented
related_modules: []
description: backfill
scale: backfill
`,
    });

    await expect(execute({ cwd: CWD })).rejects.toThrow(PrerequisiteError);
    await expect(execute({ cwd: CWD })).rejects.toMatchObject({
      suggestion: expect.stringContaining('no task list by contract'),
    });
    // Negative: the station that would refuse this scale must NOT be suggested.
    await expect(execute({ cwd: CWD })).rejects.not.toMatchObject({
      suggestion: expect.stringContaining('prospec change tasks'),
    });
  });

  it('keeps the default guidance when metadata.yaml is unreadable', async () => {
    vol.fromJSON({ '/repo/.prospec/changes/add-widget/metadata.yaml': 'status: [not-a-status\n' });

    await expect(execute({ cwd: CWD })).rejects.toMatchObject({
      suggestion: expect.stringContaining('prospec change tasks'),
    });
  });
});
