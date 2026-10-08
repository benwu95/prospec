/**
 * `pnpm routing-flow` — redraw the routing diagram in
 * `prospec/ai-knowledge/modules/lib/routing-flow.md` from the router's rule table.
 *
 * The diagram is one ladder per scope in evaluation order: the global rules, then
 * a status switch into each branch. Each rule is one line — its decision chained to
 * a Yes exit naming its code and `next`; its No exit falls to the next rule, so the
 * drawing IS the precedence. Only the
 * region between the two markers is rewritten; `tests/contract/routing-flow.test.ts`
 * fails while that region differs from a fresh render. Repo-internal — `scripts/`
 * is not shipped.
 */
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../src/lib/fs-utils.js';
import { OTHERWISE, ROUTING_TABLE, type RouteRule, type RoutingTable } from '../src/lib/status-router.js';

export const ROUTING_FLOW_DOC = 'prospec/ai-knowledge/modules/lib/routing-flow.md';
export const REGION_START = '<!-- routing-flow:start -->';
export const REGION_END = '<!-- routing-flow:end -->';

const CLASS_DEFS: Record<string, string> = {
  decisionNode: 'fill:#fff,color:#333,stroke:#999',
  readyNode: 'fill:#7ED321,color:#fff,stroke:#5CA018',
  stateNode: 'fill:#F5A623,color:#fff,stroke:#D4871A',
  successNode: 'fill:#417505,color:#fff,stroke:#2E5204',
};

const quote = (text: string): string => text.replaceAll('"', '#quot;');
const nextText = (rule: RouteRule): string =>
  rule.next === null ? 'null' : typeof rule.next === 'string' ? rule.next : rule.next.label;
// A halt waits on a human (readyNode); TERMINAL ends the flow; anything else names a station.
const leafClass = (rule: RouteRule): string =>
  rule.next !== null ? 'stateNode' : rule.code === 'TERMINAL' ? 'successNode' : 'readyNode';

/** The diagram as a fenced Mermaid block. */
export function renderRoutingFlow(table: RoutingTable): string {
  const lines: string[] = [];
  const classes = new Map<string, string[]>();
  const tag = (cls: string, id: string): void => {
    classes.set(cls, [...(classes.get(cls) ?? []), id]);
  };

  /** One first-match ladder; `entry` is the edge into its first node, `exit` where its last No goes. */
  const ladder = (prefix: string, rules: readonly RouteRule[], entry: string, exit: string | null): void => {
    rules.forEach((rule, i) => {
      const id = `${prefix}${i}`;
      const leaf = `${id}L["${rule.code}<br>next: ${quote(nextText(rule))}"]`;
      const from = i === 0 ? entry : `${prefix}${i - 1} -->|No| `;
      tag(leafClass(rule), `${id}L`);
      if (rule.when === OTHERWISE) {
        lines.push(`  ${from}${leaf}`);
        return;
      }
      tag('decisionNode', id);
      lines.push(`  ${from}${id}{"${quote(rule.label)}"} -->|Yes| ${leaf}`);
    });
    if (exit === null) return;
    // An empty scope passes straight through; an unconditional last rule never falls through.
    if (rules.length === 0) lines.push(`  ${entry}${exit}`);
    else if (rules[rules.length - 1]!.when !== OTHERWISE) lines.push(`  ${prefix}${rules.length - 1} -->|No| ${exit}`);
  };

  lines.push('  %% ═══ global rules ═══');
  ladder('g', table.global, '', 'S{"status?"}');
  tag('decisionNode', 'S');
  table.branches.forEach((branch, b) => {
    const statuses = branch.statuses.join(' / ');
    lines.push(`  %% ═══ ${statuses} ═══`);
    ladder(`b${b}r`, branch.rules, `S -->|${statuses}| `, null);
  });

  const used = [...classes.keys()].sort();
  return [
    '```mermaid',
    'flowchart TD',
    ...lines,
    ...used.map((cls) => `  classDef ${cls} ${CLASS_DEFS[cls]}`),
    ...used.map((cls) => `  class ${classes.get(cls)!.join(',')} ${cls}`),
    '```',
  ].join('\n');
}

/** Replace the marker-delimited region; a missing, duplicated or reversed marker is refused. */
export function replaceRoutingRegion(doc: string, rendered: string): string {
  const starts = doc.split(REGION_START).length - 1;
  const ends = doc.split(REGION_END).length - 1;
  const start = doc.indexOf(REGION_START);
  const end = doc.indexOf(REGION_END);
  if (starts !== 1 || ends !== 1 || end < start) {
    throw new Error(
      `${ROUTING_FLOW_DOC} must contain exactly one ${REGION_START} followed by one ${REGION_END} (found ${starts} start, ${ends} end)`,
    );
  }
  return `${doc.slice(0, start + REGION_START.length)}\n${rendered}\n${doc.slice(end)}`;
}

/** The generated region's current content, or null when the markers are unusable. */
export function readRoutingRegion(doc: string): string | null {
  try {
    const start = doc.indexOf(REGION_START) + REGION_START.length;
    replaceRoutingRegion(doc, '');
    return doc.slice(start, doc.indexOf(REGION_END)).replace(/^\n/, '').replace(/\n$/, '');
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const docPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', ROUTING_FLOW_DOC);
  const doc = readFileSync(docPath, 'utf-8');
  const next = replaceRoutingRegion(doc, renderRoutingFlow(ROUTING_TABLE));
  if (next === doc) {
    console.log(`✓ ${ROUTING_FLOW_DOC} is current`);
    return;
  }
  await atomicWrite(docPath, next);
  console.log(`✓ Redrew the routing diagram in ${ROUTING_FLOW_DOC}`);
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  await main();
}
