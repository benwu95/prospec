import { describe, it, expect } from 'vitest';
import {
  buildIndexRow,
  buildIndexTable,
  backfillCuratedFromIndex,
  EMPTY_CELL,
} from '../../../src/lib/index-table.js';
import { INDEX_TABLE_HEADER, INDEX_TABLE_SEPARATOR, INDEX_COLUMN } from '../../../src/types/knowledge.js';
import type { ModuleMap } from '../../../src/types/module-map.js';

const cellsOf = (row: string): string[] => row.split('|').slice(1, -1).map((c) => c.trim());

describe('buildIndexRow', () => {
  const full = {
    name: 'types',
    status: 'Active',
    description: 'Zod schemas',
    keywords: ['config', 'schema'],
    aliases: ['型別', 'type defs'],
    rationale: 'Leaf module',
    dependsOn: ['lib', 'services'],
  };

  it('places every column by the canonical schema position', () => {
    const c = cellsOf(buildIndexRow(full));
    expect(c[INDEX_COLUMN.MODULE]).toBe('**types**');
    expect(c[INDEX_COLUMN.KEYWORDS]).toBe('config, schema');
    expect(c[INDEX_COLUMN.ALIASES]).toBe('型別, type defs');
    expect(c[INDEX_COLUMN.STATUS]).toBe('Active');
    expect(c[INDEX_COLUMN.DESCRIPTION]).toBe('Zod schemas');
    expect(c[INDEX_COLUMN.RATIONALE]).toBe('Leaf module');
    expect(c[INDEX_COLUMN.DEPENDS_ON]).toBe('lib, services');
  });

  it('renders an absent curated column as the empty-cell placeholder (mutation guard)', () => {
    // Clearing each curated field must surface as `—` in its cell — a positive
    // assertion above + this negative make the row builder mutation-verified.
    const cleared = cellsOf(buildIndexRow({ ...full, keywords: [], aliases: undefined, rationale: '', dependsOn: [] }));
    expect(cleared[INDEX_COLUMN.KEYWORDS]).toBe(EMPTY_CELL);
    expect(cleared[INDEX_COLUMN.ALIASES]).toBe(EMPTY_CELL);
    expect(cleared[INDEX_COLUMN.RATIONALE]).toBe(EMPTY_CELL);
    expect(cleared[INDEX_COLUMN.DEPENDS_ON]).toBe(EMPTY_CELL);
    // non-curated columns still render
    expect(cleared[INDEX_COLUMN.MODULE]).toBe('**types**');
    expect(cleared[INDEX_COLUMN.STATUS]).toBe('Active');
  });
});

describe('buildIndexTable', () => {
  it('emits the canonical header + separator then one row per module', () => {
    const table = buildIndexTable([
      { name: 'a', status: 'Active', description: 'A' },
      { name: 'b', status: 'Active', description: 'B' },
    ]);
    const lines = table.split('\n');
    expect(lines[0]).toBe(INDEX_TABLE_HEADER);
    expect(lines[1]).toBe(INDEX_TABLE_SEPARATOR);
    expect(lines[2]).toContain('**a**');
    expect(lines[3]).toContain('**b**');
    expect(lines).toHaveLength(4);
  });
});

describe('backfillCuratedFromIndex', () => {
  const indexWith = (row: string): string =>
    `<!-- prospec:auto-start -->\n${INDEX_TABLE_HEADER}\n${INDEX_TABLE_SEPARATOR}\n${row}\n<!-- prospec:auto-end -->`;

  const curatedRow =
    '| **types** | kw1, kw2 | 別名1, 別名2 | Active | Rich curated description | Leaf rationale | — |';

  const bareMap = (): ModuleMap => ({
    modules: [{ name: 'types', paths: ['src/types'], keywords: [], relationships: { depends_on: [] } }],
  });

  it('seeds empty module-map curated fields from the index (keywords/aliases/rationale/description)', () => {
    const { moduleMap, changed } = backfillCuratedFromIndex(indexWith(curatedRow), bareMap());
    expect(changed).toBe(true);
    const t = moduleMap.modules[0]!;
    expect(t.keywords).toEqual(['kw1', 'kw2']);
    expect(t.aliases).toEqual(['別名1', '別名2']);
    expect(t.rationale).toBe('Leaf rationale');
    expect(t.description).toBe('Rich curated description');
  });

  it('never overwrites a non-empty module-map value (no-clobber)', () => {
    const preset: ModuleMap = {
      modules: [
        {
          name: 'types',
          paths: ['src/types'],
          keywords: ['existing-kw'],
          description: 'existing desc',
          relationships: { depends_on: [] },
        },
      ],
    };
    const { moduleMap, changed } = backfillCuratedFromIndex(indexWith(curatedRow), preset);
    const t = moduleMap.modules[0]!;
    // keywords + description are already curated → untouched
    expect(t.keywords).toEqual(['existing-kw']);
    expect(t.description).toBe('existing desc');
    // aliases + rationale were empty → filled
    expect(t.aliases).toEqual(['別名1', '別名2']);
    expect(t.rationale).toBe('Leaf rationale');
    expect(changed).toBe(true);
  });

  it('is idempotent — a second run over its own output reports no change', () => {
    const first = backfillCuratedFromIndex(indexWith(curatedRow), bareMap());
    expect(first.changed).toBe(true);
    const second = backfillCuratedFromIndex(indexWith(curatedRow), first.moduleMap);
    expect(second.changed).toBe(false);
    expect(second.moduleMap).toEqual(first.moduleMap);
  });

  it('does not backfill relationships.depends_on from the index Depends On column', () => {
    // The index Depends On column can carry display shorthands ("all"); it must
    // never pollute the drift-enforced relationships.depends_on.
    const rowWithDeps =
      '| **types** | kw | — | Active | desc | rat | all |';
    const { moduleMap } = backfillCuratedFromIndex(indexWith(rowWithDeps), bareMap());
    expect(moduleMap.modules[0]!.relationships?.depends_on).toEqual([]);
  });

  it('leaves a module absent from the index untouched', () => {
    const map: ModuleMap = {
      modules: [{ name: 'ghost', paths: ['src/ghost'], keywords: [] }],
    };
    const { changed } = backfillCuratedFromIndex(indexWith(curatedRow), map);
    expect(changed).toBe(false);
  });
});
