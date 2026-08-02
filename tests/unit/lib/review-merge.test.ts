import { describe, it, expect } from 'vitest';
import {
  parseReviewRows,
  mergeFindings,
  roundCounts,
  renderReviewTable,
  renderReviewDocument,
  type ReviewRow,
} from '../../../src/lib/review-merge.js';
import type { ReviewFinding } from '../../../src/types/station.js';

const finding = (over: Partial<ReviewFinding> & Pick<ReviewFinding, 'location' | 'summary'>): ReviewFinding => ({
  severity: 'major',
  lens: 'correctness',
  status: 'open',
  ...over,
});

describe('mergeFindings', () => {
  it('appends a brand-new finding as a new row with status open', () => {
    const merged = mergeFindings([], [finding({ id: 'F-1', location: 'a.ts:1', summary: 's' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'F-1', location: 'a.ts:1', status: 'open' });
  });

  it('matches by id even when the location drifted across rounds', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:10', severity: 'minor', lens: 'correctness', status: 'open', summary: 'old' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'F-1', location: 'a.ts:42', severity: 'critical', status: 'fixed', summary: 'new' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ location: 'a.ts:42', severity: 'critical', status: 'fixed', summary: 'new' });
  });

  it('falls back to (location, lens) identity for legacy rows without ids', () => {
    const existing: ReviewRow[] = [
      { location: 'a.ts:10', severity: 'major', lens: 'security', status: 'open', summary: 'old' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'F-9', location: 'a.ts:10', lens: 'security', status: 'fixed', summary: 'new' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe('F-9');
    expect(merged[0]!.status).toBe('fixed');
  });

  it('severity only escalates — merge takes the max, never downgrades', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'critical', lens: 'correctness', status: 'open', summary: 's' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'F-1', location: 'a.ts:1', severity: 'minor', summary: 's' }),
    ]);
    expect(merged[0]!.severity).toBe('critical');
  });

  it('carries forward rows the round did not mention (resolved items stay)', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'fixed', summary: 'done' },
    ];
    const merged = mergeFindings(existing, [finding({ id: 'F-2', location: 'b.ts:2', summary: 'new' })]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.status).toBe('fixed');
  });

  it('is idempotent — merging the same round twice changes nothing', () => {
    const round = [finding({ id: 'F-1', location: 'a.ts:1', summary: 's' })];
    const once = mergeFindings([], round);
    const twice = mergeFindings(once, round);
    expect(twice).toEqual(once);
  });

  it('does not mutate its inputs', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'minor', lens: 'correctness', status: 'open', summary: 's' },
    ];
    mergeFindings(existing, [finding({ id: 'F-1', location: 'a.ts:1', severity: 'critical', summary: 's' })]);
    expect(existing[0]!.severity).toBe('minor');
  });
});

