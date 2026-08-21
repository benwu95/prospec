import type { DriftFinding } from '../types/drift-report.js';

/**
 * Whether a finding is something a fix CHANGE can be drafted for.
 *
 * Two exclusions, both about what the finding is ABOUT rather than how bad it is:
 *
 * - `headroom` knowledge-size findings report budget pressure, not a violation.
 *   They carry no remedy, and drafting them turns every measured file into a
 *   change directory.
 * - Findings whose subject is the SDD workspace itself (`.prospec/`) are process
 *   gates on a change — "no review recorded", "tasks unchecked". Drafting them
 *   produces a change whose stated job is to fix another change's paperwork, and
 *   which trips the very same gates the moment it exists.
 *
 * Lives in `lib` because it is a pure predicate over a types-layer shape with
 * no I/O: `prospec status` must count exactly what `--auto-draft` would draft —
 * a nudge naming a number the action will not act on is worse than silence —
 * and the read-only surface must not import the change-creation path to do it.
 */
export function isDraftableFinding(finding: DriftFinding): boolean {
  if (finding.knowledge_size?.tier === 'headroom') return false;
  const normPath = finding.source_path.replace(/\\/g, '/');
  return !(normPath === '.prospec' || normPath.startsWith('.prospec/'));
}
