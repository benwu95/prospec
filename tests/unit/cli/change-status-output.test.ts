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

describe('change-status-output — test gate outcome (REQ-CLI-043, REQ-SERVICES-103)', () => {
  const base = { changeName: 'feat-x', from: 'tasks', to: 'implemented', changed: true } as const;

  it('keeps the plain success digest byte-identical when the gate passed', () => {
    const before = captureStdout(() => formatChangeStatusOutput({ ...base }, 'normal'));
    const after = captureStdout(() => formatChangeStatusOutput({ ...base, testGate: { verdict: 'pass', warningRecorded: false } }, 'normal'));
    expect(after).toBe(before);
    expect(after).not.toContain('not-adjudicated');
  });

  it('prints the WARN with the exemption, its actual reason and whether it was recorded', () => {
    const recorded = captureStdout(() =>
      formatChangeStatusOutput({ ...base, testGate: { verdict: 'exempt', exemption: 'no-command', reason: 'test command unavailable: no test command configured', warningRecorded: true } }, 'normal'),
    );
    expect(recorded).toContain('feat-x: status tasks → implemented');
    expect(recorded).toContain('tests: not-adjudicated (no-command): test command unavailable: no test command configured');
    expect(recorded).toContain('recorded in quality_log');
    const replay = captureStdout(() =>
      formatChangeStatusOutput({ ...base, testGate: { verdict: 'exempt', exemption: 'proven-backfill', reason: 'r', warningRecorded: false } }, 'normal'),
    );
    expect(replay).toContain('(proven-backfill)');
    expect(replay).toContain('already recorded');
  });

  it('strips control characters from the file-derived reason and prints nothing in quiet mode', () => {
    const out = captureStdout(() =>
      formatChangeStatusOutput({ ...base, testGate: { verdict: 'exempt', exemption: 'no-command', reason: `evil${BEL}reason`, warningRecorded: true } }, 'normal'),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilreason');
    expect(captureStdout(() => formatChangeStatusOutput({ ...base, testGate: { verdict: 'exempt', exemption: 'no-command', reason: 'r', warningRecorded: true } }, 'quiet'))).toBe('');
  });
});
