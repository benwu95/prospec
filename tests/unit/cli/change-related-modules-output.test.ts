import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatChangeRelatedModulesOutput } from '../../../src/cli/formatters/change-related-modules-output.js';

// BEL is a C0 control char picocolors never emits, so its absence proves the
// injected control bytes were stripped rather than confused with color escapes.
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

describe('change-related-modules-output (REQ-CLI-060)', () => {
  it('prints the list before and after a real write', () => {
    const out = captureStdout(() =>
      formatChangeRelatedModulesOutput(
        { changeName: 'feat-x', from: ['lib', 'ghost'], modules: ['lib', 'services'], changed: true },
        'normal',
      ),
    );
    expect(out).toContain('feat-x: related_modules [lib, ghost] → [lib, services]');
  });

  it('prints the idempotent no-op', () => {
    const out = captureStdout(() =>
      formatChangeRelatedModulesOutput(
        { changeName: 'feat-x', from: ['lib'], modules: ['lib'], changed: false },
        'normal',
      ),
    );
    expect(out).toContain('feat-x already has related_modules [lib] — no change');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() =>
      formatChangeRelatedModulesOutput({ changeName: 'feat-x', from: [], modules: ['lib'], changed: true }, 'quiet'),
    );
    expect(out).toBe('');
  });

  it('strips control characters from the change and module names', () => {
    const out = captureStdout(() =>
      formatChangeRelatedModulesOutput(
        { changeName: `evil${BEL}change`, from: [`gh${BEL}ost`], modules: ['lib'], changed: true },
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilchange');
    expect(out).toContain('ghost');
  });
});
