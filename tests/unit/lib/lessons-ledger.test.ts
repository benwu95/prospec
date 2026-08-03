import { describe, it, expect } from 'vitest';
import {
  parseLedger,
  upsertLesson,
  scoreLessons,
  renderLedgerDocument,
  expiredPlaybookEntries,
  DEFAULT_SCORE_THRESHOLDS,
  type LedgerEntry,
} from '../../../src/lib/lessons-ledger.js';
import type { LessonInput } from '../../../src/types/station.js';

/** The exact row shape the promotion-format reference documents. */
const REAL_LEDGER = [
  '# Lessons Ledger',
  '',
  '> Keyed by a deterministic signature so counting is reproducible.',
  '',
  '| key | description | frequency | impact_modules | kind | source_changes | status |',
  '|-----|-------------|-----------|----------------|------|----------------|--------|',
  '| test/toContain-false-green | section-scope contract slices + mutation-verify | 3 | 2 (templates,tests) | convention | add-output-contract, add-entry-exit-gates, add-review-fix-loop | suggest-promote |',
  '| fix/rework-misses-parallel-site | 修 fix 漏掉平行位置 | 2 | 1 (lib) | playbook | enforce-metadata-schema, add-mcp-server | personal |',
  '',
].join('\n');

const lesson = (over: Partial<LessonInput> = {}): LessonInput => ({
  key: 'fix/rework-misses-parallel-site',
  description: 'a fix must sweep its parallel sites',
  kind: 'playbook',
  source_change: 'restore-cli-first',
  impact_modules: ['services'],
  ...over,
});

describe('parseLedger', () => {
  it('parses the promotion-format table shape (round-trip fidelity)', () => {
    const entries = parseLedger(REAL_LEDGER);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      key: 'test/toContain-false-green',
      description: 'section-scope contract slices + mutation-verify',
      frequency: 3,
      impactModules: ['templates', 'tests'],
      kind: 'convention',
      sourceChanges: ['add-output-contract', 'add-entry-exit-gates', 'add-review-fix-loop'],
      status: 'suggest-promote',
    });
  });

  it('returns [] for a file with no ledger table', () => {
    expect(parseLedger('# Empty\n\nno table here\n')).toEqual([]);
  });
});

describe('upsertLesson', () => {
  it('creates a new personal entry at frequency 1', () => {
    const { entries, action } = upsertLesson([], lesson({ key: 'new/lesson' }));
    expect(action).toBe('created');
    expect(entries[0]).toMatchObject({
      key: 'new/lesson',
      frequency: 1,
      status: 'personal',
      sourceChanges: ['restore-cli-first'],
    });
  });

  it('increments frequency only for a DISTINCT source change, and unions modules', () => {
    const base = parseLedger(REAL_LEDGER);
    const { entries, action } = upsertLesson(base, lesson());
    expect(action).toBe('incremented');
    const row = entries.find((e) => e.key === 'fix/rework-misses-parallel-site')!;
    expect(row.frequency).toBe(3);
    expect(row.sourceChanges).toContain('restore-cli-first');
    expect(row.impactModules).toEqual(['lib', 'services']);
  });

  it('is idempotent for an already-recorded source change (counter never double-counts)', () => {
    const base = parseLedger(REAL_LEDGER);
    const once = upsertLesson(base, lesson());
    const twice = upsertLesson(once.entries, lesson());
    expect(twice.action).toBe('unchanged');
    expect(twice.entries.find((e) => e.key === lesson().key)!.frequency).toBe(3);
  });

  it('keeps the ledger description and kind, warning on a kind mismatch', () => {
    const base = parseLedger(REAL_LEDGER);
    const { entries, warnings } = upsertLesson(base, lesson({ kind: 'constitution' }));
    const row = entries.find((e) => e.key === lesson().key)!;
    expect(row.kind).toBe('playbook');
    expect(row.description).toBe('修 fix 漏掉平行位置');
    expect(warnings[0]).toContain('kind mismatch');
  });

  it('does not mutate the input entries', () => {
    const base = parseLedger(REAL_LEDGER);
    upsertLesson(base, lesson());
    expect(base.find((e) => e.key === lesson().key)!.frequency).toBe(2);
  });

  // Staleness Sweep guarantee, mechanized: the archive Phase 4.5 harvest runs
  // unattended, so "a retired row is never re-opened" cannot rest on the agent
  // reading the sweep rules.
  const retiredRow = (): LedgerEntry[] => [
    {
      key: 'fix/rework-misses-parallel-site',
      description: '根因已消滅 ｜ **Retired**: 2026-07-04',
      frequency: 2,
      impactModules: ['lib'],
      kind: 'playbook',
      sourceChanges: ['enforce-metadata-schema', 'add-mcp-server'],
      status: 'retired',
    },
  ];

  it('refuses to raise a RETIRED row: no frequency, no unioned metadata, and it says so', () => {
    const { entries, action, warnings } = upsertLesson(retiredRow(), lesson());
    const row = entries.find((e) => e.key === lesson().key)!;
    expect(action).toBe('unchanged');
    expect(row.frequency).toBe(2);
    expect(row.sourceChanges).toEqual(['enforce-metadata-schema', 'add-mcp-server']);
    expect(row.impactModules).toEqual(['lib']);
    expect(row.status).toBe('retired');
    expect(warnings.join(' ')).toContain('retired row fix/rework-misses-parallel-site');
  });

  it('still increments the same row when it is NOT retired (the refusal keys on status)', () => {
    const live = retiredRow().map((e) => ({ ...e, status: 'promoted' as const }));
    const { entries, action, warnings } = upsertLesson(live, lesson());
    const row = entries.find((e) => e.key === lesson().key)!;
    expect(action).toBe('incremented');
    expect(row.frequency).toBe(3);
    expect(row.sourceChanges).toContain('restore-cli-first');
    expect(warnings.join(' ')).not.toContain('retired row');
  });
});

