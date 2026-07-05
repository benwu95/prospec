# cli

> Thin CLI orchestration layer — parse args → call service → format output (Commander.js, 30 files, ~1,615 lines)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | createProgram(), main(), preAction config check (resolves `.prospec.yaml` against `mcp serve --cwd <path>` when given, else cwd), command registration (imports `setup-color.js` first); `upgrade` is registered but deliberately NOT in `INIT_COMMANDS`, so the config-existence gate blocks it on an uninitialized project; `.version()` uses `PROSPEC_VERSION` from `types/version` (single source) |
| `src/cli/setup-color.ts` | Sets NO_COLOR for non-TTY stdout before picocolors loads — keeps piped/`tee`'d output free of raw ANSI; honors explicit NO_COLOR/FORCE_COLOR |
| `src/cli/log-level.ts` | resolveLogLevel(opts) — shared root-flag → LogLevel resolver imported by every command file |
| `src/cli/parse-options.ts` | parseDepth(value) — shared validating `--depth` parser (throws on NaN/<1); used by `knowledge init` |
| `src/cli/commands/init.ts` | `prospec init` — project initialization |
| `src/cli/commands/quickstart.ts` | `prospec quickstart` — one-command onboarding (init + agent sync, skip-completed); in INIT_COMMANDS so it runs before `.prospec.yaml` exists |
| `src/cli/commands/upgrade.ts` | `prospec upgrade` (`registerUpgradeCommand`) — record version + agent sync + raw-scan refresh + **back-fill of missing init docs** + report (incl. the docs inventory + the `created …` list); NOT in INIT_COMMANDS, so it requires an initialized project. On an interactive TTY it prompts to fill config-field nudges (like `init`); `--no-interactive` (and any non-TTY stdin) forces report-only — `interactive = !--no-interactive && process.stdin.isTTY` — so the skill/CI never block |
| `src/cli/commands/knowledge-init.ts` | `prospec knowledge init [--raw-scan-only]` — scan + raw-scan generation (+ curated skeletons when absent); `--raw-scan-only` regenerates raw-scan.md only, leaving curated module-map/index.md/_conventions untouched (deterministic, no LLM; `--depth`/`--dry-run` supported) |
| `src/cli/commands/change-story.ts` | `prospec change story` — create change proposal |
| `src/cli/commands/change-plan.ts` | `prospec change plan` — generate implementation plan; `--force` overwrites an existing plan.md/delta-spec.md |
| `src/cli/commands/change-tasks.ts` | `prospec change tasks` — break plan into tasks; `--force` overwrites an existing tasks.md |
| `src/cli/commands/agent-sync.ts` | `prospec agent sync` — multi-agent config deployment; the formatter (`agent-sync-output.ts`) reports swept orphan skills (`removedSkills`) alongside warnings/hints |
| `src/cli/commands/measure.ts` | `prospec measure [--offline]` — read-only token measurement report display; `--offline` displays the keyless `size-report.json` size estimate instead |
| `src/cli/commands/check.ts` | `prospec check` — drift check; `--strict` ∧ hasFail → exitCode 1 (warn/skipped never affect it); `--record-review` records the active change's review baseline (`--change <name>` disambiguates when several are in flight) |
| `src/cli/commands/mcp.ts` | `prospec mcp serve [--cwd <path>]` — read-only MCP server on stdio (`--cwd` pins the served project root, default `process.cwd()`, so one agent can run several project servers); action writes nothing to stdout |
| `src/cli/formatters/mcp-output.ts` | Startup banner to STDERR by design — stdout is the MCP protocol channel |
| `src/cli/formatters/measure-output.ts` | Per-provider sections, two baselines, warm asterisk — numbers only, no verdicts; `formatSizeOutput` renders the offline size table (size + saving ratio only, no cache/cost columns, no thresholds); report-derived strings go through `sanitizeTerminal()` |
| `src/cli/formatters/check-output.ts` | Five check statuses with explicit skip reasons; re-exports `sanitizeTerminal()` from `sanitize.ts` to strip C0/C1 from untrusted repo strings |
| `src/cli/formatters/error-output.ts` | handleError() — error type dispatch to stderr; error message/suggestion strings go through `sanitizeTerminal()` |
| `src/cli/formatters/sanitize.ts` | Shared helper (not a formatXxxOutput module) — `sanitizeTerminal()` codepoint-based stripper (C0 except tab/newline, plus C1/DEL); single source consumed by check/measure/error output to close the ANSI/OSC-injection gap |
| `src/cli/formatters/init-output.ts` | formatInitOutput() — init command output |
| `src/cli/formatters/upgrade-output.ts` | formatUpgradeOutput() — version delta + interactively-resolved nudge confirmations + config-field nudges / skills-missing-triggers / up-to-date + `Docs inventory:` section (fixed parse-friendly lines the /prospec-upgrade skill consumes as its scan scope: `✓ <path> (template: <hbs>)` / `✗ <path> — MISSING (template: <hbs>)`, paths through `sanitizeTerminal`) + a `created N missing doc(s): …` line for the docs upgrade back-filled (still-MISSING ⇒ back-fill failed) + next-step hint |

