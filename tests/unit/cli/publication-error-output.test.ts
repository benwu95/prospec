import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleError } from '../../../src/cli/formatters/error-output.js';
import { MetadataWriteError, ProspecError, SignoffWriteError } from '../../../src/types/errors.js';

afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

describe('publication error output', () => {
  it.each([false, true])('keeps typed metadata and sign-off milestones in %s JSON mode', (json) => {
    const metadata = { metadataPath: '/change/metadata.yaml', claimPath: '/change/.metadata.yaml.write-claim', metadata_published: true };
    const signoff = { metadataPath: metadata.metadataPath, decisionPath: '/change/candidates/decision.json', decision_published: true, metadata_recorded: true };
    const error = new SignoffWriteError(signoff, new MetadataWriteError(metadata, new Error('cleanup failed')));
    let out = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { out += String(chunk); return true; });
    handleError(error, false, json);
    expect(process.exitCode).toBe(1);
    if (json) {
      expect(JSON.parse(out).error.publication).toEqual({ signoff, metadata });
    } else {
      expect(out).toContain(metadata.claimPath);
      expect(out).toContain('"metadata_published":true');
      expect(out).toContain('"metadata_recorded":true');
    }
  });

  it('preserves a private staging target through nested wrappers and stops on a cause cycle', () => {
    const details = { metadataPath: '/staging/metadata.yaml', claimPath: '/staging/.metadata.yaml.write-claim', metadata_published: true };
    const inner = new MetadataWriteError(details, undefined);
    const wrapper = new ProspecError('bundle not published', 'WRAPPED', 'inspect staging', { cause: inner });
    inner.cause = wrapper;
    let out = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { out += String(chunk); return true; });
    handleError(wrapper, false, true);
    const result = JSON.parse(out).error;
    expect(result.code).toBe('WRAPPED');
    expect(result.publication).toEqual({ metadata: details });
  });
});
