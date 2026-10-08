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
 * newer published version — never as a routine release chore or ahead of an
 * unfinished release. Unreleased command additions are exercised from source
 * while developing this repository. `2.4.0` is the release that
 * ships the command contract used by the current skills — `prospec-new-story`,
 * `prospec-explore` and `prospec-ff` call `prospec validate proposal`, and the
 * escalation guidance shared by plan, tasks, ff, review, verify and archive calls
 * `prospec change abandon`, surfaces 2.3.x does not have — so a lower floor would
 * let a 2.3.x binary pass the probe and then die mid-station on commander's
 * unknown-command error.
 */
export const MINIMUM_CLI_VERSION = '2.4.0';