describe('scoreLessons', () => {
  it('promotes personal → suggest-promote when freq≥3 ∧ modules≥2, with an audit string', () => {
    const base = parseLedger(REAL_LEDGER);
    const upserted = upsertLesson(base, lesson()).entries; // freq 2→3, modules 1→2
    const { entries, suggestions } = scoreLessons(upserted);
    const row = entries.find((e) => e.key === lesson().key)!;
    expect(row.status).toBe('suggest-promote');
    const detail = suggestions.find((s) => s.key === lesson().key)!.detail;
    expect(detail).toBe(
      'frequency=3 · impact_modules=2 · kind=playbook · rule=freq≥3 ∧ modules≥2 ⇒ suggest',
    );
  });

  it('leaves below-threshold entries personal and never touches declined/promoted/retired', () => {
    const declined: LedgerEntry = {
      key: 'x',
      description: 'd',
      frequency: 9,
      impactModules: ['a', 'b', 'c'],
      kind: 'convention',
      sourceChanges: ['c1'],
      status: 'declined',
    };
    const below: LedgerEntry = { ...declined, key: 'y', frequency: 1, status: 'personal' };
    const { entries, suggestions } = scoreLessons([declined, below]);
    expect(entries[0]!.status).toBe('declined');
    expect(entries[1]!.status).toBe('personal');
    expect(suggestions).toEqual([]);
  });

  it('respects overridden thresholds in the emitted rule string', () => {
    const entry: LedgerEntry = {
      key: 'k',
      description: 'd',
      frequency: 2,
      impactModules: ['a'],
      kind: 'convention',
      sourceChanges: ['c1', 'c2'],
      status: 'personal',
    };
    const { suggestions } = scoreLessons([entry], { frequency: 2, impact_modules: 1 });
    expect(suggestions[0]!.detail).toContain('rule=freq≥2 ∧ modules≥1 ⇒ suggest');
    expect(DEFAULT_SCORE_THRESHOLDS).toEqual({ frequency: 3, impact_modules: 2 });
  });
});

describe('renderLedgerDocument', () => {
  it('round-trips the real ledger shape bit-identically after a no-op rerender', () => {
    const entries = parseLedger(REAL_LEDGER);
    const doc1 = renderLedgerDocument(REAL_LEDGER, entries);
    const doc2 = renderLedgerDocument(doc1, parseLedger(doc1));
    expect(doc2).toBe(doc1);
    expect(doc1).toContain('# Lessons Ledger');
    expect(doc1).toContain('2 (templates,tests)');
  });

  it('scaffolds a minimal document when the file is empty', () => {
    const { entries } = upsertLesson([], lesson({ key: 'k1' }));
    const doc = renderLedgerDocument('', entries);
    expect(doc).toContain('| key | description | frequency | impact_modules | kind | source_changes | status |');
    expect(doc).toContain('| k1 |');
  });
});

