import pc from 'picocolors';
import type {
  ConstitutionFailOpenReason,
  ConstitutionShowResult,
} from '../../services/constitution-show.service.js';
import { sanitizeTerminal } from './sanitize.js';

const FAIL_OPEN_CAUSE: Record<ConstitutionFailOpenReason, string> = {
  'no-principles': 'the file has no `## Principles` section',
  'no-declarations': 'no rule declares `stations:`',
  'no-match': 'no rule declares `stations: all` or names this station',
};

/**
 * Print a Constitution slice or rule.
 *
 * stdout is the text exactly as the engine returned it — no trailing newline is
 * added, so a fail-open run is byte-identical to the file — and it is never
 * suppressed: it is the command's product. The shared sanitizer still applies,
 * as for every formatter, so a CR or other control byte is stripped. Every
 * diagnostic goes to stderr, one line each; a station run ends with the
 * `tokens:` line (slice and full on a slice, full alone on fail-open).
 */
export function formatConstitutionShowOutput(result: ConstitutionShowResult): void {
  const text = result.selector === 'station' ? result.result.text : result.text;
  process.stdout.write(sanitizeTerminal(text));

  if (result.selector === 'rule') {
    if (result.rules.length > 1) {
      process.stderr.write(
        `${pc.yellow('⚠')} WARN: ${result.rules.length} rules are named "${sanitizeTerminal(result.rules[0]?.name ?? '')}" in ${sanitizeTerminal(result.path)} — all are printed\n`,
      );
    }
    return;
  }

  const slice = result.result;
  if (slice.kind === 'full') {
    process.stderr.write(
      `${pc.yellow('⚠')} WARN: printed the whole ${sanitizeTerminal(result.path)} for station ${result.station} (fail-open: ${slice.reason} — ${FAIL_OPEN_CAUSE[slice.reason]})\n`,
    );
    process.stderr.write(`tokens: full ${result.tokens.full}\n`);
    return;
  }
  process.stderr.write(
    `${pc.dim(`included ${slice.undeclared.length} undeclared rule(s) — a rule with no \`stations:\` on its **Verify**: line stays in every slice`)}\n`,
  );
  // The measurement the READMEs quote, printed by the command that made it.
  process.stderr.write(`tokens: slice ${result.tokens.slice} / full ${result.tokens.full} (estimateTokens)\n`);
}
