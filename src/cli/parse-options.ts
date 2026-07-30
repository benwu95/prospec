import { InvalidArgumentError } from 'commander';

/**
 * Commander option parser for `--depth <n>`: a positive integer.
 *
 * Used by `knowledge init`; throws on NaN / < 1 instead of silently degrading
 * the scan (e.g.
 * `--depth abc` → NaN flowing into fast-glob and a degenerate empty tree).
 */
export function parseDepth(value: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) {
    throw new Error(`Invalid depth value: ${value} (must be a positive integer)`);
  }
  return parsed;
}

/** Commander accumulator for repeatable options (`--warning a --warning b` → ['a', 'b']). */
export function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** Commander option parser for date options: a bare ISO 8601 date (YYYY-MM-DD). */
export function parseDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new InvalidArgumentError('expected a bare ISO 8601 date (YYYY-MM-DD)');
  }
  return value;
}
