import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeScaleOutput } from '../../../src/cli/formatters/change-scale-output.js';
import type { ChangeScaleResult } from '../../../src/services/change-scale.service.js';

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

describe('change-scale-output', () => {
  it('prints the transition on a real write', () => {
    const out = captureStdout(() =>
      formatChangeScaleOutput(
        { changeName: 'feat-x', from: 'standard', scale: 'quick', changed: true },
        'normal',
      ),
    );
    expect(out).toContain('feat-x: scale standard → quick');
  });

  it('prints the idempotent no-op', () => {
    const out = captureStdout(() =>
      formatChangeScaleOutput(
        { changeName: 'feat-x', from: 'quick', scale: 'quick', changed: false },
        'normal',
      ),
    );
    expect(out).toContain('feat-x is already scale quick — no change');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() =>
      formatChangeScaleOutput(
        { changeName: 'feat-x', scale: 'quick', changed: true },
        'quiet',
      ),
    );
    expect(out).toBe('');
  });

  it('strips control characters from the change name in both branches', () => {
    const changed = captureStdout(() =>
      formatChangeScaleOutput(
        { changeName: `evil${BEL}change`, scale: 'quick', changed: true } as ChangeScaleResult,
        'normal',
      ),
    );
    const noop = captureStdout(() =>
      formatChangeScaleOutput(
        { changeName: `evil${BEL}change`, from: 'quick', scale: 'quick', changed: false },
        'normal',
      ),
    );
    expect(changed.includes(BEL)).toBe(false);
    expect(noop.includes(BEL)).toBe(false);
    expect(changed).toContain('evilchange');
    expect(noop).toContain('evilchange');
  });
});
