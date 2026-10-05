import { describe, expect, it } from 'vitest';
import { CHANGE_STATUSES, GATE_OWNED_STATUSES, ChangeMetadataSchema, NewChangeMetadataSchema } from '../../../src/types/change.js';
import { PremiseSchema } from '../../../src/types/premise.js';
import { verifiedPremise } from '../../helpers/premise.js';

const base = { name: 'attempt', created_at: '2026-10-05', status: 'story' };
describe('abandon and retry metadata', () => {
  it('recognizes a gate-owned terminal state', () => {
    expect(CHANGE_STATUSES).toContain('abandoned');
    expect(GATE_OWNED_STATUSES).toContain('abandoned');
    expect(ChangeMetadataSchema.parse({ ...base, status: 'abandoned' }).status).toBe('abandoned');
  });
  it.each([ChangeMetadataSchema, NewChangeMetadataSchema])('preserves legacy absence and new empty linkage', (schema) => {
    expect(schema.parse(base).retry_of).toBeUndefined();
    expect(schema.parse({ ...base, retry_of: [] }).retry_of).toEqual([]);
  });
  it.each([null, 'old', [{ archive: '../escape', digest: 'a'.repeat(64) }], [{ archive: '2026-10-05-old', digest: 'bad' }]])('refuses malformed linkage %#', (retry_of) => {
    expect(ChangeMetadataSchema.safeParse({ ...base, retry_of }).success).toBe(false);
  });
  it('retains declared overturned values without guessing', () => {
    const abandonment = { reason: 'Premise withdrawn', at: '2026-10-05T00:00:00Z', from_status: 'plan', escalation: null, overturned: [{ field: 'problem', value: 'Original problem' }], premise_note: 'Declared fields only', manifest: 'preservation/manifest.json' };
    expect(NewChangeMetadataSchema.parse({ ...base, status: 'abandoned', abandonment }).abandonment).toEqual(abandonment);
    expect(ChangeMetadataSchema.safeParse({ ...base, abandonment: { ...abandonment, reason: ' ' } }).success).toBe(false);
  });
  it('accepts the optional difference while preserving source', () => {
    const parsed = PremiseSchema.parse({ ...verifiedPremise, retry_difference: 'Changed the preservation strategy after the previous loss.' });
    expect(parsed.retry_difference).toContain('preservation');
    expect(parsed.source).toBe('ai-proposed');
  });
});
