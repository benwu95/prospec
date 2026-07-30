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
 * The oldest CLI version the deployed skills' cli-first delegation works against.
 *
 * Injected into skill templates as the probe floor (`{{minimum_cli_version}}`):
 * every skill's startup probe STOPs when the installed `prospec --version` is
 * older, because the skill's deterministic steps call commands this version
 * introduced. Bump ONLY when a skill starts calling a CLI surface added in a
 * newer version — never as a routine release chore. It names the version that
 * SHIPS those commands, so during development it runs ahead of `package.json`
 * until the release bumps to match: `1.0.0` is the release that makes the CLI a
 * required file, and a floor below it would let an older binary — one without
 * these commands — pass the probe.
 */
export const MINIMUM_CLI_VERSION = '1.0.0';
