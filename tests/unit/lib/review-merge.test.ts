import { describe, it, expect } from 'vitest';
import {
  parseReviewRows,
  mergeFindings,
  roundCounts,
  renderReviewTable,
  renderReviewDocument,
  parseReviewDocument,
  parseReviewMetrics,
  parseReviewMetricsStrict,
  readTestFailureStreak,
  reduceTestFailureStreak,
  renderReviewMetricsComment,
  replaceReviewMetrics,
  escapedCellsFor,
  applyCleanReviewSentence,
  stripCleanReviewBlock,
  REVIEW_CLEAN_START_MARKER,
  REVIEW_CLEAN_END_MARKER,
  type ReviewRow,
} from '../../../src/lib/review-merge.js';
import { EMPTY_TEST_FAILURE_STREAK } from '../../../src/types/cascade.js';
import { PrerequisiteError } from '../../../src/types/errors.js';
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
    expect(updated).toContain('| F-1 | a.ts:1 | major | correctness | fixed | 1 | first |  |');
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

describe('evidence and repro are cumulative row state', () => {
  const row = (over: Partial<ReviewRow> & Pick<ReviewRow, 'location'>): ReviewRow => ({
    severity: 'critical',
    lens: 'correctness',
    status: 'open',
    summary: 's',
    ...over,
  });

  it('a round supplying evidence replaces the row evidence', () => {
    const merged = mergeFindings(
      [row({ id: 'F-1', location: 'a.ts:1', evidence: 'old prose' })],
      [finding({ id: 'F-1', location: 'a.ts:1', summary: 's', repro: 'pnpm test' , evidence: 'new prose' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.evidence).toBe('new prose');
  });

  it('a round re-reporting a finding WITHOUT evidence keeps what was recorded', () => {
    const merged = mergeFindings(
      [row({ id: 'F-1', location: 'a.ts:1', evidence: 'why it was raised', repro: 'pnpm a' })],
      [finding({ id: 'F-1', location: 'a.ts:9', summary: 's', status: 'fixed', repro: 'pnpm a' })],
    );
    expect(merged[0]!.evidence).toBe('why it was raised');
    expect(merged[0]!.status).toBe('fixed');
  });

  it('a round supplying only repro leaves the recorded evidence alone', () => {
    const merged = mergeFindings(
      [row({ id: 'F-1', location: 'a.ts:1', evidence: 'prose', repro: 'old cmd' })],
      [finding({ id: 'F-1', location: 'a.ts:1', summary: 's', repro: 'new cmd' })],
    );
    expect(merged[0]!.repro).toBe('new cmd');
    expect(merged[0]!.evidence).toBe('prose');
  });

  it('renders the evidence section in table-row order, not parse order', () => {
    const doc = renderReviewDocument(
      '',
      [
        row({ id: 'F-2', location: 'b.ts:2', evidence: 'second' }),
        row({ id: 'F-1', location: 'a.ts:1', evidence: 'first' }),
      ],
      'x',
    );
    expect(doc.indexOf('second')).toBeLessThan(doc.indexOf('first'));
  });

  it('omits the evidence section entirely when no row carries evidence', () => {
    const doc = renderReviewDocument('', [row({ id: 'F-1', location: 'a.ts:1' })], 'x');
    expect(doc).not.toContain('## Evidence');
    expect(doc).not.toContain('prospec:evidence');
  });

  it('puts repro in its own column so it survives a re-parse', () => {
    const repro = "pnpm vitest run tests/unit/lib/a.test.ts -t 'bound | edge'";
    const doc = renderReviewDocument('', [row({ id: 'F-1', location: 'a.ts:1', repro })], 'x');
    const [parsed] = parseReviewRows(doc);
    expect(parsed?.repro).toBe(repro);
  });

  it('round-trips a whole document — table, repro column and evidence prose', () => {
    const rows = [
      row({ id: 'F-1', location: 'a.ts:1', repro: 'pnpm a', evidence: 'first\n\nsecond' }),
      row({ id: 'F-2', location: 'b.ts:2', severity: 'major', summary: 'dup' }),
    ];
    const first = renderReviewDocument('', rows, 'x');
    const { rows: reread } = parseReviewDocument(first);
    expect(reread.map((r) => r.evidence)).toEqual(['first\n\nsecond', undefined]);
    expect(renderReviewDocument(first, reread, 'x')).toBe(first);
  });

  it('re-merging the same round over the written document is byte-identical', () => {
    const round = [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 's', severity: 'critical', repro: 'pnpm a', evidence: 'prose' }),
    ];
    const first = renderReviewDocument('', mergeFindings([], round), 'x');
    const parsed = parseReviewDocument(first);
    const second = renderReviewDocument(first, mergeFindings(parsed.rows, round), 'x');
    expect(second).toBe(first);
  });

  it('keeps prose after the table above the evidence section', () => {
    const withProse = renderReviewDocument(
      '# Review Findings: x\n\n| ID | Location | Severity | Lens | Status | Summary | Repro |\n|---|---|---|---|---|---|---|\n\n本輪未發現問題。\n',
      [row({ id: 'F-1', location: 'a.ts:1', evidence: 'prose' })],
      'x',
    );
    expect(withProse.indexOf('本輪未發現問題。')).toBeLessThan(withProse.indexOf('## Evidence'));
  });

  it('reads a legacy 6-column table (no Repro column) and leaves repro unset', () => {
    const legacy = [
      '# Review Findings: x',
      '',
      '| ID | Location | Severity | Lens | Status | Summary |',
      '|---|---|---|---|---|---|',
      '| F-1 | a.ts:1 | critical | correctness | open | old row |',
      '',
    ].join('\n');
    const { rows } = parseReviewDocument(legacy);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.repro).toBeUndefined();
    expect(rows[0]!.evidence).toBeUndefined();
    const merged = mergeFindings(rows, [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'now with evidence', evidence: 'prose' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(renderReviewDocument(legacy, merged, 'x')).toContain('prose');
  });
});

describe('content below the evidence section survives a rebuild', () => {
  const critical = (over: Partial<ReviewFinding> = {}): ReviewFinding =>
    finding({ id: 'F-1', location: 'a.ts:1', severity: 'critical', summary: 's', repro: 'pnpm a', evidence: 'prose', ...over });

  it('keeps the artifact-language sentence the review skill mandates appending', () => {
    // prospec-review REQUIRES a clean round to append a sentence in the artifact
    // language BELOW what the CLI wrote. The section is rebuilt on every merge,
    // so without preserving the tail that mandated sentence is deleted by the
    // next round — the contract asking for it and the engine destroying it.
    const first = renderReviewDocument('', mergeFindings([], [critical()]), 'x');
    const annotated = `${first}\n本輪未發現新問題。\n`;
    const parsed = parseReviewDocument(annotated);
    const second = renderReviewDocument(annotated, mergeFindings(parsed.rows, [critical({ status: 'fixed' })]), 'x');
    expect(second).toContain('本輪未發現新問題。');
    // and it stays BELOW the evidence section, where its author put it
    expect(second.indexOf('## Evidence')).toBeLessThan(second.indexOf('本輪未發現新問題。'));
  });

  it('does not duplicate the tail when the same round is merged twice', () => {
    const first = renderReviewDocument('', mergeFindings([], [critical()]), 'x');
    const annotated = `${first}\nTAIL\n`;
    const a = renderReviewDocument(annotated, mergeFindings(parseReviewDocument(annotated).rows, [critical()]), 'x');
    const b = renderReviewDocument(a, mergeFindings(parseReviewDocument(a).rows, [critical()]), 'x');
    expect(b).toBe(a);
    expect(b.match(/TAIL/g)).toHaveLength(1);
  });
});

describe('origin_round tracking and Origin column (REQ-LIB-064, REQ-CLI-028)', () => {
  it('stamps new findings with the current round number (default 1)', () => {
    const round1 = [finding({ id: 'F-1', location: 'a.ts:1', summary: 'initial' })];
    const merged1 = mergeFindings([], round1, 1);
    expect(merged1[0]!.origin_round).toBe(1);
  });

  it('preserves existing origin_round when carrying forward or updating findings in subsequent rounds', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'critical', lens: 'correctness', status: 'open', origin_round: 1, summary: 'bug' },
    ];
    // Round 2 fixes F-1 and introduces F-2
    const round2 = [
      finding({ id: 'F-1', location: 'a.ts:1', status: 'fixed', summary: 'bug fixed' }),
      finding({ id: 'F-2', location: 'b.ts:10', severity: 'major', summary: 'new issue in r2' }),
    ];
    const merged2 = mergeFindings(existing, round2, 2);
    expect(merged2).toHaveLength(2);
    expect(merged2[0]!.id).toBe('F-1');
    expect(merged2[0]!.origin_round).toBe(1); // preserved from round 1
    expect(merged2[0]!.status).toBe('fixed');
    expect(merged2[1]!.id).toBe('F-2');
    expect(merged2[1]!.origin_round).toBe(2); // assigned round 2
  });

  it('stamps current round on newly incoming findings regardless of finding payload', () => {
    const round = [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'new finding' }),
    ];
    const merged = mergeFindings([], round, 5);
    expect(merged[0]!.origin_round).toBe(5);
  });

  it('parses Origin column from 8-column markdown table', () => {
    const doc = [
      '# Review Findings: x',
      '',
      '| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |',
      '|---|---|---|---|---|---|---|---|',
      '| F-1 | a.ts:1 | critical | correctness | open | 2 | defect | pnpm test |',
      '',
    ].join('\n');
    const rows = parseReviewRows(doc);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.origin_round).toBe(2);
    expect(rows[0]!.summary).toBe('defect');
    expect(rows[0]!.repro).toBe('pnpm test');
  });

  it.each(['Round', 'origin_round', 'Origin Round'])('parses the %s header alias as origin_round', (header) => {
    const doc = [
      '# Review Findings: x',
      '',
      `| ID | Location | Severity | Lens | Status | ${header} | Summary |`,
      '|---|---|---|---|---|---|---|',
      '| F-1 | a.ts:1 | critical | correctness | open | 3 | defect |',
      '',
    ].join('\n');
    expect(parseReviewRows(doc)[0]!.origin_round).toBe(3);
  });

  it('round-trips Origin column through render and parse', () => {
    const initial: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', origin_round: 1, summary: 's1' },
      { id: 'F-2', location: 'b.ts:2', severity: 'critical', lens: 'security', status: 'open', origin_round: 3, summary: 's2' },
    ];
    const rendered = renderReviewTable(initial);
    expect(rendered).toContain('| F-1 | a.ts:1 | major | correctness | open | 1 | s1 |  |');
    expect(rendered).toContain('| F-2 | b.ts:2 | critical | security | open | 3 | s2 |  |');
    const reparsed = parseReviewRows(rendered);
    expect(reparsed[0]!.origin_round).toBe(1);
    expect(reparsed[1]!.origin_round).toBe(3);
  });

  it('round-trips extended review metrics comment (spend, loop_base, provenance, signatures, lenses)', () => {
    const doc = renderReviewDocument(
      '',
      [{ id: 'F-1', location: 'a.ts:1', severity: 'critical', lens: 'correctness', status: 'open', origin_round: 2, summary: 'bug' }],
      'test-change',
      {
        round: 2,
        spendBefore: 1000,
        lastRoundSpend: 500,
        cumulativeSpend: 1500,
        loopBase: 1,
        provenanceDigest: 'abc1234',
        lenses: ['correctness', 'security'],
        trials: {
          'F-1': [false, true, false],
        },
      },
    );

    expect(doc).toContain('<!-- prospec:review-metrics round="2" spend_before="1000" round_spend="500" cumulative_spend="1500" loop_base="1" provenance="abc1234" lenses="correctness,security" signatures="F-1:FPF" -->');
    const parsed = parseReviewMetrics(doc);
    expect(parsed.round).toBe(2);
    expect(parsed.spendBefore).toBe(1000);
    expect(parsed.lastRoundSpend).toBe(500);
    expect(parsed.cumulativeSpend).toBe(1500);
    expect(parsed.loopBase).toBe(1);
    expect(parsed.provenanceDigest).toBe('abc1234');
    expect(parsed.lenses).toEqual(['correctness', 'security']);
    expect(parsed.trials?.['F-1']).toEqual([false, true, false]);
  });

  it('a pre-existing row without Origin is stamped 1, never the current round (legacy-table upgrade)', () => {
    const legacy = parseReviewRows(
      '| ID | Location | Severity | Lens | Status | Summary | Repro |\n|---|---|---|---|---|---|---|\n| F-1 | src/a.ts:1 | critical | correctness | open | bug1 | pnpm a |\n',
    );
    const merged = mergeFindings(
      legacy,
      [
        {
          id: 'F-1',
          location: 'src/a.ts:1',
          severity: 'critical',
          lens: 'correctness',
          status: 'fixed',
          summary: 'bug1',
          repro: 'pnpm a',
        },
      ],
      3,
    );
    expect(merged[0]!.origin_round).toBe(1);
  });

  it('encodes and decodes special characters in signatures and lenses without breaking syntax', () => {
    const doc = renderReviewDocument('', [], 'test', {
      round: 1,
      lenses: ['correctness, edge cases', 'security'],
      trials: {
        'F-1" round="99': [false, true],
        'F-2 --> <b>': [true, false],
        'C:1': [true],
      },
    });
    expect(doc).toContain('prospec:review-metrics');
    expect(doc).not.toContain('round="99"');
    const parsed = parseReviewMetrics(doc);
    expect(parsed.round).toBe(1);
    expect(parsed.lenses).toEqual(['correctness, edge cases', 'security']);
    expect(parsed.trials?.['F-1" round="99']).toEqual([false, true]);
    expect(parsed.trials?.['F-2 --> <b>']).toEqual([true, false]);
    expect(parsed.trials?.['C:1']).toEqual([true]);
  });
});


