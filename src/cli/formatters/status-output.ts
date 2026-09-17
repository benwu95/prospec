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
 *    reference (only when one exists), suggested next skill, the actionable skill
 *    identity and its file fallback, blocking gates, reasons
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
            ? 'differs from current content or workflow facts'
            : report.drift.reason === 'unprovable'
              ? 'cannot prove current evidence (legacy fingerprint or unreadable inputs)'
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
    // Identity first: it is the one target every host can act on — through its
    // own skill mechanism where it has one, through the fallback file where it
    // does not. The formatter states neither, because it cannot know which host
    // is reading; the entry config's Station Transition Protocol does.
    if (change.nextSkill !== undefined) {
      console.log(
        `  action:  invoke skill ${pc.cyan(sanitizeTerminal(change.nextSkill))}` +
          " — load it the way this host loads skills, before executing station checks",
      );
    }
    if (change.nextSkillPath !== undefined) {
      console.log(
        `  fallback: read ${pc.cyan(sanitizeTerminal(change.nextSkillPath))}` +
          ' when that mechanism is unavailable',
      );
    }
    // The next station's load points, after the action that names that station:
    // an agent regaining context reads the map here instead of re-deriving it.
    // Formatting only — the service decided applicability, this prints it.
    for (const row of change.nextReferenceMap ?? []) {
      const condition = row.conditionHint === undefined ? '' : ` — when ${sanitizeTerminal(row.conditionHint)}`;
      console.log(
        `  read:    ${sanitizeTerminal(row.phase)} → ${pc.cyan(sanitizeTerminal(row.referencePath))}` +
          ` (${sanitizeTerminal(row.purpose)})${condition}`,
      );
    }
    for (const gate of change.blockingGates) {
      console.log(`  gate:    ${sanitizeTerminal(gate)}`);
    }
    // The stable code an automation matches on, ahead of the prose it explains.
    for (const reason of change.reasons) {
      console.log(`  reason:  ${pc.dim(`[${change.code}]`)} ${sanitizeTerminal(reason)}`);
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
