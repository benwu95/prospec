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
