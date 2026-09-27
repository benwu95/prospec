import type { ConstitutionRuleEntry } from '../types/drift-report.js';
import { locateConstitutionRules, type ConstitutionRuleBlock } from './constitution-parser.js';

/**
 * Constitution station slices (REQ-LIB-093) — the part of the Constitution one
 * station's Startup Loading needs, cut from the file by the rules' own
 * `stations:` declarations. The engine decides nothing about relevance: a rule
 * that declares `all`, names the station, or declares nothing is kept; only a
 * rule that explicitly names other stations is dropped. Whenever that cannot
 * produce a slice the result is the input itself, so a slice is never worse
 * than the whole file.
 *
 * Pure: takes markdown text, returns data. Section and rule boundaries come from
 * the parser's one walk, never from a heading rule of this module's own.
 */

export const CONSTITUTION_FAIL_OPEN_REASONS = ['no-principles', 'no-declarations', 'no-match'] as const;
export type ConstitutionFailOpenReason = (typeof CONSTITUTION_FAIL_OPEN_REASONS)[number];

export interface ConstitutionRuleRef {
  name: string;
  check_id: string | null;
  coverage: string | null;
}

export type ConstitutionSliceResult =
  | {
      kind: 'sliced';
      text: string;
      /** Kept because they declare `all` or name the station. */
      matched: ConstitutionRuleRef[];
      /** Kept because they declare no `stations:` at all. */
      undeclared: string[];
      /** Dropped because they name only other stations. */
      excluded: string[];
    }
  | { kind: 'full'; reason: ConstitutionFailOpenReason; text: string };

export type ConstitutionRuleSliceResult =
  | { kind: 'rule'; text: string; rules: ConstitutionRuleRef[] }
  | { kind: 'miss'; available: string[] };

/**
 * The two readings of a `stations` value that the slicer and the
 * `constitution-severity` evaluator must agree on — the evaluator's WARN text
 * describes what these predicates do, so it decides through them.
 */
/** An absent clause, or an empty list, is undeclared — kept everywhere. */
export function isUndeclaredStations(stations: ConstitutionRuleEntry['stations']): boolean {
  return stations === null || stations === undefined || (Array.isArray(stations) && stations.length === 0);
}

/** `all`, or a list that names `all` beside station names, is every station. */
export function declaresEveryStation(stations: ConstitutionRuleEntry['stations']): boolean {
  return stations === 'all' || (Array.isArray(stations) && stations.includes('all'));
}

export function ruleAppliesToStation(stations: ConstitutionRuleEntry['stations'], station: string): boolean {
  if (isUndeclaredStations(stations) || declaresEveryStation(stations)) return true;
  return Array.isArray(stations) && stations.includes(station);
}

function toRef(entry: ConstitutionRuleEntry): ConstitutionRuleRef {
  return { name: entry.name, check_id: entry.check_id ?? null, coverage: entry.coverage ?? null };
}

function blockText(lines: string[], blocks: ConstitutionRuleBlock[]): string {
  return blocks.map((b) => lines.slice(b.start, b.end).join('\n')).join('\n');
}

export function sliceConstitution(markdown: string, options: { station: string }): ConstitutionSliceResult {
  const { principles, rules } = locateConstitutionRules(markdown);
  if (principles === null) return { kind: 'full', reason: 'no-principles', text: markdown };
  if (rules.every((r) => isUndeclaredStations(r.entry.stations))) {
    return { kind: 'full', reason: 'no-declarations', text: markdown };
  }

  const kept = rules.filter((r) => ruleAppliesToStation(r.entry.stations, options.station));
  if (kept.length === 0) return { kind: 'full', reason: 'no-match', text: markdown };

  const lines = markdown.split('\n');
  const keep = lines.map(() => true);
  const excluded = rules.filter((r) => !kept.includes(r));
  for (const block of excluded) {
    for (let i = block.start; i < block.end; i += 1) keep[i] = false;
  }
  return {
    kind: 'sliced',
    text: lines.filter((_, i) => keep[i]).join('\n'),
    matched: kept.filter((r) => !isUndeclaredStations(r.entry.stations)).map((r) => toRef(r.entry)),
    undeclared: kept.filter((r) => isUndeclaredStations(r.entry.stations)).map((r) => r.entry.name),
    excluded: excluded.map((r) => r.entry.name),
  };
}

export function sliceConstitutionRule(markdown: string, name: string): ConstitutionRuleSliceResult {
  const { rules } = locateConstitutionRules(markdown);
  const hits = rules.filter((r) => r.entry.name === name);
  if (hits.length === 0) return { kind: 'miss', available: rules.map((r) => r.entry.name) };
  return { kind: 'rule', text: blockText(markdown.split('\n'), hits), rules: hits.map((r) => toRef(r.entry)) };
}

/** The station-name resolver lives with the vocabulary it resolves into. */
export { normalizeStationName } from '../types/status.js';
