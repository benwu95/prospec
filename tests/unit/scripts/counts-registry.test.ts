import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNT_REGISTRY, REGISTRY_DOCS } from '../../../scripts/counts/registry.js';
import { readUnfoldedField } from '../../../scripts/counts/yaml-field.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Number of capture groups in a regex, via the empty-alternation trick. */
function groupCount(re: RegExp): number {
  return new RegExp(`${re.source}|`).exec('')!.length - 1;
}

const allOccurrences = COUNT_REGISTRY.flatMap((e) =>
  e.occurrences.map((occ) => ({ key: e.key, occ })),
);
const WEBSITE_COUNT_DOCS = ['docs/index.html', 'docs/i18n.js'] as const;

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
  it.each(['tests.total', 'tests.passed', 'tests.skipped'] as const)(
    '%s owns one narrow target in each website language source',
    (key) => {
      const entry = COUNT_REGISTRY.find((candidate) => candidate.key === key);
      expect(entry, `${key} registry entry exists`).toBeDefined();
      for (const doc of WEBSITE_COUNT_DOCS) {
        expect(
          entry!.occurrences.filter((occurrence) => occurrence.doc === doc),
          `${key} @ ${doc}`,
        ).toHaveLength(1);
      }
    },
  );

  // Each whitelisted anchor must resolve against the CURRENT repo docs — a
  // missing match means the registry drifted from the doc (renamed heading,
  // moved count) and the tool would silently miss that spot.
  it.each(allOccurrences.map(({ key, occ }) => [`${key} @ ${occ.doc}`, occ] as const))(
    'anchor resolves and captures a number: %s',
    (_label, occ) => {
      const content = readFileSync(path.join(REPO_ROOT, occ.doc), 'utf-8');

      // A field-scoped occurrence resolves against its YAML value the same way
      // the rewriter does (unfolded), not against a single line.
      if (occ.field !== undefined) {
        const value = readUnfoldedField(content, occ.doc, occ.field);
        expect(value, `field ${occ.field.module}.${occ.field.key} exists`).not.toBeNull();
        const m = occ.anchor.exec(value!);
        expect(m, 'anchor matches the unfolded field value').not.toBeNull();
        expect(m![1], 'captured group is a (optionally comma-grouped) number').toMatch(/^[\d,]+$/);
        // Exactly one match — the field rewriter is single-shot (one `exec`), so a
        // phrase that occurs twice in the value would leave the second stale while
        // `--check` re-reads the first and reports "in sync".
        const all = value!.match(new RegExp(occ.anchor.source, 'g')) ?? [];
        expect(all.length, `anchor matched ${all.length} spots in the field value`).toBe(1);
        return;
      }

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

  it('every index.md count occurrence has a module-map twin (index.md is generated from it)', () => {
    // Without the twin, `prospec knowledge update` regenerates the auto block from
    // module-map and reverts the count `pnpm counts` just fixed.
    for (const entry of COUNT_REGISTRY) {
      const docs = entry.occurrences.map((o) => o.doc);
      if (!docs.includes('prospec/index.md')) continue;
      expect(
        entry.occurrences.some(
          (o) => o.doc === 'prospec/ai-knowledge/module-map.yaml' && o.field !== undefined,
        ),
        `${entry.key} has an index.md occurrence but no field-scoped module-map twin`,
      ).toBe(true);
    }
  });
});
