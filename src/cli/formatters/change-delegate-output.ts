import pc from 'picocolors';
import type { LogLevel } from '../../types/config.js';
import type { ChangeDelegateResult } from '../../services/change-delegate.service.js';
import { sanitizeTerminal } from './sanitize.js';

/** The hand-off every mutation refusal prints: the CLI stops, the human decides. */
export const MUTATION_HAND_OFF =
  "The flow stops here; recovery is the orchestrator's with the human's consent, using git and the checkpoint files — the CLI never writes the working tree, index, HEAD or refs.";

/** Format a `change delegate` result. A failed receipt is always printed, even under
 *  --quiet: it is why the command exits non-zero. */
export function formatChangeDelegateOutput(result: ChangeDelegateResult, logLevel: LogLevel = 'normal'): void {
  const lines: string[] = [];
  const s = (text: string): string => sanitizeTerminal(text);
  switch (result.kind) {
    case 'issued':
      if (logLevel === 'quiet') return;
      lines.push(`${pc.green('✓')} Issued delegation ticket ${pc.cyan(s(result.stem))}`);
      lines.push(`  payload:  ${s(result.payloadPath)}`);
      lines.push(`  snapshot: ${s(result.snapshotPath)}`);
      for (const left of result.unreleased) lines.push(`  ${pc.yellow('!')} could not remove what an older attempt held: ${s(left)}`);
      lines.push(`→ Hand the delegate both paths; when it returns, run \`prospec change delegate --receive ${s(result.stem)}\``);
      break;
    case 'received':
      if (logLevel === 'quiet') return;
      lines.push(`${pc.green('✓')} Received ${pc.cyan(s(result.stem))} — every repository facet matches the one recorded at issue`);
      for (const left of result.unreleased) lines.push(`  ${pc.yellow('!')} could not remove what it held: ${s(left)}`);
      break;
    case 'receipt-failed': {
      const v = result.verdict;
      if (v.kind === 'refused' && v.reason === 'mutated') {
        lines.push(`${pc.red('✗ refused')} ${pc.cyan(s(result.stem))} (mutated): the delegate changed the repository`);
        for (const change of v.facets) lines.push(`  ${change.facet}: pre-spawn ${s(change.before)} → now ${s(change.after)}`);
        lines.push(`  checkpoint: ${s(v.checkpoint)}`);
        lines.push(`  ${MUTATION_HAND_OFF}`);
        lines.push('  A new attempt is issued only once the tree is back at the pre-spawn state; only the human may end this one with --spawn-failed --accept-current-tree.');
        break;
      }
      const label = v.kind === 'refused' ? pc.red('✗ refused') : v.kind === 'pending' ? pc.yellow('… not received') : pc.red('✗ not receivable');
      lines.push(`${label} ${pc.cyan(s(result.stem))} (${v.reason}): ${s(v.detail)}`);
      if (v.kind === 'pending') lines.push('  The ticket stays open — wait within the bound in the delegation-protocol reference, then receive again or end it with --spawn-failed');
      if (v.kind === 'refused') lines.push('  Issue a new attempt while the re-spawn allowance remains, or end this one with --spawn-failed');
      break;
    }
    case 'failed':
      if (logLevel === 'quiet') return;
      lines.push(`${pc.green('✓')} Ended ${result.stems.map((stem) => pc.cyan(s(stem))).join(', ')} as failed and recorded the WARN${result.stems.length > 1 ? 's' : ''}`);
      for (const warning of result.warnings) lines.push(`  ${s(warning)}`);
      for (const left of result.unreleased) lines.push(`  ${pc.yellow('!')} could not remove what it held: ${s(left)}`);
      for (const dir of result.kept) lines.push(`  ${pc.yellow('!')} kept the checkpoint — the issue-time copies of the uncommitted files, for the human: ${s(dir)}`);
      break;
  }
  process.stdout.write(lines.join('\n') + '\n');
}
