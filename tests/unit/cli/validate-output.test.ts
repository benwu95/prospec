import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatValidateOutput } from '../../../src/cli/formatters/validate-output.js';
import type { ValidateResult } from '../../../src/services/validate.service.js';

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

function baseResult(overrides: Partial<ValidateResult> = {}): ValidateResult {
  return {
    kind: 'slug',
    target: 'user-profile',
    ok: true,
    findings: [],
    ...overrides,
  };
}

describe('validate-output', () => {
  it('prints the verdict line with kind and target', () => {
    const out = captureStdout(() => formatValidateOutput(baseResult(), 'normal'));
    expect(out).toContain('validate slug user-profile: PASS');
  });

  it('prints FAIL findings and NC marker locations', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'backfill-draft',
          target: '.prospec/changes/x/backfill-draft.md',
          ok: false,
          findings: [{ level: 'FAIL', message: 'missing Feature header' }],
          facts: {
            featureHeaderCount: 0,
            storyHeaderCount: 1,
            ncMarkers: [{ line: 12, text: '[NEEDS CLARIFICATION] why retries?' }],
          },
        }),
        'normal',
      ),
    );
    expect(out).toContain('FAIL');
    expect(out).toContain('missing Feature header');
    expect(out).toContain('L12: [NEEDS CLARIFICATION] why retries?');
  });

  it('prints a module README target and source-anchored format finding on one existing result surface', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'module-readme',
          target: 'services',
          ok: false,
          findings: [{ level: 'FAIL', message: 'line 14: required Core heading missing: ## Pitfalls' }],
        }),
        'normal',
      ),
    );

    expect(out).toContain('validate module-readme services: FAIL');
    expect(out).toContain('line 14: required Core heading missing: ## Pitfalls');
  });

  it('prints nothing in quiet mode', () => {
    const out = captureStdout(() => formatValidateOutput(baseResult(), 'quiet'));
    expect(out).toBe('');
  });

  it('strips control characters from target, finding messages, and NC marker text', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'backfill-draft',
          target: `evil${BEL}slug`,
          ok: false,
          findings: [{ level: 'FAIL', message: `bad${BEL}finding` }],
          facts: {
            featureHeaderCount: 1,
            storyHeaderCount: 1,
            ncMarkers: [{ line: 3, text: `raw${BEL}artifact line` }],
          },
        }),
        'normal',
      ),
    );
    expect(out.includes(BEL)).toBe(false);
    expect(out).toContain('evilslug');
    expect(out).toContain('badfinding');
    expect(out).toContain('rawartifact line');
  });
});

describe('validate-output — candidate metrics table (REQ-CLI-056)', () => {
  it('prints the columns in order, one row per candidate', () => {
    const out = captureStdout(() =>
      formatValidateOutput(
        baseResult({
          kind: 'candidates',
          target: '.prospec/changes/x/candidates',
          facts: {
            rule_source: 'module-map',
            degraded: false,
            decision: { state: 'absent' },
            metrics: [
              { id: 'option-a', title: 'A', direction_violations: 0, violating_edges: [], touched_modules_count: 2, touched_modules: ['lib', 'types'], estimated_lines: 300, unknown_references: [] },
              { id: 'option-b', title: 'B', direction_violations: 1, violating_edges: [{ from: 'cli', to: 'lib' }], touched_modules_count: 3, touched_modules: ['cli', 'lib', 'types'], estimated_lines: null, unknown_references: ['vendor/x.js'] },
            ],
          },
        }),
        'normal',
      ),
    );
    const lines = out.split('\n').map((l) => l.trim());
    const header = lines.indexOf('| option | direction_violations | touched_modules | estimated_lines | unknown_references |');
    expect(header).toBeGreaterThan(-1);
    expect(lines[header + 1]).toBe('|---|---|---|---|---|');
    expect(lines[header + 2]).toBe('| option-a | 0 | 2 | 300 | 0 |');
    expect(lines[header + 3]).toBe('| option-b | 1 | 3 | — | 1 |');
    expect(out).toContain('dependency rules: module-map');
  });

  it('prints no table for a kind without metrics', () => {
    const out = captureStdout(() => formatValidateOutput(baseResult(), 'normal'));
    expect(out).not.toContain('direction_violations');
  });
});

