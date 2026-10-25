import { describe, it, expect } from 'vitest';
import {
  SOURCE_DIGEST_VERSION,
  gitBlobId,
  isCurrentDigestFormat,
  moduleSourceDigest,
  objectFormatOf,
} from '../../../src/lib/source-digest.js';

// Expected values computed independently: blob ids by `git hash-object` in a sha1 and a
// sha256 repository, digests by a separate implementation of the length-prefixed framing.
const HELLO_SHA1 = 'ce013625030ba8dba906f756967f9e9ca394464a';
const HELLO_SHA256 = '2cf8d83d9ee29543b34a87727421fdecb7e3f3a183d337639025de576db9ebb4';
const OTHER_ID = 'f9b1b3292aef3b8c2b4b5c7f4f2d0f6b5c1a0d3e';

describe('moduleSourceDigest (REQ-LIB-015)', () => {
  it('pins the digest of fixed index ids so every platform computes the same value', () => {
    expect(
      moduleSourceDigest([
        { path: 'src/b.ts', id: HELLO_SHA1 },
        { path: 'src/a.ts', id: OTHER_ID },
      ]),
    ).toBe(`${SOURCE_DIGEST_VERSION}:a9b8af895519d35164315a6da6b7480e2de00435076cdafcf96aba1033eb7bd5`);
  });

  it('pins the digest of a module with no files', () => {
    expect(moduleSourceDigest([])).toBe(
      `${SOURCE_DIGEST_VERSION}:27d413fc0ca3547404efe915c9da2608eb08f49e8762348eacbf3c7f79c60ede`,
    );
  });

  it('depends on content and path, never on input order', () => {
    const a = { path: 'src/a.ts', id: HELLO_SHA1 };
    const b = { path: 'src/b.ts', id: OTHER_ID };
    expect(moduleSourceDigest([a, b])).toBe(moduleSourceDigest([b, a]));
    expect(moduleSourceDigest([a, b])).not.toBe(moduleSourceDigest([a, { ...b, id: HELLO_SHA1 }]));
    expect(moduleSourceDigest([a])).not.toBe(moduleSourceDigest([{ ...a, path: 'src/renamed.ts' }]));
  });

  it('frames each field so concatenations cannot collide', () => {
    expect(moduleSourceDigest([{ path: 'ab', id: 'c' }])).not.toBe(moduleSourceDigest([{ path: 'a', id: 'bc' }]));
  });
});

describe('isCurrentDigestFormat', () => {
  it('accepts only the current version with a sha256 hex body', () => {
    expect(isCurrentDigestFormat(moduleSourceDigest([]))).toBe(true);
    expect(isCurrentDigestFormat(`source-v0:${'0'.repeat(64)}`)).toBe(false);
    expect(isCurrentDigestFormat(`${SOURCE_DIGEST_VERSION}:${'0'.repeat(63)}`)).toBe(false);
    expect(isCurrentDigestFormat(`${SOURCE_DIGEST_VERSION}:${'G'.repeat(64)}`)).toBe(false);
    expect(isCurrentDigestFormat(undefined)).toBe(false);
  });
});

describe('gitBlobId', () => {
  it('matches git hash-object for both object formats', () => {
    expect(gitBlobId(Buffer.from('hello\n'), 'sha1')).toBe(HELLO_SHA1);
    expect(gitBlobId(Buffer.from('hello\n'), 'sha256')).toBe(HELLO_SHA256);
    expect(gitBlobId(Buffer.from('../target.txt'), 'sha1')).toBe('f9b1b32e6647369a82e9f90b38393d3cbe785a10');
  });

  it('infers the object format from an object id', () => {
    expect(objectFormatOf(HELLO_SHA1)).toBe('sha1');
    expect(objectFormatOf(HELLO_SHA256)).toBe('sha256');
    expect(objectFormatOf('abc')).toBeNull();
  });
});
