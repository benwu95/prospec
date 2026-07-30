/** Today as a bare ISO 8601 date (YYYY-MM-DD, UTC). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
