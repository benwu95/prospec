import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { StatusReport } from '../../types/status.js';
import { STATION_SKILLS } from '../../types/status.js';
import { DRIFT_REPORT_FILENAME } from '../../types/drift-report.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Format the StatusReport for terminal output.
 *
 * Output structure:
 * 1. Clean state (no in-flight changes), or
 * 2. Per change: name + scale, status/current station, the registered issue
 *    reference (only when one exists), suggested next skill, blocking gates,
 *    reasons
 * 3. Unroutable records (malformed metadata) — reported, never dropped
 */
export function formatStatusJson(report: StatusReport): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

export function formatStatusOutput(report: StatusReport, logLevel: LogLevel): void {
  if (logLevel === 'quiet') return;

  if (report.clean) {
    console.log(`${pc.green('✓')} No in-progress changes — \`.prospec/changes/\` is clean`);
    if (report.drift) {
      console.log('');
      if (report.drift.state === 'findings') {
        console.log(
          `${pc.yellow('●')} ${report.drift.count} drift finding(s) in the current report`,
        );
        console.log(
          `  action:  run ${pc.cyan(report.drift.recommendation)} to draft fix changes`,
        );
      } else {
        const why =
          report.drift.reason === 'stale'
            ? 'was generated against different code'
            : report.drift.reason === 'unprovable'
              ? 'records no code fingerprint, so its freshness cannot be checked'
              : 'could not be read';
        console.log(`${pc.yellow('●')} \`${DRIFT_REPORT_FILENAME}\` ${why}`);
        console.log(`  action:  run ${pc.cyan(report.drift.recommendation)} to regenerate it`);
      }
    }
    return;
  }

  console.log(pc.bold('In-progress changes (deterministic routing from _status-lifecycle.md)'));

  for (const change of report.changes) {
    console.log('');
    console.log(
      `${pc.green('●')} ${sanitizeTerminal(change.name)}  ${pc.dim(`[${change.scale}]`)}`,
    );
    console.log(`  status:  ${pc.cyan(change.status)} (completed station: ${change.current})`);
    if (change.issue !== undefined) {
      console.log(`  issue:   ${sanitizeTerminal(change.issue)}`);
    }
    const next =
      change.next === null
        ? pc.dim('— terminal (periodic prospec-learn)')
        : pc.cyan(STATION_SKILLS[change.next]);
    console.log(`  next:    ${next}`);
    if (change.nextSkillPath !== undefined) {
      console.log(
        `  action:  read ${pc.cyan(change.nextSkillPath)} before executing station checks`,
      );
    }
    for (const gate of change.blockingGates) {
      console.log(`  gate:    ${sanitizeTerminal(gate)}`);
    }
    for (const reason of change.reasons) {
      console.log(`  reason:  ${sanitizeTerminal(reason)}`);
    }
    for (const w of change.unresolvedWarnings ?? []) {
      console.log(`  warn:    ${sanitizeTerminal(`${w.skill}: ${w.warning}`)}`);
    }
  }

  if (report.errors.length > 0) {
    console.log('');
    console.log(pc.red('Unroutable change records:'));
    for (const e of report.errors) {
      console.log(`  ${pc.red('✗')} ${sanitizeTerminal(e.name)} — ${sanitizeTerminal(e.error)}`);
    }
  }
}
