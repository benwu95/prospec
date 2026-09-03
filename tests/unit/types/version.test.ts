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

describe('MINIMUM_CLI_VERSION', () => {
  it('requires the CLI version that ships the 2.0 skill contract', async () => {
    vi.resetModules();
    const { MINIMUM_CLI_VERSION } = await import('../../../src/types/version.js');
    expect(MINIMUM_CLI_VERSION).toBe('2.1.0');
  });

  it('is a plain three-part semver literal (the probe floor skills render)', async () => {
    vi.resetModules();
    const { MINIMUM_CLI_VERSION } = await import('../../../src/types/version.js');
    expect(MINIMUM_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is not influenced by the PROSPEC_VERSION env override', async () => {
    vi.stubEnv('PROSPEC_VERSION', '9.9.9-test');
    vi.resetModules();
    const { MINIMUM_CLI_VERSION } = await import('../../../src/types/version.js');
    expect(MINIMUM_CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MINIMUM_CLI_VERSION).not.toBe('9.9.9-test');
  });
});
