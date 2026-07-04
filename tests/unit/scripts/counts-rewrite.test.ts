import { describe, it, expect } from 'vitest';
import {
  renderCount,
  applyCounts,
  resolveOccurrences,
  type ResolvedOccurrence,
} from '../../../scripts/counts/rewrite.js';
import type { CountOccurrence } from '../../../scripts/counts/types.js';

const occ = (doc: string, anchor: RegExp, format: 'plain' | 'comma' = 'plain'): CountOccurrence => ({
  doc,
  anchor,
  format,
});

describe('renderCount', () => {
  it('renders plain digits', () => {
    expect(renderCount(1865, 'plain')).toBe('1865');
    expect(renderCount(78, 'plain')).toBe('78');
  });

  it('groups thousands with ASCII commas (deterministic, no locale)', () => {
    expect(renderCount(1865, 'comma')).toBe('1,865');
    expect(renderCount(1234567, 'comma')).toBe('1,234,567');
    expect(renderCount(999, 'comma')).toBe('999');
  });
});

describe('applyCounts', () => {
  it('rewrites only the captured number, leaving surrounding prose and other numbers intact', () => {
    const content = 'suite — 78 files, 1865 tests (unit 1000 + contract 500)';
    const resolved: ResolvedOccurrence[] = [
      { key: 'tests.total', occ: occ('X', /files, (\d+) tests/), truth: 1865 },
    ];
    const { content: out, changes } = applyCounts(content, resolved, 'X');
    // total already correct → no change; other numbers (78, 1000, 500) untouched
    expect(out).toBe(content);
    expect(changes).toHaveLength(0);
  });

  it('replaces a stale number in place without disturbing the rest of the line', () => {
    const content = 'suite — 78 files, 1800 tests (unit 1000 + contract 500)';
    const resolved: ResolvedOccurrence[] = [
      { key: 'tests.total', occ: occ('X', /files, (\d+) tests/), truth: 1865 },
    ];
    const { content: out, changes } = applyCounts(content, resolved, 'X');
    expect(out).toBe('suite — 78 files, 1865 tests (unit 1000 + contract 500)');
    expect(changes).toEqual([
      { doc: 'X', key: 'tests.total', line: 1, from: '1800', to: '1865' },
    ]);
  });

  it('renders comma format when rewriting', () => {
    const resolved: ResolvedOccurrence[] = [
      { key: 'tests.total', occ: occ('X', /files, ([\d,]+) tests/, 'comma'), truth: 1865 },
    ];
    const { content: out } = applyCounts('files, 1,800 tests', resolved, 'X');
    expect(out).toBe('files, 1,865 tests');
  });

  it('is idempotent — re-applying to corrected content yields no changes', () => {
    const resolved: ResolvedOccurrence[] = [
      { key: 'tests.total', occ: occ('X', /files, (\d+) tests/), truth: 1865 },
    ];
    const once = applyCounts('files, 1800 tests', resolved, 'X');
    const twice = applyCounts(once.content, resolved, 'X');
    expect(twice.changes).toHaveLength(0);
    expect(twice.content).toBe(once.content);
  });

  it('only touches occurrences whose doc matches', () => {
    const resolved: ResolvedOccurrence[] = [
      { key: 'k', occ: occ('OTHER', /n=(\d+)/), truth: 9 },
    ];
    const { content: out, changes } = applyCounts('n=1', resolved, 'THIS');
    expect(out).toBe('n=1');
    expect(changes).toHaveLength(0);
  });

  it('handles multiple distinct occurrences on the same line', () => {
    const content = 'unit 10 + contract 20';
    const resolved: ResolvedOccurrence[] = [
      { key: 'u', occ: occ('X', /unit (\d+) \+/), truth: 11 },
      { key: 'c', occ: occ('X', /\+ contract (\d+)/), truth: 22 },
    ];
    const { content: out, changes } = applyCounts(content, resolved, 'X');
    expect(out).toBe('unit 11 + contract 22');
    expect(changes.map((c) => c.key).sort()).toEqual(['c', 'u']);
  });
});

describe('resolveOccurrences', () => {
  it('drops entries whose count key is absent from the truth map (skipped source)', () => {
    const entries = [
      { key: 'present', occurrences: [occ('X', /(\d+)/)] },
      { key: 'skipped', occurrences: [occ('X', /(\d+)/)] },
    ];
    const resolved = resolveOccurrences(entries, { present: 5 });
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.key).toBe('present');
    expect(resolved[0]!.truth).toBe(5);
  });
});
