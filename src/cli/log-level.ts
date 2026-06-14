import type { LogLevel } from '../types/config.js';
// Type-only import — erased at compile time, so it introduces no runtime cycle
// with index.ts (which imports the command modules that import this helper).
import type { GlobalOptions } from './index.js';

/** Resolve the logger verbosity from the global CLI flags. */
export function resolveLogLevel(opts: GlobalOptions): LogLevel {
  if (opts.quiet) return 'quiet';
  if (opts.verbose) return 'verbose';
  return 'normal';
}
