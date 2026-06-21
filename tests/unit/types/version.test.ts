import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { PROSPEC_VERSION } from '../../../src/types/version.js';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { version: string };

describe('PROSPEC_VERSION', () => {
  it('equals the package.json version (single source, no duplicated literal)', () => {
    expect(PROSPEC_VERSION).toBe(pkg.version);
  });

  it('is a non-empty semver-ish string', () => {
    expect(PROSPEC_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
