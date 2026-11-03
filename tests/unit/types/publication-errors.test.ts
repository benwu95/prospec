import { describe, expect, it } from 'vitest';
import { MetadataWriteError, ProspecError, SignoffWriteError } from '../../../src/types/errors.js';

describe('publication error milestones', () => {
  it.each([false, true])('preserves metadata publication=%s and recovery paths', (published) => {
    const cause = new Error('claim cleanup failed');
    const details = { metadataPath: '/change/metadata.yaml', claimPath: '/change/.metadata.yaml.write-claim', metadata_published: published };
    const error = new MetadataWriteError(details, cause);
    expect(error).toBeInstanceOf(ProspecError);
    expect(error.code).toBe('METADATA_WRITE_FAILED');
    expect(error.details).toEqual(details);
    expect(error.cause).toBe(cause);
    expect(error.suggestion).toContain(details.claimPath);
    expect(error.suggestion).toMatch(/inspect|Inspect/);
  });

  it.each([[false, false], [true, false], [true, true]])('preserves sign-off decision=%s metadata=%s without a rollback claim', (decision, metadata) => {
    const cause = new Error('publication failed');
    const details = { metadataPath: '/change/metadata.yaml', decisionPath: '/change/candidates/decision.json', decision_published: decision, metadata_recorded: metadata };
    const error = new SignoffWriteError(details, cause);
    expect(error.code).toBe('SIGNOFF_WRITE_FAILED');
    expect(error.details).toEqual(details);
    expect(error.cause).toBe(cause);
    expect(error.suggestion).toMatch(/current|Current/);
    expect(error.message).not.toMatch(/rolled back|nothing was written/);
  });
});