## Public API

- `createProgram()` — Create Commander.js program with all 12 commands registered
- `GlobalOptions` (type) — `{ verbose?, quiet? }`; resolved into a LogLevel via the shared `cli/log-level.resolveLogLevel`
- `resolveLogLevel(opts)` — root flags → LogLevel; one shared impl, imported by every command
- `parseDepth(value)` — `--depth` Commander parser; positive integer or throws
- `registerXxxCommand(program)` — 12 command registration functions (one per command)
- `formatXxxOutput(result, logLevel)` — 14 formatter modules (stdout for success, stderr for errors; `mcp serve` is the one deliberate exception: success banner also goes stderr); `error-output.ts` also exports `handleError()`
- `sanitizeTerminal(s)` — single source in `formatters/sanitize.ts`; re-exported by `check-output.ts` so existing importers/contract test keep their path; also consumed by `measure-output.ts` and `error-output.ts`
- `main()` — entry point (create program → parse argv → handle errors); NOT exported — runs on module load

## Dependencies

- **depends_on**: `services` (all execute functions), `types` (errors, config, LogLevel)
- **used_by**: None (entry point — user-facing)

## Modification Guide

1. Adding a new command: Create `src/cli/commands/{name}.ts` with `registerXxxCommand(program)`, create matching formatter, register in `index.ts`.
2. Adding a formatter: Create `src/cli/formatters/{name}-output.ts` with `formatXxxOutput(result, logLevel)`.
3. Changing error output: Modify `formatters/error-output.ts` — dispatch by error class type.
4. Log-level / `--depth` rules are shared cli helpers — change once in `cli/log-level.ts` (resolveLogLevel) or `cli/parse-options.ts` (parseDepth), not per-command.

## Ripple Effects

- New commands need: service (execute), formatter (output), registration (index.ts), E2E test
- `preAction` hook in `index.ts` changes affect ALL commands — config check runs before every command
- Error output format changes affect E2E test expectations
- Command option name changes break E2E tests silently (spawns real CLI)

## Pitfalls

- CLI layer must NOT contain business logic — always delegate to services
- Commander.js `.action()` callbacks are async — always `await` and wrap in try/catch with `handleError()`
- Success output → stdout, error output → stderr — never mix channels
- E2E tests spawn the compiled `dist/cli/index.js` (via `process.execPath`, requires `pnpm build`) — any option/command name change breaks them
- `measure-output.ts` must stay verdict-free (numbers only, REQ-MEASURE-005) — never add PASS/FAIL-style threshold judgments to its output
- `check-output.ts` must show skipped checks with their reason (skipped ≠ PASS) and route untrusted strings through `sanitizeTerminal()`; the semantic line stays `not-checked`
- `sanitizeTerminal()` lives once in `formatters/sanitize.ts` — any formatter emitting free-form repo/report/error strings (check/measure/error) must route them through it, not reimplement; reimplementing reopens the ANSI/OSC-injection gap on that consumer
- `setup-color.ts` MUST be the first import in `index.ts` (before any picocolors consumer — cli formatters and `lib/logger` share one picocolors singleton); reordering re-enables color on non-TTY stdout and corrupts piped output (e.g. the CI comment job)
- `mcp serve` must keep stdout byte-clean — it is the JSON-RPC channel; any stdout write corrupts the MCP session (contract test spies on process.stdout.write)

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