describe('identity fallback never infers identity (issue #116)', () => {
  it('a new id opens its own row even when an existing row shares (location, lens)', () => {
    const existing: ReviewRow[] = [
      { id: 'F-8', location: 'a.ts:10', severity: 'critical', lens: 'test-quality', status: 'fixed', summary: 'first finding' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'NEW-4', location: 'a.ts:10', severity: 'major', lens: 'test-quality', summary: 'a DIFFERENT finding' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.id)).toEqual(['F-8', 'NEW-4']);
    expect(merged[0]).toMatchObject({ severity: 'critical', status: 'fixed', summary: 'first finding' });
    expect(merged[1]).toMatchObject({ severity: 'major', status: 'open', summary: 'a DIFFERENT finding' });
  });

  it('two id-less findings sharing (location, lens) land as two rows', () => {
    const merged = mergeFindings([], [
      finding({ location: 'a.ts:10', lens: 'security', summary: 'first' }),
      finding({ location: 'a.ts:10', lens: 'security', summary: 'second' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.summary)).toEqual(['first', 'second']);
  });

  it('a pre-round row absorbs the first id-less finding; the second opens its own row', () => {
    const existing: ReviewRow[] = [
      { location: 'a.ts:10', severity: 'minor', lens: 'security', status: 'open', summary: 'carried' },
    ];
    const merged = mergeFindings(existing, [
      finding({ location: 'a.ts:10', lens: 'security', summary: 'first' }),
      finding({ location: 'a.ts:10', lens: 'security', summary: 'second' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ summary: 'first', severity: 'major' });
    expect(merged[1]).toMatchObject({ summary: 'second' });
  });

  it('an id-less finding still keys on (location, lens) against a row that carries an id', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', summary: 'old' },
    ];
    const merged = mergeFindings(existing, [finding({ location: 'a.ts:1', status: 'fixed', summary: 'new' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'F-1', status: 'fixed', summary: 'new' });
  });

  it('reusing one id twice within a round updates a single row', () => {
    const merged = mergeFindings([], [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'first pass' }),
      finding({ id: 'F-1', location: 'a.ts:1', status: 'fixed', summary: 'second pass' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ status: 'fixed', summary: 'second pass' });
  });

  it('re-merging a round of id-less duplicates stays byte-identical', () => {
    // Not covered by the id-carrying idempotence test above: the id-less path
    // has no cross-invocation identity, so a replay must be absorbed by the
    // rows the first merge created — one per finding, in order.
    const round = [
      finding({ location: 'a.ts:10', lens: 'security', summary: 'first' }),
      finding({ location: 'a.ts:10', lens: 'security', summary: 'second' }),
    ];
    const once = mergeFindings([], round);
    const twice = mergeFindings(once, round);
    expect(twice).toEqual(once);
    expect(renderReviewTable(twice)).toBe(renderReviewTable(once));
  });

  it('a row the round names by id is reserved before any location matching', () => {
    // Identity asserted outranks identity inferred, and must do so whatever
    // order the findings arrive in: here the id-less finding is FIRST, so a
    // resolution that ran in array order would hand it F-1's row.
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', summary: 'the F-1 finding' },
    ];
    const round = [
      finding({ location: 'a.ts:1', severity: 'critical', summary: 'an id-less finding at the same line' }),
      finding({ id: 'F-1', location: 'a.ts:9', severity: 'minor', status: 'fixed', summary: 'F-1, fixed and moved' }),
    ];
    const once = mergeFindings(existing, round);
    expect(once).toHaveLength(2);
    expect(once[0]).toMatchObject({ id: 'F-1', location: 'a.ts:9', severity: 'major', status: 'fixed' });
    expect(once[1]).toMatchObject({ location: 'a.ts:1', severity: 'critical', status: 'open' });
    expect(once[1]!.id, 'the id-less finding must not inherit the named row\'s id').toBeUndefined();
    expect(mergeFindings(once, round), 'the reservation must survive a replay').toEqual(once);
  });

  it('a row whose location this round moved is not re-claimed at its old key', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', summary: 'the F-1 finding' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'F-1', location: 'a.ts:9', summary: 'F-1 moved to line 9' }),
      finding({ location: 'a.ts:1', summary: 'a different id-less finding at line 1' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'F-1', location: 'a.ts:9', summary: 'F-1 moved to line 9' });
    expect(merged[1]).toMatchObject({ location: 'a.ts:1', summary: 'a different id-less finding at line 1' });
  });

  it('an id match leaves the (location, lens) key of a DIFFERENT row claimable', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', summary: 'drifting' },
      { location: 'a.ts:9', severity: 'minor', lens: 'correctness', status: 'open', summary: 'legacy' },
    ];
    const merged = mergeFindings(existing, [
      finding({ id: 'F-1', location: 'a.ts:9', summary: 'moved here' }),
      finding({ location: 'a.ts:9', lens: 'correctness', summary: 'legacy update' }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: 'F-1', location: 'a.ts:9', summary: 'moved here' });
    expect(merged[1]).toMatchObject({ summary: 'legacy update' });
    expect(merged[1]!.id).toBeUndefined();
  });
});

describe('roundCounts', () => {
  it('counts the round, not the cumulative table', () => {
    const counts = roundCounts([
      finding({ location: 'a', summary: 's', severity: 'critical', status: 'fixed' }),
      finding({ location: 'b', summary: 's', severity: 'critical' }),
      finding({ location: 'c', summary: 's', severity: 'major' }),
      finding({ location: 'd', summary: 's', severity: 'minor' }),
    ]);
    expect(counts).toEqual({ criticals_found: 2, criticals_fixed: 1, majors: 1 });
  });
});

describe('parse / render round trip', () => {
  it('parses the canonical table it renders (bit-identical rerun)', () => {
    const rows = mergeFindings([], [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'first' }),
      finding({ id: 'F-2', location: 'b.ts:2', severity: 'critical', lens: 'security', summary: 'second' }),
    ]);
    const doc1 = renderReviewDocument('', rows, 'my-change');
    const reparsed = parseReviewRows(doc1);
    expect(reparsed).toEqual(rows);
    const doc2 = renderReviewDocument('', reparsed, 'my-change');
    expect(doc2).toBe(doc1);
  });

  it('reads a legacy hand-written 4-column table (backward compatible)', () => {
    const legacy = [
      '# Review',
      '',
      '| Location | Severity | Lens | Status |',
      '|---|---|---|---|',
      '| src/a.ts:12 | critical | correctness | open |',
      '',
    ].join('\n');
    const rows = parseReviewRows(legacy);
    expect(rows).toEqual([
      { location: 'src/a.ts:12', severity: 'critical', lens: 'correctness', status: 'open', summary: '' },
    ]);
  });

  it('replaces the table in place, preserving prose before and after it', () => {
    const original = [
      '# Review Findings: c',
      '',
      'Round 1 notes.',
      '',
      '| ID | Location | Severity | Lens | Status | Summary |',
      '|---|---|---|---|---|---|',
      '| F-1 | a.ts:1 | major | correctness | open | first |',
      '',
      'Trailing notes.',
    ].join('\n');
    const rows = mergeFindings(parseReviewRows(original), [
      finding({ id: 'F-1', location: 'a.ts:1', status: 'fixed', summary: 'first' }),
    ]);
    const updated = renderReviewDocument(original, rows, 'c');
    expect(updated).toContain('Round 1 notes.');
    expect(updated).toContain('Trailing notes.');
    expect(updated).toContain('| F-1 | a.ts:1 | major | correctness | fixed | first |');
  });

  it('escapes pipes in summaries so the table stays parseable', () => {
    const rows = mergeFindings([], [finding({ location: 'a.ts:1', summary: 'uses a | pipe' })]);
    const table = renderReviewTable(rows);
    expect(table).toContain('uses a \\| pipe');
  });
});

describe('pipe-escaping round trip (review C1 regression)', () => {
  it('a summary containing pipes survives render → parse → re-merge bit-identically', () => {
    const rows = mergeFindings([], [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'union A | B mishandled (a || b)' }),
    ]);
    const doc1 = renderReviewDocument('', rows, 'c');
    const reparsed = parseReviewRows(doc1);
    expect(reparsed[0]!.summary).toBe('union A | B mishandled (a || b)');
    const doc2 = renderReviewDocument(doc1, mergeFindings(reparsed, []), 'c');
    expect(doc2).toBe(doc1);
  });

  it('a pipe in Location does not shift columns or mint a duplicate identity', () => {
    const rows = mergeFindings([], [
      finding({ location: 'src/b.ts|util:3', severity: 'critical', summary: 's' }),
    ]);
    const doc = renderReviewDocument('', rows, 'c');
    const reparsed = parseReviewRows(doc);
    expect(reparsed).toEqual(rows);
    expect(reparsed[0]!.severity).toBe('critical');
    const again = mergeFindings(reparsed, [
      finding({ location: 'src/b.ts|util:3', severity: 'critical', status: 'fixed', summary: 's' }),
    ]);
    expect(again).toHaveLength(1);
  });
});
