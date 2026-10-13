import pc from 'picocolors';
import type { TestEvidenceReuse } from '../../types/change.js';
import { TEST_GATE_NOT_ADJUDICATED, type TestGateOutcome } from '../../types/station.js';
import { sanitizeTerminal } from './sanitize.js';

export function formatTestEvidenceReuse(reuse: TestEvidenceReuse): string {
  const text = (value: string): string => sanitizeTerminal(value).replace(/[\r\n\t]/g, ' ');
  return `Reused test evidence: attempt ${text(reuse.attempt_id)} · ${text(reuse.date)} · ${text(reuse.command)} · exit ${reuse.exit_code} · excluded ${text(reuse.test_policy.excluded_path)} — ${text(reuse.reason)}`;
}

export function formatTestGateWarning(testGate: TestGateOutcome | undefined): string | undefined {
  if (testGate?.verdict === 'pass' && testGate.reuse) return formatTestEvidenceReuse(testGate.reuse);
  if (testGate?.verdict !== 'exempt') return undefined;
  const recorded = testGate.warningRecorded ? 'recorded in quality_log' : 'already recorded';
  return `${pc.yellow('⚠')} ${TEST_GATE_NOT_ADJUDICATED} (${sanitizeTerminal(testGate.exemption ?? '')}): ${sanitizeTerminal(testGate.reason ?? '')} — ${recorded}`;
}
