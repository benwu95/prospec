import { isMap, isScalar, isSeq } from 'yaml';
import type { Node } from 'yaml';
import { parseYamlDocument } from '../../src/lib/yaml-utils.js';
import { renderCount, type ResolvedOccurrence } from './rewrite.js';
import type { CountChange, YamlFieldScope } from './types.js';

/**
 * Field-scoped counterpart to `applyCounts` (which is line-scoped).
 *
 * `module-map.yaml` is the SOURCE `prospec/index.md`'s module table is generated
 * from, so its counted descriptions must be maintained too — otherwise the next
 * `prospec knowledge update` reverts every count `pnpm counts` fixed in the
 * generated file. YAML folds a long description across lines at arbitrary
 * spaces, so a line-scoped anchor misses a phrase that straddles a fold.
 *
 * This rewriter locates the field's scalar node, matches the anchor against the
 * value's UNFOLDED projection, and then rewrites only the matched number span at
 * its original offset — the document is never re-serialized, so line wrapping,
 * comments, and every untouched byte survive exactly (no reflow churn).
 */

/** Locate `modules[name=<module>].<key>`'s scalar node in a parsed document. */
function findFieldNode(content: string, doc: string, scope: YamlFieldScope): Node | null {
  const modules = parseYamlDocument(content, doc).get('modules');
  if (!isSeq(modules)) return null;

  for (const item of modules.items) {
    if (!isMap(item)) continue;
    const name = item.get('name');
    if (typeof name !== 'string' || name.toLowerCase() !== scope.module.toLowerCase()) continue;
    const node = item.get(scope.key, true);
    return isScalar(node) ? (node as Node) : null;
  }
  return null;
}

/**
 * Unfold a raw YAML scalar's source text: a newline plus its continuation indent
 * becomes one space. Returns the projection plus, per projected character, the
 * offset it came from — so a match found in the projection maps back exactly.
 */
function unfold(raw: string): { text: string; offsets: number[] } {
  let text = '';
  const offsets: number[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === '\n') {
      let j = i + 1;
      while (j < raw.length && (raw[j] === ' ' || raw[j] === '\t')) j++;
      text += ' ';
      offsets.push(i);
      i = j;
    } else {
      text += raw[i];
      offsets.push(i);
      i++;
    }
  }
  return { text, offsets };
}

/**
 * The field's value as anchors see it (unfolded), or `null` when the module or
 * field is absent. Shared with the registry-completeness guard so both resolve a
 * field-scoped anchor exactly the way the rewriter does.
 */
export function readUnfoldedField(
  content: string,
  doc: string,
  scope: YamlFieldScope,
): string | null {
  const range = findFieldNode(content, doc, scope)?.range;
  if (range === null || range === undefined) return null;
  return unfold(content.slice(range[0], range[1])).text;
}

/**
 * Rewrite each field-scoped occurrence's number span in place. Occurrences
 * without a `field` scope, or targeting another doc, are left to `applyCounts`.
 * Idempotent: an already-correct number produces no change.
 */
export function applyYamlFieldCounts(
  content: string,
  resolved: ResolvedOccurrence[],
  doc: string,
): { content: string; changes: CountChange[] } {
  const changes: CountChange[] = [];
  let current = content;

  for (const { key, occ, truth } of resolved) {
    if (occ.doc !== doc || occ.field === undefined) continue;

    // Re-locate per occurrence: an earlier rewrite shifts later offsets, and a
    // fresh parse is cheaper than tracking deltas correctly.
    const range = findFieldNode(current, doc, occ.field)?.range;
    if (range === null || range === undefined) continue;

    const [start, valueEnd] = range;
    const { text, offsets } = unfold(current.slice(start, valueEnd));

    // `d` flag for capture-group indices; no `g` so exec targets one match.
    const flags = occ.anchor.flags.replace(/[dg]/g, '') + 'd';
    const match = new RegExp(occ.anchor.source, flags).exec(text);
    const span = match?.indices?.[1];
    if (match === null || span === undefined) continue;

    const rawStart = start + offsets[span[0]]!;
    const rawEnd = start + offsets[span[1] - 1]! + 1;
    const found = current.slice(rawStart, rawEnd);
    // A number never straddles a fold (YAML folds at spaces), but refuse rather
    // than corrupt the file if a pathological anchor captured one.
    if (found.includes('\n')) continue;

    const rendered = renderCount(truth, occ.format);
    if (found === rendered) continue; // already correct — idempotent no-op

    current = current.slice(0, rawStart) + rendered + current.slice(rawEnd);
    changes.push({
      doc,
      key,
      line: current.slice(0, rawStart).split('\n').length,
      from: found,
      to: rendered,
    });
  }

  return { content: current, changes };
}
