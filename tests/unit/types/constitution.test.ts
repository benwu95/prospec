import { describe, it, expect } from 'vitest';
import { formatVerifyHint, type ConstitutionRule } from '../../../src/types/constitution.js';

const base: ConstitutionRule = {
  severity: 'MUST',
  name: 'Rule',
  description: 'd',
  rationale: 'r',
  check: 'check: x-check; covers: y',
};

describe('formatVerifyHint', () => {
  it('prefixes stations: all when the rule applies to every station', () => {
    expect(formatVerifyHint({ ...base, stations: 'all' })).toBe('stations: all; check: x-check; covers: y');
  });

  it('prefixes the comma-joined station list when the rule names stations', () => {
    expect(formatVerifyHint({ ...base, stations: ['plan', 'review'] })).toBe(
      'stations: plan, review; check: x-check; covers: y',
    );
  });

  it('renders only the check text when the rule declares no stations', () => {
    expect(formatVerifyHint(base)).toBe('check: x-check; covers: y');
  });

  it('renders the bare stations clause when a declared rule has no check text', () => {
    const noCheck: ConstitutionRule = { severity: 'MUST', name: 'Rule', description: 'd', rationale: 'r' };
    expect(formatVerifyHint({ ...noCheck, stations: 'all' })).toBe('stations: all');
    expect(formatVerifyHint(noCheck)).toBe('');
  });
});
