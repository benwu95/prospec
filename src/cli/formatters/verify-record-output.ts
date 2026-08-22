import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { VerifyRecordResult } from '../../services/verify-record.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** Format the VerifyRecordResult: the two ledgers, the grade, the status effect. */
export function formatVerifyRecordOutput(
  result: VerifyRecordResult,
  logLevel: LogLevel = 'normal',
): void {
  if (logLevel === 'quiet') return;

  const machine = result.dimensions.filter((d) => d.adjudicator === 'machine');
  const judgment = result.dimensions.filter((d) => d.adjudicator === 'judgment');
  const gradeColor = result.grade === 'S' || result.grade === 'A' ? pc.green : result.grade === 'B' ? pc.yellow : pc.red;

  const lines: string[] = [
    `Machine ledger:  ${machine.map((d) => `${sanitizeTerminal(d.name)}=${d.result}`).join(' · ')}`,
    `Judgment ledger: ${judgment.map((d) => `${sanitizeTerminal(d.name)}=${d.result}`).join(' · ')}`,
    `Quality Grade: ${gradeColor(result.grade)} (result: ${result.result})`,
  ];
  if (result.excludedFromGrade.length > 0) {
    const excluded = result.excludedFromGrade.map((n) => sanitizeTerminal(n)).join(', ');
    lines.push(
      pc.dim(`Excluded from grade (scale policy, recorded as informational): ${excluded}`),
    );
  }
  // The self-verification grade cap: a separate signal from the WARN ledger, so
  // it is surfaced on its own line with the remedy the developer needs.
  if (result.selfVerifiedCap !== undefined) {
    const dims = result.selfVerifiedCap.dimensions.map((n) => sanitizeTerminal(n)).join(', ');
    lines.push(pc.yellow(`Grade capped below S — graded in-session: ${dims}`));
    lines.push(pc.dim(`  ${sanitizeTerminal(result.selfVerifiedCap.remedy)}`));
  }
  if (result.warnings.length > 0) {
    lines.push(`Warnings (${result.warnings.length}):`);
    for (const w of result.warnings) lines.push(`  - ${sanitizeTerminal(w)}`);
  }
  // Named, never inlined: the grader's evidence went to an artifact precisely so
  // it does not travel back through a context. Telling the developer where it
  // landed is the whole report it gets here.
  if (result.evidencePath !== undefined) {
    lines.push(`Judgment evidence: ${pc.cyan(sanitizeTerminal(result.evidencePath))}`);
  }
  const changeName = sanitizeTerminal(result.changeName);
  // Distinguish "already verified" from "grade too low" — a re-run at S/A must
  // not read as a failed gate.
  lines.push(
    result.statusAdvanced
      ? `${pc.green('✓')} ${changeName}: status → verified`
      : result.gradeGraduates
        ? `${pc.green('✓')} ${changeName}: already verified — status unchanged`
        : `${pc.yellow('●')} ${changeName}: status unchanged (only S/A graduate)`,
  );
  process.stdout.write(lines.join('\n') + '\n');
}
