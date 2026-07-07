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
