import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNT_REGISTRY, REGISTRY_DOCS } from '../../../scripts/counts/registry.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Number of capture groups in a regex, via the empty-alternation trick. */
function groupCount(re: RegExp): number {
  return new RegExp(`${re.source}|`).exec('')!.length - 1;
}

const allOccurrences = COUNT_REGISTRY.flatMap((e) =>
  e.occurrences.map((occ) => ({ key: e.key, occ })),
);

describe('COUNT_REGISTRY structure', () => {
  it('every anchor has exactly one capture group (the number span)', () => {
    for (const { key, occ } of allOccurrences) {
      expect(groupCount(occ.anchor), `${key} @ ${occ.doc}`).toBe(1);
    }
  });

  it('never touches historical narrative (ledger / archived-history / changes)', () => {
    for (const doc of REGISTRY_DOCS) {
      expect(doc).not.toMatch(/_lessons-ledger|_archived-history|\.prospec\/changes/);
    }
  });

  it('REGISTRY_DOCS is the deduped set of occurrence docs', () => {
    const fromOccurrences = [...new Set(allOccurrences.map(({ occ }) => occ.doc))];
    expect([...REGISTRY_DOCS].sort()).toEqual(fromOccurrences.sort());
  });
});

describe('COUNT_REGISTRY ⇄ docs completeness', () => {
  // Each whitelisted anchor must resolve against the CURRENT repo docs — a
  // missing match means the registry drifted from the doc (renamed heading,
  // moved count) and the tool would silently miss that spot.
  it.each(allOccurrences.map(({ key, occ }) => [`${key} @ ${occ.doc}`, occ] as const))(
    'anchor resolves and captures a number: %s',
    (_label, occ) => {
      const content = readFileSync(path.join(REPO_ROOT, occ.doc), 'utf-8');
      const lines = content.split('\n');
      const hits = lines.filter((l) => occ.anchor.test(l));
      // Exactly one line — `applyCounts` rewrites the captured span on EVERY
      // matching line, so an anchor that matched two lines (e.g. a future doc
      // edit re-using the phrase) would silently overwrite an unintended number.
      expect(hits.length, `anchor matched ${hits.length} lines`).toBe(1);
      const m = occ.anchor.exec(hits[0]!)!;
      expect(m[1], 'captured group is a (optionally comma-grouped) number').toMatch(/^[\d,]+$/);
    },
  );
});
