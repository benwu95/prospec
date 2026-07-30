import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeStatusOutput } from '../../../src/cli/formatters/change-status-output.js';

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

describe('change-status-output', () => {
  it('prints the transition on a real write', () => {
    const out = captureStdout(() =>
      formatChangeStatusOutput(
        { changeName: 'feat-x', from: 'tasks', to: 'implemented', changed: true },
        'normal',
      ),
    );
    expect(out).toContain('feat-x: status tasks → implemented');
  });

  it('prints the idempotent no-op', () => {
    const out = captureStdout(() =>
      formatChangeStatusOutput(
        { changeName: 'feat-x', from: 'implemented', to: 'implemented', changed: false },
        'normal',
      ),
    );
    expect(out).toContain('feat-x is already at implemented — no change');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() =>
      formatChangeStatusOutput(
        { changeName: 'feat-x', from: 'tasks', to: 'implemented', changed: true },
        'quiet',
      ),
    );
    expect(out).toBe('');
  });

  it('strips control characters from the change name in both branches', () => {
    const changed = captureStdout(() =>
      formatChangeStatusOutput(
        { changeName: `evil${BEL}change`, from: 'tasks', to: 'implemented', changed: true },
        'normal',
      ),
    );
    const noop = captureStdout(() =>
      formatChangeStatusOutput(
        { changeName: `evil${BEL}change`, from: 'implemented', to: 'implemented', changed: false },
        'normal',
      ),
    );
    expect(changed.includes(BEL)).toBe(false);
    expect(noop.includes(BEL)).toBe(false);
    expect(changed).toContain('evilchange');
    expect(noop).toContain('evilchange');
  });
});
