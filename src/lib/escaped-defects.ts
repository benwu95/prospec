import type { QualityLedgerSource } from './drift-sources.js';
import {
  ESCAPED_DEFECT_REPORT_VERSION,
  EscapedDefectReportSchema,
  type EscapedDefectReport,
  type EscapedDefectSample,
  type GateAccuracy,
} from '../types/escaped-defect.js';
import { EscapedDefectReportInvalid } from '../types/errors.js';

/**
 * Escaped-defect aggregation — per-gate miss rate from the `introduced_by`
 * registration convention (REQ-LIB-034).
 *
 * A gate "let a defect through" when it recorded a PASS on a change that a later
 * bug-fix change blames via `introduced_by`. Rate = escaped / passed over that
 * gate's PASS records. Pure function over the collected ledger: no I/O, so the
 * same ledger always yields the same report.
 *
 * The honesty rule that shapes the whole output: **no samples means no data**, not
 * a clean record. With nothing registered, `gates` is empty rather than a table of
 * 0% rates that would read as "no defect ever escaped any gate".
 */

const PASS = 'PASS';

/** Marker for an alias two different ledger entries both claim. */
const AMBIGUOUS = Symbol('ambiguous-change-alias');
type AMBIGUOUS = typeof AMBIGUOUS;

/** Archived change directories are date-prefixed (`2026-07-05-unlock-measurement`)
 *  while `introduced_by` registers the bare change name — resolution must accept both. */
const ARCHIVE_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}-/;

export function aggregateEscapedDefects(
  source: QualityLedgerSource,
  generatedAt: string,
): EscapedDefectReport {
  // One gate set per change, reachable under every alias a registration may use:
  // the canonical name, the ledger directory, and the un-dated directory name.
  // An alias claimed by two different changes is AMBIGUOUS, not first-wins:
  // silently picking one attributes the escape to the wrong change and hides it
  // from `unresolved_references` too, so the map records the collision instead.
  const passedGatesByChange = new Map<string, Set<string> | AMBIGUOUS>();
  const gateSets: Array<Set<string>> = [];
  for (const change of source.changes) {
    const gates = new Set<string>();
    for (const { skill, result } of change.gate_results) {
      if (result === PASS) gates.add(skill);
    }
    gateSets.push(gates);
    for (const alias of new Set([
      change.name,
      change.dir,
      change.dir.replace(ARCHIVE_DATE_PREFIX, ''),
    ])) {
      if (alias.length === 0) continue;
      const existing = passedGatesByChange.get(alias);
      if (existing === undefined) passedGatesByChange.set(alias, gates);
      else if (existing !== gates) passedGatesByChange.set(alias, AMBIGUOUS);
    }
  }

  const samples: EscapedDefectSample[] = [];
  const unresolved_references: EscapedDefectSample[] = [];
  // `escaped` counts DISTINCT blamed changes per gate, matching `passed`, which
  // counts changes — so the ratio is a true rate in 0..1. Two fixes blaming the
  // same change are two defects but one change the gate passed; counting blame
  // events here would make `escaped_rate` exceed 1 and print as e.g. "300%".
  const escapedChangesByGate = new Map<string, Set<string>>();
  for (const change of source.changes) {
    if (change.introduced_by === null) continue;
    const blamedGates = passedGatesByChange.get(change.introduced_by);
    const resolved = blamedGates !== undefined && blamedGates !== AMBIGUOUS;
    const sample: EscapedDefectSample = {
      fix_change: change.name,
      introduced_by: change.introduced_by,
      gates_passed: resolved ? [...(blamedGates as Set<string>)].sort() : [],
    };
    if (!resolved) {
      unresolved_references.push(sample);
      continue;
    }
    samples.push(sample);
    for (const gate of sample.gates_passed) {
      const blamed = escapedChangesByGate.get(gate) ?? new Set<string>();
      blamed.add(change.introduced_by);
      escapedChangesByGate.set(gate, blamed);
    }
  }

  const report: EscapedDefectReport = {
    version: ESCAPED_DEFECT_REPORT_VERSION,
    generated_at: generatedAt,
    archive_available: source.archive_available,
    // An unavailable ledger is NOT "nothing registered" — say which it is.
    ledger_available: source.available,
    sample_count: samples.length,
    // gateSets holds exactly one entry per change — never iterate the alias map,
    // whose several keys per change would inflate every `passed` denominator.
    gates: samples.length === 0 ? [] : buildGateAccuracy(gateSets, escapedChangesByGate),
    samples: samples.sort(byFixChange),
    unresolved_references: unresolved_references.sort(byFixChange),
  };
  const parsed = EscapedDefectReportSchema.safeParse(report);
  if (!parsed.success) {
    throw new EscapedDefectReportInvalid(
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return parsed.data;
}

function buildGateAccuracy(
  gateSets: ReadonlyArray<ReadonlySet<string>>,
  escapedChangesByGate: ReadonlyMap<string, ReadonlySet<string>>,
): GateAccuracy[] {
  const passedByGate = new Map<string, number>();
  for (const gates of gateSets) {
    for (const gate of gates) passedByGate.set(gate, (passedByGate.get(gate) ?? 0) + 1);
  }
  const rows: GateAccuracy[] = [];
  for (const [gate, passed] of passedByGate) {
    const escaped = escapedChangesByGate.get(gate)?.size ?? 0;
    rows.push({ gate, passed, escaped, escaped_rate: escaped / passed });
  }
  // codepoint order, NOT localeCompare — ICU collation varies per environment
  return rows.sort((a, b) => (a.gate < b.gate ? -1 : a.gate > b.gate ? 1 : 0));
}

function byFixChange(a: EscapedDefectSample, b: EscapedDefectSample): number {
  return a.fix_change < b.fix_change ? -1 : a.fix_change > b.fix_change ? 1 : 0;
}