describe('escapedCellsFor (REQ-LIB-078) — counts the rendered cells of rows this round wrote or updated', () => {
  it('counts only rows the incoming findings touched, over the cells the table actually renders', () => {
    const findings: ReviewFinding[] = [
      finding({ id: 'F-1', location: 'a.ts:1', summary: 'plain' }),
      finding({ id: 'F-2', location: 'b.ts:2', summary: 'uses a | pipe', repro: 'grep "x" | head' }),
      finding({ id: 'F-3', location: 'c.ts:3', summary: 'multi\nline' }),
    ];
    const merged = mergeFindings([], findings);
    expect(escapedCellsFor(merged, findings)).toBe(3);
    expect(escapedCellsFor(merged, [])).toBe(0);
  });

  it('a carried-forward row with a pipe is NOT counted when this round did not touch it', () => {
    const existing: ReviewRow[] = [
      { id: 'OLD', location: 'z.ts:9', severity: 'major', lens: 'correctness', status: 'open', summary: 'old | row' },
    ];
    const incoming = [finding({ id: 'F-9', location: 'q.ts:1', summary: 'clean' })];
    const merged = mergeFindings(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(escapedCellsFor(merged, incoming)).toBe(0);
  });

  it('two id-less findings at one location+lens in one round are two rows and both are counted (claim once, in table order)', () => {
    // pinned from the round-2 review repro: `find` returned the first row twice → reported 1, expected 2
    const incoming = [
      finding({ location: 'a.ts:1', summary: 'one | x' }),
      finding({ location: 'a.ts:1', summary: 'two | y' }),
    ];
    const merged = mergeFindings([], incoming);
    expect(merged).toHaveLength(2);
    expect(escapedCellsFor(merged, incoming)).toBe(2);
  });

  it('an id-bearing finding reserves its row before any id-less finding claims by location (order-independent, like the merge)', () => {
    // pinned from the round-3 review repro: id-less first at the same (location, lens) stole X-1 → reported 1, expected 2
    const existing: ReviewRow[] = [
      { id: 'X-1', location: 'a.ts:1', severity: 'major', lens: 'c', status: 'open', summary: 'old' },
    ];
    const incoming = [
      finding({ location: 'a.ts:1', lens: 'c', summary: 'fresh | b' }),
      finding({ id: 'X-1', location: 'a.ts:1', lens: 'c', summary: 'new | a' }),
    ];
    const merged = mergeFindings(existing, incoming, 2);
    expect(merged).toHaveLength(2);
    expect(escapedCellsFor(merged, incoming)).toBe(2);
  });

  it('re-reporting a row by id counts the row AS RENDERED (lens is never overwritten, so a pipe in the incoming lens is not counted)', () => {
    const existing: ReviewRow[] = [
      { id: 'F-1', location: 'a.ts:1', severity: 'major', lens: 'correctness', status: 'open', summary: 'old' },
    ];
    const incoming = [finding({ id: 'F-1', location: 'a.ts:2', lens: 'weird | lens', status: 'fixed', summary: 'now | piped' })];
    const merged = mergeFindings(existing, incoming);
    expect(merged[0]!.lens).toBe('correctness');
    expect(escapedCellsFor(merged, incoming)).toBe(1);
  });
});

describe('test-failure metrics in review.md (REQ-SERVICES-098, REQ-SERVICES-086, REQ-TYPES-086)', () => {
  it('legacy metrics without the test fields read as the empty streak', () => {
    const doc = '<!-- prospec:review-metrics round="2" cumulative_spend="4000" -->\n# R\n';
    expect(readTestFailureStreak(parseReviewMetricsStrict(doc))).toEqual(EMPTY_TEST_FAILURE_STREAK);
    expect(readTestFailureStreak(parseReviewMetrics(''))).toEqual(EMPTY_TEST_FAILURE_STREAK);
  });

  it('round-trips the bounded streak through the metrics comment beside the existing fields', () => {
    const doc = renderReviewDocument('', [], 'c', {
      round: 2,
      cumulativeSpend: 10,
      lenses: ['a'],
      testFailureAttemptIds: ['id-1', 'id,2'],
      consecutiveTestFailures: 2,
    });
    expect(doc).toContain('test_failures="2"');
    expect(doc).toContain('test_failure_ids="id-1,id%2C2"');
    const parsed = parseReviewMetricsStrict(doc);
    expect(parsed).toMatchObject({ round: 2, cumulativeSpend: 10, lenses: ['a'], consecutiveTestFailures: 2, testFailureAttemptIds: ['id-1', 'id,2'] });
  });

  it('omits the test fields entirely when the streak is empty (a green reset leaves no trace)', () => {
    const comment = renderReviewMetricsComment({ round: 1, consecutiveTestFailures: 0, testFailureAttemptIds: [] });
    expect(comment).toBe('<!-- prospec:review-metrics round="1" -->\n');
  });

  it.each([
    ['a non-integer count', '<!-- prospec:review-metrics round="1" test_failures="x" -->\n'],
    ['a negative count', '<!-- prospec:review-metrics round="1" test_failures="-1" -->\n'],
    ['a fractional count', '<!-- prospec:review-metrics round="1" test_failures="1.5" -->\n'],
    ['an empty id token', '<!-- prospec:review-metrics round="1" test_failures="1" test_failure_ids="a,,b" -->\n'],
    ['ids without a count', '<!-- prospec:review-metrics round="1" test_failure_ids="a" -->\n'],
    ['duplicate metrics comments', '<!-- prospec:review-metrics round="1" -->\n# R\n<!-- prospec:review-metrics round="2" -->\n'],
  ])('the strict parser refuses %s with a repair hint, the lenient one degrades', (_n, doc) => {
    expect(() => parseReviewMetricsStrict(doc)).toThrow(PrerequisiteError);
    expect(() => parseReviewMetricsStrict(doc)).toThrow(/review-metrics/);
    expect(() => parseReviewMetrics(doc)).not.toThrow();
  });

  describe('reduceTestFailureStreak — distinct observed failed attempts, bounded by the effective threshold', () => {
    const failed = (attemptId: string) => ({ kind: 'failed' as const, attemptId });
    it('counts distinct ids up to the default threshold of three and saturates there', () => {
      let s = EMPTY_TEST_FAILURE_STREAK;
      s = reduceTestFailureStreak(s, failed('a'), 3);
      s = reduceTestFailureStreak(s, failed('b'), 3);
      expect(s).toEqual({ consecutiveTestFailures: 2, testFailureAttemptIds: ['a', 'b'] });
      s = reduceTestFailureStreak(s, failed('c'), 3);
      expect(s).toEqual({ consecutiveTestFailures: 3, testFailureAttemptIds: ['a', 'b', 'c'] });
      s = reduceTestFailureStreak(s, failed('d'), 3);
      expect(s).toEqual({ consecutiveTestFailures: 3, testFailureAttemptIds: ['b', 'c', 'd'] });
    });

    it('does not increment on a replayed id, including an older id still retained in the streak', () => {
      let s = EMPTY_TEST_FAILURE_STREAK;
      s = reduceTestFailureStreak(s, failed('a'), 3);
      s = reduceTestFailureStreak(s, failed('b'), 3);
      const before = s;
      expect(reduceTestFailureStreak(s, failed('b'), 3)).toEqual(before);
      expect(reduceTestFailureStreak(s, failed('a'), 3)).toEqual(before);
    });

    it('uses the effective threshold, not a hardcoded three: four distinct ids reach four', () => {
      let s = EMPTY_TEST_FAILURE_STREAK;
      for (const id of ['a', 'b', 'c']) s = reduceTestFailureStreak(s, failed(id), 4);
      expect(s.consecutiveTestFailures).toBe(3);
      s = reduceTestFailureStreak(s, failed('d'), 4);
      expect(s).toEqual({ consecutiveTestFailures: 4, testFailureAttemptIds: ['a', 'b', 'c', 'd'] });
    });

    it('a fresh certified green clears the streak; a non-failure observation leaves it alone', () => {
      let s = EMPTY_TEST_FAILURE_STREAK;
      s = reduceTestFailureStreak(s, failed('a'), 3);
      expect(reduceTestFailureStreak(s, { kind: 'none' }, 3)).toEqual(s);
      expect(reduceTestFailureStreak(s, { kind: 'green' }, 3)).toEqual(EMPTY_TEST_FAILURE_STREAK);
    });
  });

  describe('replaceReviewMetrics — the one metrics splice both paths share', () => {
    // A hand-written legacy table the canonical renderer would normalize: a whole-file
    // rebuild changes these bytes, an in-place splice must not.
    const legacy = '<!-- prospec:review-metrics round="1" cumulative_spend="7" lenses="x" -->\n# Review Findings: c\n\nprose   with   odd spacing\n\n| Location | Severity |   Lens | Status | Summary |\n|---|---|---|---|---|\n| a.ts:1 |   critical | correctness | open | bug |\n\ntrailing note\n';

    it('rewrites only the metrics comment: bytes outside it and the non-test metric values are preserved', () => {
      const out = replaceReviewMetrics(legacy, { consecutiveTestFailures: 1, testFailureAttemptIds: ['a'] });
      const [commentOut, ...restOut] = out.split('\n');
      const [, ...restIn] = legacy.split('\n');
      expect(restOut).toEqual(restIn);
      expect(commentOut).toContain('round="1"');
      expect(commentOut).toContain('cumulative_spend="7"');
      expect(commentOut).toContain('lenses="x"');
      expect(commentOut).toContain('test_failures="1"');
      expect(renderReviewDocument(legacy, parseReviewDocument(legacy).rows, 'c')).not.toBe(legacy);
    });

    it('creates a metrics-only document when review.md is absent, which a later merge parses as its first round', () => {
      const created = replaceReviewMetrics('', { consecutiveTestFailures: 1, testFailureAttemptIds: ['a'] });
      expect(created).toBe('<!-- prospec:review-metrics test_failures="1" test_failure_ids="a" -->\n');
      expect(parseReviewMetricsStrict(created).round).toBeUndefined();
      expect(parseReviewDocument(created).rows).toEqual([]);
      const merged = renderReviewDocument(created, mergeFindings([], [finding({ id: 'F-1', location: 'a.ts:1', summary: 's' })], 1), 'c', { round: 1, consecutiveTestFailures: 0, testFailureAttemptIds: [] });
      expect(merged).toContain('round="1"');
      expect(merged).not.toContain('test_failures');
    });

    it('prepends a comment to a document that never had one without touching its bytes', () => {
      const plain = '# Review Findings: c\n\nprose\n';
      const out = replaceReviewMetrics(plain, { consecutiveTestFailures: 2, testFailureAttemptIds: ['a', 'b'] });
      expect(out).toBe('<!-- prospec:review-metrics test_failures="2" test_failure_ids="a,b" -->\n' + plain);
    });
  });

  describe('applyCleanReviewSentence (REQ-LIB-081, REQ-TESTS-121)', () => {
    const tableScaffold = `# Review Findings: add-widget\n\n| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |\n|---|---|---|---|---|---|---|---|\n`;

    it('wraps non-empty sentence in clean markers below the document', () => {
      const sentence = '本輪審查未發現任何重大問題。';
      const out = applyCleanReviewSentence(tableScaffold, sentence);
      expect(out).toContain(REVIEW_CLEAN_START_MARKER);
      expect(out).toContain(REVIEW_CLEAN_END_MARKER);
      expect(out).toContain(sentence);
      expect(out.endsWith(`${REVIEW_CLEAN_START_MARKER}\n${sentence}\n${REVIEW_CLEAN_END_MARKER}\n`)).toBe(true);
    });

    it('is byte-idempotent when applied repeatedly (after position)', () => {
      const sentence = '本輪審查未發現任何重大問題。';
      const once = applyCleanReviewSentence(tableScaffold, sentence);
      const twice = applyCleanReviewSentence(once, sentence);
      const thrice = applyCleanReviewSentence(twice, sentence);
      expect(twice).toBe(once);
      expect(thrice).toBe(once);
    });

    it('is byte-idempotent when existing clean block was located in before position', () => {
      const sentence = '本輪審查未發現任何重大問題。';
      const docWithCleanBefore = `# Review Findings: add-widget\n\n${REVIEW_CLEAN_START_MARKER}\n舊句子\n${REVIEW_CLEAN_END_MARKER}\n\n<!-- prospec:evidence-section -->\n## Evidence\n<!-- prospec:evidence-section-end -->\n`;
      const once = applyCleanReviewSentence(docWithCleanBefore, sentence);
      expect(once).not.toContain('舊句子');
      expect(once.endsWith(`${REVIEW_CLEAN_START_MARKER}\n${sentence}\n${REVIEW_CLEAN_END_MARKER}\n`)).toBe(true);
      const twice = applyCleanReviewSentence(once, sentence);
      expect(twice).toBe(once);
    });

    it('returns document unchanged when sentence is undefined or empty/whitespace', () => {
      expect(applyCleanReviewSentence(tableScaffold, undefined)).toBe(tableScaffold);
      expect(applyCleanReviewSentence(tableScaffold, '')).toBe(tableScaffold);
      expect(applyCleanReviewSentence(tableScaffold, '   \n  ')).toBe(tableScaffold);
    });
  });

  describe('stripCleanReviewBlock (F-6: no over-reach on quoted markers)', () => {
    const tableScaffold = `# Review Findings: add-widget\n\n| ID | Location | Severity | Lens | Status | Origin | Summary | Repro |\n|---|---|---|---|---|---|---|---|\n`;

    it('removes a real single-line clean block and its surrounding blank lines', () => {
      const doc = `${tableScaffold}\n${REVIEW_CLEAN_START_MARKER}\n本輪審查未發現任何問題。\n${REVIEW_CLEAN_END_MARKER}\n`;
      const out = stripCleanReviewBlock(doc);
      expect(out).not.toContain(REVIEW_CLEAN_START_MARKER);
      expect(out).not.toContain('本輪審查未發現任何問題。');
      expect(out).toContain('| ID | Location |');
    });

    it('leaves a findings doc untouched when the start marker only appears QUOTED in evidence prose', () => {
      const doc = `${tableScaffold}| F-1 | a.ts:1 | major | x | open | 1 | s |  |\n\n<!-- prospec:evidence-section -->\n## Evidence\n\n### F-1\n\n此修復用 ${REVIEW_CLEAN_START_MARKER} 標記包住 clean 句。\n<!-- prospec:evidence-section-end -->\n`;
      expect(stripCleanReviewBlock(doc)).toBe(doc);
    });

    it('does not swallow the evidence-section-end marker when a start marker on its own line has multi-line content before a far end', () => {
      // start marker on its own line + multi-line evidence body + a far end marker: the
      // multi-line-greedy body of the old regex would span this and delete the
      // evidence-section-end marker between them. A single-line body cannot.
      const doc = `${tableScaffold}\n<!-- prospec:evidence-section -->\n## Evidence\n\n### F-1\n\n${REVIEW_CLEAN_START_MARKER}\n第一行\n第二行\n<!-- prospec:evidence-section-end -->\n\n審查者附註\n${REVIEW_CLEAN_END_MARKER}\n`;
      const out = stripCleanReviewBlock(doc);
      expect(out).toBe(doc);
      expect(out).toContain('<!-- prospec:evidence-section-end -->');
    });
  });
});
