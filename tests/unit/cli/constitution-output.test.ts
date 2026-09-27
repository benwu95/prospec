import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatConstitutionShowOutput } from '../../../src/cli/formatters/constitution-output.js';
import type { ConstitutionShowResult } from '../../../src/services/constitution-show.service.js';

/** REQ-CLI-058 — stdout is the text exactly as returned; every diagnostic is stderr. */

afterEach(() => {
  vi.restoreAllMocks();
});

function capture(fn: () => void): { stdout: string; stderr: string } {
  const out: string[] = [];
  const err: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    out.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    err.push(String(chunk));
    return true;
  });
  fn();
  return { stdout: out.join(''), stderr: err.join('') };
}

const tokens = { slice: 10, full: 20 };

describe('formatConstitutionShowOutput', () => {
  it('writes a slice without appending a newline and names the undeclared count on stderr', () => {
    const r: ConstitutionShowResult = {
      selector: 'station',
      station: 'plan',
      path: 'prospec/CONSTITUTION.md',
      tokens,
      result: { kind: 'sliced', text: 'slice text', matched: [], undeclared: ['A', 'B'], excluded: ['C'] },
    };
    const { stdout, stderr } = capture(() => formatConstitutionShowOutput(r));
    expect(stdout).toBe('slice text');
    const lines = stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('included 2 undeclared rule(s)');
    expect(lines[0]).toContain('stations:');
    expect(lines[1]).toBe('tokens: slice 10 / full 20 (estimateTokens)');
  });

  it('writes the full bytes on fail-open with exactly one WARN line naming the reason', () => {
    const full = '# C\n\n## Constraints\n';
    const r: ConstitutionShowResult = {
      selector: 'station',
      station: 'review',
      path: 'prospec/CONSTITUTION.md',
      tokens: { slice: 5, full: 5 },
      result: { kind: 'full', reason: 'no-declarations', text: full },
    };
    const { stdout, stderr } = capture(() => formatConstitutionShowOutput(r));
    expect(stdout).toBe(full);
    const lines = stderr.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('WARN');
    expect(lines[0]).toContain('no-declarations');
    expect(lines[1]).toBe('tokens: full 5');
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('strips terminal control bytes from the text, as every formatter does', () => {
    const r: ConstitutionShowResult = {
      selector: 'rule',
      path: 'prospec/CONSTITUTION.md',
      tokens,
      text: `rule\u0007 text\r\n`,
      rules: [{ name: 'R', check_id: null, coverage: null }],
    };
    const { stdout, stderr } = capture(() => formatConstitutionShowOutput(r));
    expect(stdout).toBe('rule text\n');
    expect(stderr).toBe('');
  });

  it('discloses a duplicated rule name on stderr', () => {
    const r: ConstitutionShowResult = {
      selector: 'rule',
      path: 'prospec/CONSTITUTION.md',
      tokens,
      text: 'a\nb',
      rules: [
        { name: 'Same', check_id: null, coverage: null },
        { name: 'Same', check_id: null, coverage: null },
      ],
    };
    const { stderr } = capture(() => formatConstitutionShowOutput(r));
    expect(stderr).toContain('2 rules');
    expect(stderr).toContain('Same');
  });
});
