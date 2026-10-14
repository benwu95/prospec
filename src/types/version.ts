import { createRequire } from 'node:module';

/**
 * Single source for the prospec CLI/template version.
 *
 * Lives in the leaf `types` layer because both `cli` (commander `--version`) and
 * `services` (init seeds `.prospec.yaml` `version`, upgrade refreshes it) need it,
 * and the dependency rule forbids `cli → lib` directly. Read from the package's
 * own package.json so there is no duplicated version literal anywhere.
 */
let pkgVersion = '';
try {
  const require = createRequire(import.meta.url);
  const pkg = require('../../package.json') as { version: string };
  pkgVersion = pkg.version;
} catch {
  // Fallback for bundled/compiled environments where package.json does not exist
  pkgVersion = '0.0.0-bundled';
}

export const PROSPEC_VERSION: string = process.env.PROSPEC_VERSION || pkgVersion;

/**
 * The oldest CLI supporting the deployed skills' command and evidence contracts.
 * Injected into every startup probe as `{{minimum_cli_version}}`.
 * The opt-in verify path consumes certified test_evidence from the 2.7 report;
 * an older binary cannot supply that assessment. Raise this floor when the
 * shipped skills require a newer contract, independently of package releases.
 */
export const MINIMUM_CLI_VERSION = '2.7.0';
