import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatLearnPlaybookOutput, formatLearnUpsertOutput } from '../../../src/cli/formatters/learn-output.js';
import type { LearnPlaybookResult, LearnUpsertResult } from '../../../src/services/learn.service.js';
import type { PlaybookEntry } from '../../../src/lib/lessons-ledger.js';

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
    escapedCells: 0,
    ...overrides,
  };
}

describe('learn-output escaping notice (REQ-CLI-055)', () => {
  it('adds one line only when a cell was escaped', () => {
    const base = captureStdout(() => formatLearnUpsertOutput(baseResult(), 'normal'));
    expect(base).not.toMatch(/escaped/i);
    const out = captureStdout(() => formatLearnUpsertOutput(baseResult({ escapedCells: 1 }), 'normal'));
    expect(out.split('\n').length).toBe(base.split('\n').length + 1);
    expect(out).toContain('1 cell(s)');
  });
});

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
    expect(out).toContain('Ledger entry created: prospec/ai-knowledge/_lessons-ledger.md');
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

// REQ-CLI-059 — one catalog line per active entry; matched bodies follow their line.
describe('formatLearnPlaybookOutput', () => {
  const entry = (id: string, modules: string[] | null, body = `### ${id}: t\n- **Guidance**: g`): PlaybookEntry => ({
    id,
    title: `title ${id}`,
    kind: 'convention',
    modules,
    ttl: '2027-01-01',
    retired: false,
    text: body,
    stations: null,
    tokens: 50,
    overLimit: false,
  });

  it('prints station bodies in catalog order and keeps diagnostics on stderr', () => {
    const errors: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { errors.push(String(chunk)); return true; });
    const result: LearnPlaybookResult = {
      path: 'p', available: true, entry: null, mode: 'station',
      warnings: [
        { kind: 'unknown-station', id: 'PB-001', token: `ba${BEL}d` },
        { kind: 'over-limit', id: 'PB-002', tokens: 301, limit: 300 },
      ],
      catalog: [
        { entry: entry('PB-001', ['cli']), matched: true, bodySelected: false },
        { entry: entry('PB-002', ['lib']), matched: false, bodySelected: true },
      ],
    };
    const stdout = captureStdout(() => formatLearnPlaybookOutput(result));
    expect(stdout).toContain('station-selected');
    expect(stdout).toContain('PB-001 ·');
    expect(stdout).toContain('PB-002 ·');
    expect(stdout).not.toContain('### PB-001: t');
    expect(stdout).toContain('### PB-002: t');
    expect(stdout.indexOf('PB-001 ·')).toBeLessThan(stdout.indexOf('PB-002 ·'));
    expect(stdout).not.toMatch(/WARN|301|bad/);
    expect(errors.join('')).toContain('PB-001');
    expect(errors.join('')).toContain('PB-002');
    expect(errors.join('')).toContain('301');
    expect(errors.join('')).not.toContain(BEL);
  });

  it('prints one catalog line per entry, matched first with their text and relevance, unmatched as a line only', () => {
    const r: LearnPlaybookResult = {
      path: 'prospec/ai-knowledge/_playbook.md',
      available: true,
      entry: null,
      mode: 'modules',
      warnings: [],
      catalog: [
        { entry: entry('PB-002', ['lib']), matched: true, bodySelected: true },
        { entry: entry('PB-001', ['templates']), matched: false, bodySelected: false },
        { entry: entry('PB-003', null), matched: false, bodySelected: false },
      ],
    };
    const out = captureStdout(() => formatLearnPlaybookOutput(r));
    const catalogLines = out.split('\n').filter((l) => /^PB-\d+ · /.test(l));
    expect(catalogLines).toEqual([
      'PB-002 · title PB-002 · kind: convention · modules: lib · TTL: 2027-01-01 · relevance: module-match',
      'PB-001 · title PB-001 · kind: convention · modules: templates · TTL: 2027-01-01',
      'PB-003 · title PB-003 · kind: convention · modules: undeclared · TTL: 2027-01-01',
    ]);
    expect(out).toContain('### PB-002: t\n- **Guidance**: g');
    expect(out).not.toContain('### PB-001: t');
    expect(out.indexOf('### PB-002')).toBeLessThan(out.indexOf('PB-001 · '));
  });

  it('strips control characters from every catalog-line field, not only the printed entry text', () => {
    const r: LearnPlaybookResult = {
      path: 'prospec/ai-knowledge/_playbook.md',
      available: true,
      entry: null,
      mode: 'modules',
      warnings: [],
      catalog: [
        {
          entry: { ...entry('PB-004', [`li${BEL}b`]), title: `ti${BEL}tle`, kind: `con${BEL}vention`, ttl: `2027${BEL}-01-01` },
          matched: false,
          bodySelected: false,
        },
      ],
    };
    const out = captureStdout(() => formatLearnPlaybookOutput(r));
    expect(out).toContain('PB-004 · ');
    expect(out.includes(BEL)).toBe(false);
  });

  it('prints only the entry text for --id', () => {
    const r: LearnPlaybookResult = {
      path: 'p',
      available: true,
      catalog: [],
      entry: entry('PB-007', ['lib'], `### PB-007: x${BEL}\n- body`),
      mode: null,
      warnings: [],
    };
    expect(captureStdout(() => formatLearnPlaybookOutput(r))).toBe('### PB-007: x\n- body\n');
  });

  it('prints one line and nothing else when the playbook is absent', () => {
    const out = captureStdout(() =>
      formatLearnPlaybookOutput({ path: 'prospec/ai-knowledge/_playbook.md', available: false, catalog: [], entry: null, mode: 'modules', warnings: [] }),
    );
    expect(out.trimEnd().split('\n')).toHaveLength(1);
    expect(out).toContain('prospec/ai-knowledge/_playbook.md');
  });
});
