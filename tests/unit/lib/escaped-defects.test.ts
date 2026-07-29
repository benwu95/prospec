import { describe, it, expect } from 'vitest';
import { aggregateEscapedDefects } from '../../../src/lib/escaped-defects.js';
import type { QualityLedgerChange, QualityLedgerSource } from '../../../src/lib/drift-sources.js';

/** REQ-LIB-034 — per-gate escaped-defect rate from the `introduced_by` convention. */

const AT = '2026-07-28T00:00:00.000Z';

const change = (over: Partial<QualityLedgerChange>): QualityLedgerChange => ({
  name: 'c',
  dir: 'c',
  ledger: 'changes',
  status: 'archived',
  introduced_by: null,
  gate_results: [],
  ...over,
});

const src = (changes: QualityLedgerChange[], archive_available = true): QualityLedgerSource => ({
  available: true,
  archive_available,
  changes,
});

describe('aggregateEscapedDefects', () => {
  it('reports no samples — and NO gate rows — when nothing registers introduced_by', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'a',
          gate_results: [
            { skill: 'prospec-review', result: 'PASS' },
            { skill: 'prospec-verify', result: 'PASS' },
          ],
        }),
      ]),
      AT,
    );
    expect(report.sample_count).toBe(0);
    // an empty sample is not a 0% escape rate — the rows must be absent, not zeroed
    expect(report.gates).toEqual([]);
    expect(report.samples).toEqual([]);
  });

  it('counts an escape against every gate that PASSed the blamed change', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'offender',
          gate_results: [
            { skill: 'prospec-review', result: 'PASS' },
            { skill: 'prospec-verify', result: 'PASS' },
            { skill: 'prospec-plan', result: 'WARN' },
          ],
        }),
        change({ name: 'fix', introduced_by: 'offender', gate_results: [{ skill: 'prospec-review', result: 'PASS' }] }),
      ]),
      AT,
    );
    expect(report.sample_count).toBe(1);
    expect(report.samples[0]).toEqual({
      fix_change: 'fix',
      introduced_by: 'offender',
      gates_passed: ['prospec-review', 'prospec-verify'],
    });
    const review = report.gates.find((g) => g.gate === 'prospec-review');
    const verify = report.gates.find((g) => g.gate === 'prospec-verify');
    // review PASSed on both changes; verify only on the offender
    expect(review).toEqual({ gate: 'prospec-review', passed: 2, escaped: 1, escaped_rate: 0.5 });
    expect(verify).toEqual({ gate: 'prospec-verify', passed: 1, escaped: 1, escaped_rate: 1 });
    // a WARN record is not a PASS, so that gate never enters the table
    expect(report.gates.some((g) => g.gate === 'prospec-plan')).toBe(false);
  });

  // #103 must-fix 2: the blamed set used to key on the RAW introduced_by string,
  // so two accepted spellings of one change counted as two escapes — silently
  // inflating the rate, and at the passed=1 boundary producing escaped_rate=2,
  // which fails the schema's max(1) and aborts the whole report.
  it('counts ONE escape when two fixes blame the same change through different aliases', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'offender',
          dir: '2026-07-05-offender',
          ledger: 'archive',
          gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
        }),
        change({ name: 'fix-a', introduced_by: 'offender' }),
        change({ name: 'fix-b', introduced_by: '2026-07-05-offender' }),
      ]),
      AT,
    );
    // two defects (samples), but ONE change the gate passed — a true rate in 0..1
    expect(report.sample_count).toBe(2);
    const verify = report.gates.find((g) => g.gate === 'prospec-verify');
    expect(verify).toEqual({ gate: 'prospec-verify', passed: 1, escaped: 1, escaped_rate: 1 });
  });

  it('resolves introduced_by against a date-prefixed archive directory', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'unlock-measurement',
          dir: '2026-07-05-unlock-measurement',
          ledger: 'archive',
          gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
        }),
        change({ name: 'fix', introduced_by: 'unlock-measurement' }),
      ]),
      AT,
    );
    expect(report.sample_count).toBe(1);
    expect(report.unresolved_references).toEqual([]);
  });

  it('resolves a registration written as the dated directory name too', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'unlock-measurement',
          dir: '2026-07-05-unlock-measurement',
          ledger: 'archive',
          gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
        }),
        change({ name: 'fix', introduced_by: '2026-07-05-unlock-measurement' }),
      ]),
      AT,
    );
    expect(report.sample_count).toBe(1);
  });

  it('never triples a gate denominator because one change has three name aliases', () => {
    const report = aggregateEscapedDefects(
      src([
        change({
          name: 'offender',
          dir: '2026-07-05-offender',
          ledger: 'archive',
          gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
        }),
        change({ name: 'fix', introduced_by: 'offender' }),
      ]),
      AT,
    );
    expect(report.gates.find((g) => g.gate === 'prospec-verify')?.passed).toBe(1);
  });

  it('surfaces an unresolved introduced_by instead of dropping it', () => {
    const report = aggregateEscapedDefects(
      src([change({ name: 'fix', introduced_by: 'typo-name' })]),
      AT,
    );
    expect(report.sample_count).toBe(0);
    expect(report.unresolved_references).toEqual([
      { fix_change: 'fix', introduced_by: 'typo-name', gates_passed: [] },
    ]);
  });

  it('flags an honestly partial sample when the archive ledger is absent', () => {
    const report = aggregateEscapedDefects(src([], false), AT);
    expect(report.archive_available).toBe(false);
  });

  // `escaped` counts DISTINCT blamed changes so the ratio stays a rate: two fixes
  // tracing to one change are two samples but ONE change the gate let through.
  // Counting blame events made escaped_rate exceed 1 and print as "200.0%".
  it('counts two fixes blaming the same change as ONE escaped change for that gate', () => {
    const report = aggregateEscapedDefects(
      src([
        change({ name: 'offender', gate_results: [{ skill: 'prospec-verify', result: 'PASS' }] }),
        change({ name: 'fix-a', introduced_by: 'offender' }),
        change({ name: 'fix-b', introduced_by: 'offender' }),
      ]),
      AT,
    );
    expect(report.sample_count).toBe(2);
    const verify = report.gates.find((g) => g.gate === 'prospec-verify');
    expect(verify).toEqual({ gate: 'prospec-verify', passed: 1, escaped: 1, escaped_rate: 1 });
  });

  it('never lets escaped_rate exceed 1 however many fixes blame one change', () => {
    const report = aggregateEscapedDefects(
      src([
        change({ name: 'offender', gate_results: [{ skill: 'prospec-review', result: 'PASS' }] }),
        change({ name: 'f1', introduced_by: 'offender' }),
        change({ name: 'f2', introduced_by: 'offender' }),
        change({ name: 'f3', introduced_by: 'offender' }),
      ]),
      AT,
    );
    for (const g of report.gates) {
      expect(g.escaped).toBeLessThanOrEqual(g.passed);
      expect(g.escaped_rate).toBeLessThanOrEqual(1);
    }
  });

  it('treats an alias two ledger entries share as unresolved, not first-wins', () => {
    const report = aggregateEscapedDefects(
      src([
        change({ name: 'foo', dir: 'foo', ledger: 'changes', gate_results: [] }),
        change({
          name: 'foo',
          dir: '2026-01-01-foo',
          ledger: 'archive',
          gate_results: [{ skill: 'prospec-verify', result: 'PASS' }],
        }),
        change({ name: 'fix', introduced_by: 'foo' }),
      ]),
      AT,
    );
    // silently picking one would blame the wrong change AND hide the ambiguity
    expect(report.sample_count).toBe(0);
    expect(report.unresolved_references).toHaveLength(1);
    expect(report.gates).toEqual([]);
  });

  it('reports an unavailable ledger distinctly from a ledger with no registrations', () => {
    const unavailable = aggregateEscapedDefects(
      { available: false, reason: 'source unavailable: neither ledger found', archive_available: false, changes: [] },
      AT,
    );
    expect(unavailable.ledger_available).toBe(false);
    expect(unavailable.sample_count).toBe(0);
    const empty = aggregateEscapedDefects(src([change({ name: 'a' })]), AT);
    expect(empty.ledger_available).toBe(true);
    expect(empty.sample_count).toBe(0);
  });

  it('is deterministic and codepoint-sorted for the same ledger', () => {
    const ledger = src([
      change({ name: 'zzz', gate_results: [{ skill: 'prospec-verify', result: 'PASS' }] }),
      change({ name: 'aaa', gate_results: [{ skill: 'prospec-review', result: 'PASS' }] }),
      change({ name: 'fix-z', introduced_by: 'zzz' }),
      change({ name: 'fix-a', introduced_by: 'aaa' }),
    ]);
    const first = aggregateEscapedDefects(ledger, AT);
    expect(aggregateEscapedDefects(ledger, AT)).toEqual(first);
    expect(first.gates.map((g) => g.gate)).toEqual(['prospec-review', 'prospec-verify']);
    expect(first.samples.map((s) => s.fix_change)).toEqual(['fix-a', 'fix-z']);
  });
});
