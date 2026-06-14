import { describe, it, expect } from 'vitest';
import {
  INDEX_TABLE_COLUMNS,
  INDEX_COLUMN,
  INDEX_TABLE_HEADER,
  INDEX_TABLE_SEPARATOR,
} from '../../../src/types/knowledge.js';

describe('canonical index-table column schema (types/knowledge)', () => {
  it('defines the 7 canonical columns in order, including Aliases', () => {
    expect(INDEX_TABLE_COLUMNS).toEqual([
      'Module',
      'Keywords',
      'Aliases',
      'Status',
      'Description',
      'Rationale',
      'Depends On',
    ]);
  });

  it('derives column indices from the column array (single source of order)', () => {
    for (const [key, name] of [
      ['MODULE', 'Module'],
      ['KEYWORDS', 'Keywords'],
      ['ALIASES', 'Aliases'],
      ['STATUS', 'Status'],
      ['DESCRIPTION', 'Description'],
      ['RATIONALE', 'Rationale'],
      ['DEPENDS_ON', 'Depends On'],
    ] as const) {
      expect(INDEX_COLUMN[key]).toBe(INDEX_TABLE_COLUMNS.indexOf(name));
    }
    // Description sits AFTER the OPT-D7 Aliases column — the latent change-story bug.
    expect(INDEX_COLUMN.DESCRIPTION).toBe(4);
  });

  it('derives header and separator from the array (change one place → all follow)', () => {
    expect(INDEX_TABLE_HEADER).toBe(`| ${INDEX_TABLE_COLUMNS.join(' | ')} |`);
    expect(INDEX_TABLE_HEADER).toContain('Aliases');
    const headerCells = INDEX_TABLE_HEADER.split('|').slice(1, -1);
    const separatorCells = INDEX_TABLE_SEPARATOR.split('|').slice(1, -1);
    expect(headerCells).toHaveLength(INDEX_TABLE_COLUMNS.length);
    expect(separatorCells).toHaveLength(INDEX_TABLE_COLUMNS.length);
  });
});
