import pc from 'picocolors';
import type { SpecShowResult } from '../../services/spec-show.service.js';
import { sanitizeTerminal } from './sanitize.js';

/**
 * Print a REQ-scoped feature-spec read.
 *
 * stdout carries the spec source and nothing else — no heading, no count, no
 * colour — so the output can be piped into a diff or quoted as spec text. The
 * payload is NOT suppressed by `--quiet`: it is the command's product rather than
 * progress chatter.
 *
 * An unmatched selector goes to stderr and drives exit 1 (REQ-CLI-035). It is
 * blocking-class, so it stays visible under `--quiet`: a caller that asked for a
 * requirement which does not exist must not read the silence as "no such
 * behaviour is specified".
 *
 * Spec text is repo content, so it routes through the shared sanitizer like every
 * other free-form string a formatter prints; that also drops a lone `\r`, which a
 * terminal has no use for.
 */
export function formatSpecShowOutput(result: SpecShowResult): void {
  if (result.text !== '') {
    const text = sanitizeTerminal(result.text);
    process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  }

  if (result.misses.length === 0) return;

  for (const miss of result.misses) {
    process.stderr.write(
      `${pc.red('✗')} no ${miss.kind === 'story' ? 'story' : 'requirement'} ${pc.cyan(
        sanitizeTerminal(miss.selector),
      )} in ${pc.dim(sanitizeTerminal(result.path))}\n`,
    );
  }
  process.exitCode = 1;
}
