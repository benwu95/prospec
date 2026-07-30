import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeProgressOutput } from '../../../src/cli/formatters/change-progress-output.js';
import type { ChangeProgressResult } from '../../../src/services/change-progress.service.js';

// BEL (0x07) is a C0 control char that picocolors never emits (it only uses ESC
// for color), so asserting "no BEL in output" proves the injected control bytes
// were stripped without being confused by terminal-color escape sequences.
const BEL = String.fromCharCode(0x07);

afterEach(() => {
  vi.restoreAllMocks();
});

function captureStdout(fn: () => void): string {
  const writes: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  });
  fn();
  return writes.join('');
}

function baseResult(overrides: Partial<ChangeProgressResult> = {}): ChangeProgressResult {
  return {
    changeName: 'feat-x',
    alreadyChecked: false,
    progress: { checked: 3, total: 5 },
    uncheckedManual: [],
    uncheckedVerification: [],
    allCodeDone: false,
    ...overrides,
  };
}

describe('change-progress-output', () => {
  // `Progress X/Y` and `Next: ` are parse contracts quoted by
  // src/templates/skills/prospec-implement.hbs — their shape must stay stable.
  it('pins the `Progress X/Y` parse contract', () => {
    const out = captureStdout(() => formatChangeProgressOutput(baseResult(), 'normal'));
    expect(out).toContain('Progress 3/5');
  });

  it('pins the `Progress X/Y (Complete)` parse contract when all code tasks are done', () => {
    const out = captureStdout(() =>
      formatChangeProgressOutput(
        baseResult({ progress: { checked: 5, total: 5 }, allCodeDone: true }),
        'normal',
      ),
    );
    expect(out).toContain('Progress 5/5 (Complete)');
  });

  it('pins the `Next: ` prefix parse contract', () => {
    const out = captureStdout(() =>
      formatChangeProgressOutput(baseResult({ nextTask: 'Task 4: wire the command' }), 'normal'),
    );
    expect(out).toContain('Next: Task 4: wire the command');
  });

  it('prints completed task and unchecked [M]/[V] reminders', () => {
    const out = captureStdout(() =>
      formatChangeProgressOutput(
        baseResult({
          completedTask: 'Task 3: add formatter',
          uncheckedManual: ['confirm with user'],
          uncheckedVerification: ['run pnpm counts'],
        }),
        'normal',
      ),
    );
    expect(out).toContain('Completed: Task 3: add formatter');
    expect(out).toContain('Unchecked [M] reminders: 1');
    expect(out).toContain('confirm with user');
    expect(out).toContain('Unchecked [V] reminders: 1');
    expect(out).toContain('run pnpm counts');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatChangeProgressOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from tasks.md task text', () => {
    const out = captureStdout(() =>
      formatChangeProgressOutput(
        baseResult({
          completedTask: `done${BEL}task`,
          nextTask: `next${BEL}task`,
          uncheckedManual: [`manual${BEL}item`],
          uncheckedVerification: [`verify${BEL}item`],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('donetask');
    expect(out).toContain('Next: nexttask');
    expect(out).toContain('manualitem');
    expect(out).toContain('verifyitem');
  });
});
