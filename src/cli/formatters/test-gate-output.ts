import pc from 'picocolors';
import { TEST_GATE_NOT_ADJUDICATED, type TestGateOutcome } from '../../types/station.js';
import { sanitizeTerminal } from './sanitize.js';

/** The one WARN line both entrances print for an exemption; '' on a pass. */
export function formatTestGateWarning(testGate: TestGateOutcome | undefined): string | undefined {
  if (testGate?.verdict !== 'exempt') return undefined;
  const recorded = testGate.warningRecorded ? 'recorded in quality_log' : 'already recorded';
  return `${pc.yellow('⚠')} ${TEST_GATE_NOT_ADJUDICATED} (${sanitizeTerminal(testGate.exemption ?? '')}): ${sanitizeTerminal(testGate.reason ?? '')} — ${recorded}`;
}
