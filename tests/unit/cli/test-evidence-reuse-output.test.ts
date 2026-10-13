import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTestGateWarning } from '../../../src/cli/formatters/test-gate-output.js';
import { formatCheckOutput } from '../../../src/cli/formatters/check-output.js';
import type { TestEvidenceReuse } from '../../../src/types/change.js';

const reuse: TestEvidenceReuse = { attempt_id: 'original', date: '2026-10-13', command: 'node test.cjs', exit_code: 0,
  test_policy: { version: 1, excluded_path: 'docs/knowledge' }, reason: 'compatible effective test inputs; Knowledge excluded by policy' };
afterEach(() => vi.restoreAllMocks());
describe('test reuse output', () => {
  it('renders original run facts on an admitted gate', () => {
    const output = formatTestGateWarning({ verdict: 'pass', warningRecorded: false, reuse });
    for (const value of ['original', '2026-10-13', 'node test.cjs', 'exit 0', 'docs/knowledge', reuse.reason]) expect(output).toContain(value);
    expect(formatTestGateWarning({ verdict: 'pass', warningRecorded: false })).toBeUndefined();
  });
  it('sanitizes every diagnostic string to one terminal line', () => {
    const attack = '\u001b]52;value\u0007\nforged\tline';
    const output = formatTestGateWarning({ verdict: 'pass', warningRecorded: false, reuse: {
      ...reuse, attempt_id: attack, date: attack, command: attack, reason: attack,
      test_policy: { version: 1, excluded_path: attack },
    } });
    expect(output).toBeDefined();
    for (const control of ['\u001b', '\u0007', '\n', '\t']) expect(output).not.toContain(control);
  });
  it('renders certified report payload and preserves quiet mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = { kind: 'report' as const, hasFail: false, report: { version: 1 as const, generated_at: 'now',
      test_evidence: { sample: reuse }, structural: { checks: [{ id: 'test-provenance' as const, status: 'pass' as const, subjects: ['sample'] }], findings: [] },
      semantic: { status: 'not-checked' as const }, summary: { fail_count: 0, warn_count: 0, skipped_count: 0 } } };
    formatCheckOutput(result, 'normal');
    expect(log.mock.calls.flat().join('\n')).toContain('original');
    log.mockClear(); formatCheckOutput(result, 'quiet'); expect(log).not.toHaveBeenCalled();
  });
});
