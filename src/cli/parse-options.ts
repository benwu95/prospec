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
