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

/** Commander option parser for non-negative or positive integers. */
export function parseIntOption(name: string, min: 0 | 1) {
  return (v: string): number => {
    const parsed = parseInt(v, 10);
    if (Number.isNaN(parsed) || parsed < min || String(parsed) !== v.trim()) {
      const type = min === 1 ? 'positive' : 'non-negative';
      throw new InvalidArgumentError(`--${name} must be a ${type} integer, got "${v}"`);
    }
    return parsed;
  };
}

/** Commander option parser for integer within bounds [min, max]. */
export function parseBoundedInt(name: string, min: number, max: number) {
  return (v: string): number => {
    const parsed = parseInt(v, 10);
    if (Number.isNaN(parsed) || parsed < min || parsed > max || String(parsed) !== v.trim()) {
      throw new InvalidArgumentError(`--${name} must be an integer between ${min} and ${max}, got "${v}"`);
    }
    return parsed;
  };
}

/** Commander option parser for ratio between 0.0 and 1.0. */
export function parseRatio(name: string) {
  return (v: string): number => {
    const trimmed = v.trim();
    const parsed = trimmed === '' ? NaN : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
      throw new InvalidArgumentError(`--${name} must be a number between 0.0 and 1.0, got "${v}"`);
    }
    return parsed;
  };
}


/** Commander option parser for `--executor <label>`: a non-empty self-declared executor
 *  label; an empty value must be omitted, never written. Shared by `verify record` and
 *  `check --record-review` so both stations refuse the same shape the same way; the
 *  vocabulary itself is asserted in the service against `.prospec.yaml` `executors`. */
export function parseExecutorLabel(value: string): string {
  if (value.trim() === '') {
    throw new InvalidArgumentError('expected a non-empty executor self-report (omit the flag instead)');
  }
  if (/[\r\n]/.test(value)) {
    throw new InvalidArgumentError('executor label must be a single line');
  }
  return value;
}
