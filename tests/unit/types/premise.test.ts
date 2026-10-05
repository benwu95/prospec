import { describe, it, expect } from 'vitest';
import { PremiseSchema } from '../../../src/types/premise.js';
import { ChangeMetadataSchema, NewChangeMetadataSchema } from '../../../src/types/change.js';
import { ROUTE_TARGET_SKILLS, SDD_STATIONS } from '../../../src/types/status.js';
import { VALIDATE_KINDS } from '../../../src/types/station.js';

const premise = {
  problem: 'Repeated requests lose the original source.',
  source: 'ai-proposed', source_ref: 'Investigation src/service.ts:42',
  evidence: { kind: 'observation', ref: 'test log', result: 'Source was overwritten.' },
  withdrawal: 'Withdraw if source is already preserved.',
  verification: { status: 'verified', by: 'maintainer', conclusion: 'Confirmed in the reproduction.' },
};

describe('Premise contracts', () => {
  it.each(['user-observation', 'third-party-report', 'ai-proposed'])('accepts original source %s', (source) => {
    expect(PremiseSchema.parse({ ...premise, source }).source).toBe(source);
  });
  it('preserves pending as a valid declaration requiring later assessment', () => {
    expect(PremiseSchema.parse({ ...premise, verification: { status: 'pending', by: '', conclusion: '' } }).verification.status).toBe('pending');
  });
  it.each([
    { ...premise, source: 'verified' },
    { ...premise, problem: 123 },
    { ...premise, extra: 'typo' },
    { ...premise, evidence: { ...premise.evidence, extra: 'typo' } },
    { ...premise, verification: { ...premise.verification, status: 'approved' } },
  ])('rejects malformed declaration %#', (value) => {
    expect(PremiseSchema.safeParse(value).success).toBe(false);
  });
  it('requires reproduction details', () => {
    expect(PremiseSchema.safeParse({ ...premise, evidence: { ...premise.evidence, kind: 'reproduction' } }).success).toBe(false);
    expect(PremiseSchema.safeParse({ ...premise, evidence: { ...premise.evidence, kind: 'reproduction', steps: 'Run test', expected: 'Keep source', actual: 'Source replaced' } }).success).toBe(true);
  });
  it.each([ChangeMetadataSchema, NewChangeMetadataSchema])('models metadata version without blocking legacy', (schema) => {
    const base = { name: 'sample', created_at: '2026-10-05', status: 'story' };
    expect(schema.parse(base).premise_version).toBeUndefined();
    expect(schema.parse({ ...base, premise_version: 1 }).premise_version).toBe(1);
    for (const version of [0, 2, '1', null]) expect(schema.safeParse({ ...base, premise_version: version }).success).toBe(false);
  });
  it('adds exploration as a route target, leaving lifecycle vocabulary intact', () => {
    expect(ROUTE_TARGET_SKILLS.explore).toBe('prospec-explore');
    expect(SDD_STATIONS).not.toContain('explore');
    expect(VALIDATE_KINDS).toContain('proposal');
  });
});