describe('expiredPlaybookEntries', () => {
  const playbook = [
    '### PB-001: some rule',
    '- **TTL**: review by 2026-12-11',
    '',
    '### PB-002: another rule',
    '- **TTL**: review by 2026-06-01',
  ].join('\n');

  it('lists entries whose review-by date is before today', () => {
    expect(expiredPlaybookEntries(playbook, '2026-07-30')).toEqual([
      { entry: 'PB-002: another rule', reviewBy: '2026-06-01' },
    ]);
  });

  it('returns [] when nothing expired', () => {
    expect(expiredPlaybookEntries(playbook, '2026-01-01')).toEqual([]);
  });

  // Staleness Sweep: a retired entry's TTL is spent, so re-reporting it would
  // re-open a decision already made and the needs-review list would grow
  // monotonically with dead rules.
  const retired = [
    '## Retired Entries',
    '',
    '### PB-003: an outgrown rule',
    '- **Source**: some-change · **Criteria**: freq=3, modules=2',
    '- **TTL**: review by 2026-05-01',
    '- **RETIRED 2026-07-04** (issue #66): root cause eliminated by `pnpm counts`',
  ].join('\n');

  it('skips an entry carrying the RETIRED marker even though its TTL has passed', () => {
    expect(expiredPlaybookEntries(`${playbook}\n\n${retired}`, '2026-07-30')).toEqual([
      { entry: 'PB-002: another rule', reviewBy: '2026-06-01' },
    ]);
  });

  it('reports that same entry once the RETIRED marker is absent (the skip is the marker, not the section)', () => {
    const withoutMarker = retired
      .split('\n')
      .filter((l) => !l.startsWith('- **RETIRED'))
      .join('\n');
    expect(expiredPlaybookEntries(`${playbook}\n\n${withoutMarker}`, '2026-07-30')).toEqual([
      { entry: 'PB-002: another rule', reviewBy: '2026-06-01' },
      { entry: 'PB-003: an outgrown rule', reviewBy: '2026-05-01' },
    ]);
  });

  // The real playbook carries this shape on a LIVE entry (PB-004, retired
  // 2026-07-04 then un-retired 2026-07-28): one case-normalisation away from
  // silently dropping a live rule from the needs-review list for good.
  it('does NOT treat a retire-then-revive provenance line as a retirement', () => {
    const revived = [
      '### PB-004: un-retired and narrowed',
      '- **Source**: some-change · **Criteria**: freq=3, modules=2',
      '- **TTL**: review by 2026-05-20',
      '- **Retired 2026-07-04, UN-RETIRED and narrowed 2026-07-28** (enforce-metadata-schema)',
    ].join('\n');
    const stillReported = [{ entry: 'PB-004: un-retired and narrowed', reviewBy: '2026-05-20' }];
    const reviveLine = '- **Retired 2026-07-04, UN-RETIRED and narrowed 2026-07-28** (enforce-metadata-schema)';
    // (a) as the real file writes it — lower-case head, so case-sensitivity alone carries it
    expect(expiredPlaybookEntries(revived, '2026-07-30')).toEqual(stillReported);
    // (b) the same line after someone upper-cases the head — only the UN-RETIRED
    //     exclusion can carry this one, so it fails if that lookahead is dropped
    expect(
      expiredPlaybookEntries(
        revived.replace(reviveLine, reviveLine.replace('**Retired', '**RETIRED')),
        '2026-07-30',
      ),
    ).toEqual(stillReported);
    // (c) a lower-case `Retired` line with no UN-RETIRED at all is not the machine
    //     marker either — only the documented upper-case form retires an entry, and
    //     erring toward "still on the list" is the safe direction
    expect(
      expiredPlaybookEntries(
        revived.replace(reviveLine, '- **Retired 2026-07-04**: narrowed later, see PB-004'),
        '2026-07-30',
      ),
    ).toEqual(stillReported);
    // (d) positive control: the plain marker on its own line DOES retire the entry
    expect(
      expiredPlaybookEntries(
        revived.replace(reviveLine, '- **RETIRED 2026-07-04** (issue #66): root cause eliminated'),
        '2026-07-30',
      ),
    ).toEqual([]);
  });

  it('scopes the marker to its own entry — a live sibling past TTL is still reported', () => {
    const live = ['### PB-004: still active', '- **TTL**: review by 2026-06-15'].join('\n');
    expect(expiredPlaybookEntries(`${retired}\n\n${live}`, '2026-07-30')).toEqual([
      { entry: 'PB-004: still active', reviewBy: '2026-06-15' },
    ]);
  });
});

describe('gap-spanning table (review C3 regression)', () => {
  const GAPPED = [
    '# Lessons Ledger',
    '',
    '| key | description | frequency | impact_modules | kind | source_changes | status |',
    '|-----|-------------|-----------|----------------|------|----------------|--------|',
    '| block1/lesson | first block | 1 | 1 (lib) | playbook | change-a | personal |',
    '  ',
    '| block2/lesson | after the blank line | 2 | 2 (lib,tests) | convention | change-b, change-c | personal |',
    '',
    'Trailing prose stays outside the table.',
    '',
  ].join('\n');

  it('parses rows on BOTH sides of a blank line inside the table', () => {
    const entries = parseLedger(GAPPED);
    expect(entries.map((e) => e.key)).toEqual(['block1/lesson', 'block2/lesson']);
  });

  it('upserting a key from the second block is idempotent, never a duplicate row', () => {
    const entries = parseLedger(GAPPED);
    const { entries: next, action } = upsertLesson(entries, lesson({
      key: 'block2/lesson',
      source_change: 'change-b',
      impact_modules: [],
    }));
    expect(action).toBe('unchanged');
    expect(next.filter((e) => e.key === 'block2/lesson')).toHaveLength(1);
    const doc = renderLedgerDocument(GAPPED, next);
    expect(doc.match(/block2\/lesson/g)).toHaveLength(1);
    expect(doc).toContain('Trailing prose stays outside the table.');
  });

  it('round-trips the REAL repo ledger without duplicating or dropping keys', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const real = (fs as unknown as typeof import('node:fs')).readFileSync(
      path.resolve(__dirname, '../../../prospec/ai-knowledge/_lessons-ledger.md'),
      'utf-8',
    );
    const rawKeyCount = (real.match(/^\| (?!key \|)[^\s|]/gm) ?? []).length;
    const entries = parseLedger(real);
    expect(entries.length).toBeGreaterThanOrEqual(30);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
    expect(entries.length).toBe(rawKeyCount);
  });
});
