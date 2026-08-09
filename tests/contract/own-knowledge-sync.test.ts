import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAllModules } from '../../src/services/knowledge-update.service.js';
import { buildIndexRow } from '../../src/lib/index-table.js';
import { INDEX_TABLE_COLUMNS } from '../../src/types/knowledge.js';
import type { KnowledgeUpdateResult } from '../../src/services/knowledge-update.service.js';

/**
 * `prospec/index.md`'s module table is GENERATED from `module-map.yaml`. Anything
 * that lives only in the generated file — a count `pnpm counts` refreshed, a
 * keyword curated in the table — is reverted the next time
 * `prospec knowledge update` rebuilds the auto block.
 *
 * This guard rebuilds the table through the production path (`collectAllModules`
 * + `buildIndexRow` — never a second projection of the same mapping) and pins
 * that regeneration is a no-op for this repo's own knowledge base.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE_MAP = path.join(REPO_ROOT, 'prospec/ai-knowledge/module-map.yaml');
const INDEX = path.join(REPO_ROOT, 'prospec/index.md');

const EMPTY_RESULT: KnowledgeUpdateResult = {
  created: [],
  updated: [],
  deprecated: [],
  readmePending: [],
  generatedFiles: [],
  warnings: [],
  sweptFiles: [],
};

/** Module name → its rendered row, as `prospec knowledge update` would write it. */
function expectedRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const m of collectAllModules(EMPTY_RESULT, MODULE_MAP)) {
    rows.set(m.name.toLowerCase(), buildIndexRow(m));
  }
  return rows;
}

/** Module name → its row as it currently stands inside index.md's auto block. */
function actualRows(): Map<string, string> {
  const content = readFileSync(INDEX, 'utf-8');
  const auto = content.slice(
    content.indexOf('<!-- prospec:auto-start -->'),
    content.indexOf('<!-- prospec:auto-end -->'),
  );
  expect(auto.length, 'index.md has a prospec:auto block').toBeGreaterThan(0);

  const rows = new Map<string, string>();
  for (const line of auto.split('\n')) {
    const name = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|/);
    if (name) rows.set(name[1]!.trim().toLowerCase(), line);
  }
  return rows;
}

function cells(row: string): string[] {
  return row.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

describe('own knowledge base: index.md is in sync with module-map.yaml', () => {
  it('covers exactly the same modules on both sides', () => {
    const expected = expectedRows();
    // A both-sides-empty comparison would satisfy the set assertion while nothing
    // was compared (module-map parse failure returns [] via collectAllModules'
    // catch, and the per-row `it.each` then registers zero cases).
    expect(expected.size, 'module-map.yaml yielded modules').toBeGreaterThan(5);
    expect([...actualRows().keys()].sort()).toEqual([...expected.keys()].sort());
  });

  it.each([...expectedRows().keys()])(
    'regenerating the %s row from module-map is a no-op',
    (module) => {
      const expectedRow = expectedRows().get(module)!;
      const actualRow = actualRows().get(module)!;
      if (expectedRow === actualRow) return;

      // Name the diverging column so the failure says WHAT drifted, not just
      // that the row differs — a count in `Description`, a curated `Keywords`
      // cell, etc. The next `prospec knowledge update` would revert it.
      const [want, got] = [cells(expectedRow), cells(actualRow)];
      const drift = INDEX_TABLE_COLUMNS.map((col, i) => ({ col, want: want[i], got: got[i] }))
        .filter((d) => d.want !== d.got)
        .map((d) => `${d.col}: module-map has "${d.want}" but index.md has "${d.got}"`)
        .join('\n');
      expect.fail(
        `${module} row diverges from its module-map source (index.md is generated from it):\n${drift}`,
      );
    },
  );
});
