import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../../../package.json') as { version: string };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PROSPEC_VERSION', () => {
  it('equals the package.json version (single source, no duplicated literal)', async () => {
    vi.resetModules();
    const { PROSPEC_VERSION } = await import('../../../src/types/version.js');
    expect(PROSPEC_VERSION).toBe(pkg.version);
  });

  it('uses process.env.PROSPEC_VERSION when present', async () => {
    vi.stubEnv('PROSPEC_VERSION', '9.9.9-test');
    vi.resetModules();
    const { PROSPEC_VERSION } = await import('../../../src/types/version.js');
    expect(PROSPEC_VERSION).toBe('9.9.9-test');
  });

  it('is a non-empty semver-ish string', async () => {
    vi.resetModules();
    const { PROSPEC_VERSION } = await import('../../../src/types/version.js');
    expect(PROSPEC_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
