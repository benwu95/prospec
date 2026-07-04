import type { CountChange, CountFormat, CountOccurrence, TruthMap } from './types.js';

/**
 * Render a number for a given occurrence format. `comma` grouping is done with
 * a deterministic ASCII regex (never `toLocaleString`) so output is identical
 * across environments/locales.
 */
export function renderCount(n: number, format: CountFormat): string {
  const plain = String(n);
  return format === 'comma' ? plain.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : plain;
}

/** An occurrence resolved against its owning count key and truth value. */
export interface ResolvedOccurrence {
  key: string;
  occ: CountOccurrence;
  truth: number;
}

/**
 * Pure rewriter: given a doc's content and the occurrences (with truth) that
 * target it, replace ONLY each anchor's captured number span with the rendered
 * truth. Leaves everything else — surrounding prose, other numbers on the same
 * line, anything not matched by an anchor — untouched. Idempotent: re-applying
 * to already-correct content yields no changes.
 */
export function applyCounts(
  content: string,
  resolved: ResolvedOccurrence[],
  doc: string,
): { content: string; changes: CountChange[] } {
  const lines = content.split('\n');
  const changes: CountChange[] = [];

  for (let i = 0; i < lines.length; i++) {
    for (const { key, occ, truth } of resolved) {
      if (occ.doc !== doc) continue;
      // Rebuild the anchor with the `d` flag so we get the exact index range of
      // capture group 1, and without `g` so exec targets a single match.
      const flags = occ.anchor.flags.replace(/[dg]/g, '') + 'd';
      const re = new RegExp(occ.anchor.source, flags);
      const m = re.exec(lines[i]);
      const span = m?.indices?.[1];
      if (m === null || span === undefined) continue;

      const [start, end] = span;
      const current = lines[i].slice(start, end);
      const rendered = renderCount(truth, occ.format);
      if (current === rendered) continue; // already correct — idempotent no-op

      lines[i] = lines[i].slice(0, start) + rendered + lines[i].slice(end);
      changes.push({ doc, key, line: i + 1, from: current, to: rendered });
    }
  }

  return { content: lines.join('\n'), changes };
}

/** Flatten a truth map + entries into the per-occurrence work list. */
export function resolveOccurrences(
  entries: ReadonlyArray<{ key: string; occurrences: CountOccurrence[] }>,
  truth: TruthMap,
): ResolvedOccurrence[] {
  const resolved: ResolvedOccurrence[] = [];
  for (const entry of entries) {
    const value = truth[entry.key];
    if (value === undefined) continue; // source was skipped — never write blindly
    for (const occ of entry.occurrences) {
      resolved.push({ key: entry.key, occ, truth: value });
    }
  }
  return resolved;
}
