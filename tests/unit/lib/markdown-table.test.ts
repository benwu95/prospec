import { describe, it, expect } from 'vitest';
import {
  splitTableRow,
  isSeparatorRow,
  findTable,
  escapeTableCell,
  renderMarkdownTable,
  replaceTableInDocument,
  type FindTableOptions,
} from '../../../src/lib/markdown-table.js';

const anyTable: FindTableOptions = { isTarget: () => true };

describe('splitTableRow', () => {
  it('splits a framed row into trimmed cells', () => {
    expect(splitTableRow('| a | b | c |')).toEqual(['a', 'b', 'c']);
  });

  it('unescapes \\| back to a literal pipe instead of shearing the cell', () => {
    expect(splitTableRow('| uses a \\| pipe | b |')).toEqual(['uses a | pipe', 'b']);
  });

  it('keeps a trailing escaped pipe as cell content (only an unescaped frame pipe is stripped)', () => {
    expect(splitTableRow('| a | trailing\\|')).toEqual(['a', 'trailing|']);
  });
});

describe('escapeTableCell / splitTableRow inverse', () => {
  it('round-trips pipes and newlines through render → split', () => {
    const cells = ['union A | B mishandled (a || b)', 'multi\nline'];
    const row = `| ${cells.map(escapeTableCell).join(' | ')} |`;
    expect(splitTableRow(row)).toEqual(['union A | B mishandled (a || b)', 'multi line']);
  });
});

describe('isSeparatorRow', () => {
  it('accepts the ---/aligned separator shapes and rejects data rows', () => {
    expect(isSeparatorRow('|---|---|')).toBe(true);
    expect(isSeparatorRow('|-----|:---|')).toBe(true);
    expect(isSeparatorRow('| a | b |')).toBe(false);
    expect(isSeparatorRow('')).toBe(false);
  });
});

describe('findTable', () => {
  const doc = [
    'Prose before.',
    '',
    '| Location | Severity |',
    '|---|---|',
    '| a.ts:1 | major |',
    '',
    '| key | frequency |',
    '|---|---|',
    '| k1 | 1 |',
    '',
    '| k2 | 2 |',
    '',
    'Prose after.',
  ];

  it('selects the first table whose lowercased headers satisfy the predicate', () => {
    const block = findTable(doc, {
      isTarget: (h) => h.includes('key') && h.includes('frequency'),
    })!;
    expect(block.start).toBe(6);
    expect(block.headers).toEqual(['key', 'frequency']);
  });

  it('passes lowercased headers to the predicate but returns raw header cells', () => {
    const block = findTable(doc, {
      isTarget: (h) => h.includes('location') && h.includes('severity'),
    })!;
    expect(block.headers).toEqual(['Location', 'Severity']);
    expect(block.rows).toEqual([['a.ts:1', 'major']]);
  });

  it('reads a narrower table than the canonical width (legacy hand-written shape)', () => {
    const legacy = [
      '# Review',
      '',
      '| Location | Severity | Lens | Status |',
      '|---|---|---|---|',
      '| src/a.ts:12 | critical | correctness | open |',
      '',
    ];
    const block = findTable(legacy, {
      isTarget: (h) => h.includes('location') && h.includes('severity'),
    })!;
    expect(block.headers).toHaveLength(4);
    expect(block.rows).toEqual([['src/a.ts:12', 'critical', 'correctness', 'open']]);
  });

  it('stops at the first non-| line by default', () => {
    const block = findTable(doc, {
      isTarget: (h) => h.includes('key'),
    })!;
    expect(block.end).toBe(9);
    expect(block.rows).toEqual([['k1', '1']]);
  });

  it('spans blank lines inside the table and ends at the last | row when spanBlankLines is set', () => {
    const block = findTable(doc, {
      isTarget: (h) => h.includes('key'),
      spanBlankLines: true,
    })!;
    expect(block.end).toBe(11);
    expect(block.rows).toEqual([['k1', '1'], [''], ['k2', '2']]);
  });

  it('never scans past non-blank, non-| prose even when spanning blank lines', () => {
    const block = findTable(doc, {
      isTarget: (h) => h.includes('key'),
      spanBlankLines: true,
    })!;
    expect(doc.slice(block.end).join('\n')).toContain('Prose after.');
  });

  it('returns null when no table matches', () => {
    expect(findTable(['no table here'], anyTable)).toBeNull();
  });
});

describe('renderMarkdownTable', () => {
  it('renders header, --- separator, and escaped body rows', () => {
    const table = renderMarkdownTable(['A', 'B'], [['plain', 'has | pipe']]);
    expect(table).toBe(['| A | B |', '|---|---|', '| plain | has \\| pipe |'].join('\n'));
  });
});

describe('replaceTableInDocument', () => {
  const table = renderMarkdownTable(['key', 'frequency'], [['k1', '2']]);
  const options = {
    isTarget: (h: string[]) => h.includes('key') && h.includes('frequency'),
    scaffoldTitle: '# Ledger',
  };

  it('scaffolds a minimal document under the given title when content is empty', () => {
    expect(replaceTableInDocument('', table, options)).toBe(`# Ledger\n\n${table}\n`);
  });

  it('appends the table when the document has no matching table', () => {
    const doc = replaceTableInDocument('# Notes\n\njust prose\n', table, options);
    expect(doc).toBe(`# Notes\n\njust prose\n\n${table}\n`);
  });

  it('replaces the table in place, preserving prose before and after it', () => {
    const original = [
      '# Ledger',
      '',
      'Intro prose.',
      '',
      '| key | frequency |',
      '|---|---|',
      '| k1 | 1 |',
      '',
      'Trailing prose.',
    ].join('\n');
    const doc = replaceTableInDocument(original, table, options);
    expect(doc).toContain('Intro prose.');
    expect(doc).toContain('Trailing prose.');
    expect(doc).toContain('| k1 | 2 |');
    expect(doc).not.toContain('| k1 | 1 |');
  });

  it('handles a document that starts with the table (no leading prose)', () => {
    const original = ['| key | frequency |', '|---|---|', '| k1 | 1 |', ''].join('\n');
    const doc = replaceTableInDocument(original, table, options);
    expect(doc).toBe(`${table}\n`);
  });
});
