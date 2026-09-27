import { describe, it, expect } from 'vitest';
import {
  parseLedger,
  upsertLesson,
  scoreLessons,
  renderLedgerDocument,
  expiredPlaybookEntries,
  parsePlaybookEntries,
  selectPlaybookEntries,
  splitPlaybookBlocks,
  DEFAULT_SCORE_THRESHOLDS,
  PLAYBOOK_ENTRY_TOKEN_LIMIT,
  escapedCellsFor,
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

// The `### ` entry locator is `$`-anchored while its lines come from `split('\n')`,
// so a CRLF checkout never matched a heading: `currentEntry` stayed empty, `flush()`
// returned at once, and the needs-review list came back empty however far past its
// review-by date an entry was. The Sweep's "nothing expired" then reads exactly like
// the truth.
describe('expiredPlaybookEntries line endings', () => {
  const playbook = [
    '### PB-001: some rule',
    '- **TTL**: review by 2026-12-11',
    '',
    '### PB-002: another rule',
    '- **TTL**: review by 2026-06-01',
    '',
    '### PB-003: a settled rule',
    '- **TTL**: review by 2026-05-01',
    '- **RETIRED 2026-07-04** (issue #66): root cause eliminated',
    '',
    '### PB-004: revived rule',
    '- **TTL**: review by 2026-05-20',
    '- **Retired 2026-07-04, UN-RETIRED 2026-07-28** (some-change)',
  ].join('\n');

  it('reports the same expired entries under CRLF as under LF', () => {
    const lf = expiredPlaybookEntries(playbook, '2026-07-30');
    const crlf = expiredPlaybookEntries(playbook.replace(/\n/g, '\r\n'), '2026-07-30');
    expect(crlf).toEqual(lf);
    // Anti-vacuity plus both retirement semantics: PB-002 (live, expired) and
    // PB-004 (un-retired, expired) are in; PB-001 (future) and PB-003 (retired) out.
    expect(lf).toEqual([
      { entry: 'PB-002: another rule', reviewBy: '2026-06-01' },
      { entry: 'PB-004: revived rule', reviewBy: '2026-05-20' },
    ]);
  });
});

describe('escapedCellsFor (REQ-LIB-078) — counts only the row this upsert wrote or updated', () => {
  const stored = (over: Partial<LedgerEntry> = {}): LedgerEntry => ({
    key: 'fix/rework-misses-parallel-site',
    description: 'kept | stored',
    frequency: 1,
    impactModules: ['lib'],
    kind: 'playbook',
    sourceChanges: ['c1'],
    status: 'personal',
    ...over,
  });

  it('an unchanged upsert (same source_change already recorded) counts 0 even when the INPUT carries a pipe', () => {
    // regression pin for the review critical: the stored row is untouched, so nothing was escaped on write
    const result = upsertLesson([stored()], lesson({ description: 'input | with pipe', source_change: 'c1' }));
    expect(result.action).toBe('unchanged');
    expect(escapedCellsFor(result.entries, result.action, 'fix/rework-misses-parallel-site')).toBe(0);
  });

  it('a retired row counts 0 (refused, nothing written)', () => {
    const result = upsertLesson([stored({ status: 'retired' })], lesson({ description: 'a | b', source_change: 'c9' }));
    expect(result.action).toBe('unchanged');
    expect(escapedCellsFor(result.entries, result.action, 'fix/rework-misses-parallel-site')).toBe(0);
  });

  it('an incremented upsert counts the STORED row as rendered — the stored description wins, the input one is not written', () => {
    const result = upsertLesson([stored()], lesson({ description: 'input | with pipe', source_change: 'c2' }));
    expect(result.action).toBe('incremented');
    // stored description `kept | stored` is the one cell with a pipe in the rendered row
    expect(escapedCellsFor(result.entries, result.action, 'fix/rework-misses-parallel-site')).toBe(1);
    const clean = upsertLesson([stored({ description: 'plain' })], lesson({ description: 'input | with pipe', source_change: 'c2' }));
    expect(escapedCellsFor(clean.entries, clean.action, 'fix/rework-misses-parallel-site')).toBe(0);
  });

  it('a created row counts its rendered cells', () => {
    const result = upsertLesson([], lesson({ key: 'new/key', description: 'a | b' }));
    expect(result.action).toBe('created');
    expect(escapedCellsFor(result.entries, result.action, 'new/key')).toBe(1);
    const two = upsertLesson([], lesson({ key: 'k\nk', description: 'a | b' }));
    expect(escapedCellsFor(two.entries, two.action, 'k\nk')).toBe(2);
  });
});

// REQ-LIB-094 — the playbook catalog: every active entry is listed, module
// intersection only decides whose full text is printed.
const CATALOG_PLAYBOOK = `# Team Playbook

Format:

\`\`\`markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M · **Approved-by**: {name} · **Date**: {YYYY-MM-DD}
- **TTL**: {date or "review by …"}
\`\`\`

## Entries

### PB-001: First rule
- **Source**: a, b · **Criteria**: freq=6, modules=2 (tests, templates) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13
- **TTL**: review by 2026-12-11
- **Guidance**: do the first thing.
- **Strengthened 2026-09-03** (absorbs ledger key \`k\`, freq=3, modules=2 (lib, services)) · **Approved-by**: x.

### PB-002: Second rule with trailing prose
- **Source**: c · **Criteria**: freq=1, modules=2 (lib, cli) — below the rule; early promotion · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-12
- **TTL**: review by 2026-12-12
- **Guidance**: second.

### PB-003: No module list
- **Source**: d · **Criteria**: freq=3, modules=2 · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-12
- **TTL**: review by 2027-01-01
- **Guidance**: third.
- **Strengthened 2026-09-03** (absorbs ledger key \`k2\`, freq=3, modules=2 (lib, services)) · **Approved-by**: x.
### PB-010: Services only
- **Source**: e · **Criteria**: freq=3, modules=1 (services) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-07-29
- **TTL**: review by 2027-01-29
- **Guidance**: tenth.

## Retired Entries

> Retired entries keep their id.

### PB-004: Retired rule
- **Source**: f · **Criteria**: freq=3, modules=2 (lib, tests) · **Kind**: playbook · **Approved-by**: x · **Date**: 2026-06-01
- **RETIRED 2026-08-04**: promoted to Constitution.
`;

describe('parsePlaybookEntries', () => {
  it('reads the first unfenced Stations line without changing raw text', () => {
    const content = [
      '### PB-123: Station rule',
      '- **Source**: x · **Criteria**: freq=3, modules=1 (lib) · **Kind**: playbook',
      '```md',
      '- **Stations**: archive',
      '```',
      '- **Stations**: Plan, prospec-new-story, bogus',
      '- **Stations**: verify',
      '- **TTL**: review by 2027-01-01',
    ].join('\n');
    const [entry] = parsePlaybookEntries(content);
    expect(entry).toMatchObject({ stations: ['plan', 'story', 'bogus'], retired: false });
    expect(entry?.text).toBe(content);
    expect(parsePlaybookEntries('### PB-124: empty\n- **Stations**:   ')[0]?.stations).toBeNull();
  });

  it('warns only above 300 tokens of the complete parsed entry', () => {
    expect(PLAYBOOK_ENTRY_TOKEN_LIMIT).toBe(300);
    for (const [chars, tokens, overLimit] of [[1196, 299, false], [1200, 300, false], [1204, 301, true]] as const) {
      const prefix = '### PB-125: Size\n- **Stations**: plan\n';
      const content = prefix + 'x'.repeat(chars - prefix.length);
      expect(content.length).toBe(chars);
      expect(parsePlaybookEntries(content)[0]).toMatchObject({ tokens, overLimit });
    }
  });
  it('parses one entry per PB-<digits> heading, never the template placeholder', () => {
    const entries = parsePlaybookEntries(CATALOG_PLAYBOOK);
    expect(entries.map((e) => e.id)).toEqual(['PB-001', 'PB-002', 'PB-003', 'PB-010', 'PB-004']);
    expect(entries.map((e) => e.title)).toEqual([
      'First rule',
      'Second rule with trailing prose',
      'No module list',
      'Services only',
      'Retired rule',
    ]);
  });

  it('takes modules from the Source line only — a Strengthened bullet never widens them — and trailing prose is ignored', () => {
    const byId = new Map(parsePlaybookEntries(CATALOG_PLAYBOOK).map((e) => [e.id, e]));
    expect(byId.get('PB-001')?.modules).toEqual(['tests', 'templates']);
    expect(byId.get('PB-002')?.modules).toEqual(['lib', 'cli']);
    expect(byId.get('PB-003')?.modules).toBeNull();
  });

  it('reads kind, TTL and the retirement marker, and keeps the block text verbatim without the next section heading', () => {
    const byId = new Map(parsePlaybookEntries(CATALOG_PLAYBOOK).map((e) => [e.id, e]));
    expect(byId.get('PB-001')).toMatchObject({ kind: 'convention', ttl: '2026-12-11', retired: false });
    expect(byId.get('PB-004')).toMatchObject({ kind: 'playbook', ttl: null, retired: true });
    expect(byId.get('PB-010')?.text).toBe(
      [
        '### PB-010: Services only',
        '- **Source**: e · **Criteria**: freq=3, modules=1 (services) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-07-29',
        '- **TTL**: review by 2027-01-29',
        '- **Guidance**: tenth.',
      ].join('\n'),
    );
    expect(byId.get('PB-003')?.text.endsWith('**Approved-by**: x.')).toBe(true);
  });
});

describe('selectPlaybookEntries', () => {
  it('uses station for bodies and modules only for stable catalog ordering', () => {
    const entries = parsePlaybookEntries([
      '### PB-101: A', '- **Source**: a · **Criteria**: freq=3, modules=1 (lib)', '- **Stations**: plan',
      '### PB-102: B', '- **Source**: b · **Criteria**: freq=3, modules=1 (cli)', '- **Stations**: implement',
      '### PB-103: C', '- **Source**: c · **Criteria**: freq=3, modules=1 (lib)', '- **Stations**: implement',
    ].join('\n'));
    const selection = selectPlaybookEntries(entries, { station: 'implement', modules: ['cli'] });
    expect(selection).toMatchObject({ kind: 'catalog', mode: 'station' });
    if (selection.kind !== 'catalog') return;
    expect(selection.catalog.map(({ entry, matched, bodySelected }) => [entry.id, matched, bodySelected])).toEqual([
      ['PB-102', true, true], ['PB-101', false, false], ['PB-103', false, true],
    ]);
  });

  it('does not print a module match assigned to another station', () => {
    const entries = parsePlaybookEntries([
      '### PB-111: Other station', '- **Source**: a · **Criteria**: freq=3, modules=1 (lib)', '- **Stations**: plan',
      '### PB-112: This station', '- **Source**: b · **Criteria**: freq=3, modules=1 (services)', '- **Stations**: implement',
    ].join('\n'));
    const result = selectPlaybookEntries(entries, { station: 'implement', modules: ['lib'] });
    if (result.kind !== 'catalog') throw new Error('expected catalog');
    expect(result.catalog.map((item) => [item.entry.id, item.matched, item.bodySelected])).toEqual([
      ['PB-111', true, false], ['PB-112', false, true],
    ]);
  });

  it('keeps legacy selection when all active declarations are absent', () => {
    const entries = parsePlaybookEntries(CATALOG_PLAYBOOK);
    const legacy = selectPlaybookEntries(entries, { modules: ['cli'] });
    const fallback = selectPlaybookEntries(entries, { station: 'plan', modules: ['cli'] });
    expect(fallback).toMatchObject({ kind: 'catalog', mode: 'legacy-fallback' });
    if (legacy.kind !== 'catalog' || fallback.kind !== 'catalog') return;
    expect(fallback.catalog.map(({ entry, matched }) => [entry.id, matched]))
      .toEqual(legacy.catalog.map(({ entry, matched }) => [entry.id, matched]));
    expect(fallback.catalog.map(({ bodySelected }) => bodySelected))
      .toEqual(legacy.catalog.map(({ matched }) => matched));
  });

  it('uses the active module union for station-only fallback and excludes retired entries', () => {
    const entries = parsePlaybookEntries(CATALOG_PLAYBOOK);
    const result = selectPlaybookEntries(entries, { station: 'plan' });
    if (result.kind !== 'catalog') throw new Error('expected catalog');
    expect(result.mode).toBe('legacy-fallback');
    expect(result.warnings.filter((w) => w.kind === 'fallback')).toHaveLength(1);
    expect(result.catalog.find((c) => c.entry.id === 'PB-003')?.bodySelected).toBe(false);
    expect(result.catalog.some((c) => c.entry.id === 'PB-004')).toBe(false);
  });

  it('an unknown declaration blocks fallback and warns once alongside all active over-limit entries', () => {
    const content = [
      '### PB-201: Unknown', '- **Source**: a · **Criteria**: freq=3, modules=1 (lib)', '- **Stations**: bogus, BOGUS',
      '- **Guidance**: ' + 'x'.repeat(1200),
      '### PB-202: Undeclared', '- **Source**: b · **Criteria**: freq=3, modules=1 (cli)',
      '- **Guidance**: ' + 'y'.repeat(1200),
      '## Retired Entries', '### PB-203: Retired', '- **Stations**: wrong', '- **RETIRED 2026-09-01**',
    ].join('\n');
    const entries = parsePlaybookEntries(content);
    const result = selectPlaybookEntries(entries, { station: 'plan' });
    if (result.kind !== 'catalog') throw new Error('expected catalog');
    expect(result.mode).toBe('station');
    expect(result.catalog.map((c) => [c.entry.id, c.bodySelected])).toEqual([['PB-201', false], ['PB-202', false]]);
    expect(result.warnings).toEqual([
      { kind: 'unknown-station', id: 'PB-201', token: 'bogus' },
      { kind: 'over-limit', id: 'PB-201', tokens: entries[0]?.tokens, limit: PLAYBOOK_ENTRY_TOKEN_LIMIT },
      { kind: 'over-limit', id: 'PB-202', tokens: entries[1]?.tokens, limit: PLAYBOOK_ENTRY_TOKEN_LIMIT },
    ]);
    expect(selectPlaybookEntries(entries, { id: 'PB-202' })).toMatchObject({
      kind: 'entry', warnings: [{ kind: 'over-limit', id: 'PB-202' }],
    });
  });

  it('treats empty declarations as absent and still falls back with no active entries', () => {
    const blank = parsePlaybookEntries('### PB-204: Blank\n- **Stations**:  \n- **Guidance**: keep');
    const result = selectPlaybookEntries(blank, { station: 'plan' });
    if (result.kind !== 'catalog') throw new Error('expected catalog');
    expect(result.mode).toBe('legacy-fallback');
    const empty = selectPlaybookEntries([], { station: 'plan' });
    expect(empty).toMatchObject({ kind: 'catalog', mode: 'legacy-fallback', catalog: [], warnings: [{ kind: 'fallback' }] });
  });

  const entries = parsePlaybookEntries(CATALOG_PLAYBOOK);

  it('lists every active entry, module matches first in file order, the rest after in file order', () => {
    const r = selectPlaybookEntries(entries, { modules: ['cli', 'services'] });
    expect(r.kind).toBe('catalog');
    if (r.kind !== 'catalog') return;
    expect(r.catalog.map((c) => [c.entry.id, c.matched])).toEqual([
      ['PB-002', true],
      ['PB-010', true],
      ['PB-001', false],
      ['PB-003', false],
    ]);
  });

  it('never matches an entry with no module list, and never lists a retired entry', () => {
    const r = selectPlaybookEntries(entries, { modules: ['lib', 'tests'] });
    if (r.kind !== 'catalog') throw new Error('expected a catalog');
    expect(r.catalog.find((c) => c.entry.id === 'PB-003')?.matched).toBe(false);
    expect(r.catalog.some((c) => c.entry.id === 'PB-004')).toBe(false);
    expect(r.catalog).toHaveLength(4);
  });

  it('matches the Source-line modules only, so a Strengthened modules list does not match', () => {
    const r = selectPlaybookEntries(entries, { modules: ['services'] });
    if (r.kind !== 'catalog') throw new Error('expected a catalog');
    expect(r.catalog.filter((c) => c.matched).map((c) => c.entry.id)).toEqual(['PB-010']);
  });

  it('selects exactly one active entry by id and reports an unknown or retired id as a miss', () => {
    expect(selectPlaybookEntries(entries, { id: 'PB-002' })).toMatchObject({ kind: 'entry', entry: { id: 'PB-002' } });
    expect(selectPlaybookEntries(entries, { id: 'PB-999' })).toEqual({ kind: 'miss', id: 'PB-999' });
    expect(selectPlaybookEntries(entries, { id: 'PB-004' })).toEqual({ kind: 'miss', id: 'PB-004' });
  });
});

describe('splitPlaybookBlocks', () => {
  it('splits on every ### heading, keeping raw body lines and the 1-based heading line', () => {
    const blocks = splitPlaybookBlocks('intro\n### A\nbody a\r\n### B\nbody b');
    expect(blocks).toEqual([
      { heading: 'A', lines: ['body a\r'], line: 2 },
      { heading: 'B', lines: ['body b'], line: 4 },
    ]);
  });

  it('ends a block at a # or ## heading too, so a section preamble belongs to no entry', () => {
    const blocks = splitPlaybookBlocks('### A\nbody a\n## Retired Entries\npreamble\n### B\nbody b\n# Appendix\ntail');
    expect(blocks).toEqual([
      { heading: 'A', lines: ['body a'], line: 1 },
      { heading: 'B', lines: ['body b'], line: 5 },
    ]);
  });

  it('judges headings on a fence-blanked view while keeping the fenced lines in the body', () => {
    const blocks = splitPlaybookBlocks('### A\n```sh\n# comment\n## fake\n### PB-999: fake\n```\nafter');
    expect(blocks).toEqual([{ heading: 'A', lines: ['```sh', '# comment', '## fake', '### PB-999: fake', '```', 'after'], line: 1 }]);
  });
});

// The block definition is the ONE the TTL report and the catalog both consume
// (REQ-LIB-094): the two fixtures below are exactly the shapes on which a second
// heading rule in either consumer made them disagree about retired / TTL.
describe('one playbook block definition for the TTL report and the catalog', () => {
  const fencedGuidance = [
    '### PB-001: Fenced guidance',
    '- **Source**: c · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13',
    '- **Guidance**: run',
    '```sh',
    '# comment',
    '## fake',
    '### PB-999: fake',
    '```',
    '- **TTL**: review by 2026-01-01',
    '- **RETIRED 2026-02-01**: gone.',
    '',
    '### PB-002: Live',
    '- **Source**: c · **Criteria**: freq=3, modules=1 (lib) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13',
    '- **TTL**: review by 2026-01-01',
  ].join('\n');

  it('a fenced # / ## / ### line inside Guidance neither splits nor truncates the entry: both consumers see the TTL and marker after it', () => {
    const entries = parsePlaybookEntries(fencedGuidance);
    expect(entries.map((e) => e.id)).toEqual(['PB-001', 'PB-002']);
    expect(entries[0]).toMatchObject({ retired: true, ttl: null });
    expect(entries[0]?.text).toContain('### PB-999: fake');
    expect(entries[0]?.text.endsWith('- **RETIRED 2026-02-01**: gone.')).toBe(true);
    expect(entries[1]).toMatchObject({ retired: false, ttl: '2026-01-01' });
    // the TTL report agrees: PB-001 is retired (skipped), PB-002 is live and expired
    expect(expiredPlaybookEntries(fencedGuidance, '2026-09-27')).toEqual([{ entry: 'PB-002: Live', reviewBy: '2026-01-01' }]);
  });

  const retiredPreamble = [
    '### PB-001: A',
    '- **Source**: c · **Criteria**: freq=3, modules=2 (lib, cli) · **Kind**: convention · **Approved-by**: x · **Date**: 2026-06-13',
    '- **TTL**: review by 2026-01-01',
    '- **Guidance**: g',
    '',
    '## Retired Entries',
    '- **RETIRED 2026-02-01**: preamble, not an entry',
    '',
    '### PB-002: B',
    '- **RETIRED 2026-02-01**: gone',
  ].join('\n');

  it('## Retired Entries closes the last live entry: its preamble marker retires nothing, for both consumers', () => {
    const entries = parsePlaybookEntries(retiredPreamble);
    expect(entries.map((e) => [e.id, e.retired])).toEqual([
      ['PB-001', false],
      ['PB-002', true],
    ]);
    expect(entries[0]?.text.endsWith('- **Guidance**: g')).toBe(true);
    expect(expiredPlaybookEntries(retiredPreamble, '2026-09-27')).toEqual([{ entry: 'PB-001: A', reviewBy: '2026-01-01' }]);
  });
});
