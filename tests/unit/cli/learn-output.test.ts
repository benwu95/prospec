import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLearnUpsertOutput } from '../../../src/cli/formatters/learn-output.js';
import type { LearnUpsertResult } from '../../../src/services/learn.service.js';

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

function baseResult(overrides: Partial<LearnUpsertResult> = {}): LearnUpsertResult {
  return {
    ledgerPath: 'prospec/ai-knowledge/_lessons-ledger.md',
    action: 'created',
    warnings: [],
    suggestions: [],
    expiredPlaybook: [],
    ...overrides,
  };
}

describe('learn-output', () => {
  it('prints the upsert action, suggestions, and TTL expiry list', () => {
    const out = captureStdout(() =>
      formatLearnUpsertOutput(
        baseResult({
          warnings: ['kind mismatch for existing key'],
          suggestions: [{ key: 'lesson-a', detail: 'freq=3 modules=2' }],
          expiredPlaybook: [{ entry: 'PB-001', reviewBy: '2026-01-01' }],
        }),
        'normal',
      ),
    );
    expect(out).toContain('Ledger created: prospec/ai-knowledge/_lessons-ledger.md');
    expect(out).toContain('kind mismatch for existing key');
    expect(out).toContain('lesson-a: freq=3 modules=2');
    expect(out).toContain('PB-001 (review by 2026-01-01)');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatLearnUpsertOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from lesson keys, warnings, and playbook headings', () => {
    const out = captureStdout(() =>
      formatLearnUpsertOutput(
        baseResult({
          ledgerPath: `led${BEL}ger.md`,
          warnings: [`kind mismatch: evil${BEL}key`],
          suggestions: [{ key: `sugg${BEL}key`, detail: `det${BEL}ail` }],
          expiredPlaybook: [{ entry: `head${BEL}ing`, reviewBy: `2026${BEL}-01-01` }],
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('ledger.md');
    expect(out).toContain('kind mismatch: evilkey');
    expect(out).toContain('suggkey: detail');
    expect(out).toContain('heading (review by 2026-01-01)');
  });
});
