import { describe, it, expect, vi, afterEach } from 'vitest';
import { todayIso } from '../../../src/lib/date-utils.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('todayIso', () => {
  it('formats the current UTC date as a bare YYYY-MM-DD', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T15:04:05.678Z'));
    expect(todayIso()).toBe('2026-07-30');
  });

  it('keeps the full date at the UTC day boundary (no time component leaks)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-31T23:59:59.999Z'));
    expect(todayIso()).toBe('2026-12-31');
  });

  it('always matches the bare ISO 8601 date shape', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
