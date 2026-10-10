# CLI Surface

> Thin I/O layer — Commander commands parse args → call one service → format output (78 files)
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `commands/history.ts` / `formatters/history-output.ts` | Lazy paths/import dispatch, enriched help, sanitized human paths and per-entry JSON outcomes; partial import exits 1 while retaining successful entries |
| `commands/change-abandon.ts` / `formatters/change-abandon-output.ts` | Lazy service dispatch, required reason/repeatable overturned leaves, JSON and sanitized local tracker summary |
| `index.ts` | Shebang entry only: imports `enable-compile-cache.js` → `setup-color.js` → `program.js`, then `void runProgram(process.argv)`; declares `GlobalOptions` (type-only import by the command layer, so the entry's run is never pulled into a consumer) |
| `program.ts` | `createProgram()` registers all 20 top-level commands + `preAction` config gate (resolves `.prospec.yaml` against the action's `--cwd`, else cwd); `runProgram(argv)` parses + dispatches errors (exit status on `process.exitCode`, never `process.exit`); registration imports no service (each loads lazily per action); `.version()` from `types/version`. Importable with NO side effects (no argv parse / no output on load) so the e2e suite drives it in-process |
| `enable-compile-cache.ts` | Enables the Node module compile cache (guarded); MUST be the first import in `index.ts`, ahead of `setup-color` and `program` (touches no picocolors) |
| `commands/` | 33 `registerXxxCommand(program)` files: init, quickstart, upgrade, print-template, knowledge (init/update/verify), agent (sync/triggers), config, change (story/abandon/plan/tasks/log/delegate/status/scale/related-modules/progress/auto-draft; story includes `--freeze-scenarios`/`--amend-scenarios`), status, spec show, constitution show, archive (+`finalize`), history (paths/import), review merge, verify (record and `context --change`), learn (upsert/playbook/yield), validate, measure (local session logs, projection mode), check, mcp — parse flags → **`await import()` the service inside the action** → format (registration stays service-free so unused commands' deps never load) |
| `formatters/` | `formatXxxOutput(result, logLevel)` modules (+ `sanitize.ts`, `escaping-notice.ts`, `delegation-settlement-output.ts` — the one delegation line `review merge` and `verify record` both print, never omitted from normal output, naming the failed attempts when every delegation failed and otherwise the two causes it cannot tell apart when no ticket was settled, `test-gate-output.ts` — the one `tests: not-adjudicated` WARN line `change status` and `review merge` both print; `error-output` appends `ESCALATE_TO_HUMAN` + trigger + `count / threshold` for a `TestGateError` whose breaker tripped) — stdout success, stderr errors; all station hand-offs and semantic-review guidance use host-neutral bare Skill identities, while host syntax stays in generated entry configs. Archive and review formatter invariants are documented in the service sub-modules; `status-output` prints each human halt from one `HumanHaltCode`-keyed table and leads with the canonical skill identity as `action:`, prints any resolved skill file as a separate `fallback:`, then the service's reference map as `read:` lines — sanitizing every value, naming no host and deciding nothing itself. `escaping-notice.ts` is the one-line escaped-cell notice a table writer (`review merge`, `learn upsert`) prints only when `escapedCells > 0`, wording from `types/cli-help`'s `ESCAPING_RULE_TEXT`; the 11 agent-called commands mount `renderCommandHelp(COMMAND_HELP_SPECS[…])` via `addHelpText('after', …)` (`status`, `change log`, `change delegate`, `review merge`, `verify record`, `learn upsert`, `learn playbook`, `spec show`, `constitution show`, `history paths`, `history import`). `constitution-output` writes the slice with no trailing newline, so a fail-open run is byte-identical to the file after the shared sanitizer (CR and other control bytes stripped, so a CRLF file round-trips as LF); its last stderr line is `tokens: slice <n> / full <m> (estimateTokens)` (`tokens: full <m>` on fail-open). |
| `log-level.ts` | `resolveLogLevel(opts)` — root-flag → LogLevel |
| `parse-options.ts` | Shared Commander parsers — `parseDepth` (positive int), `parseDate` (bare ISO 8601), `collect` (repeatable option → array), `parseIntOption`, `parseBoundedInt`, `parseRatio` |
| `setup-color.ts` | Sets NO_COLOR for non-TTY stdout before picocolors loads; honors NO_COLOR/FORCE_COLOR |

## Public API

- `history paths [--json]` reports canonical roots and diagnostics; `history import --from <project-root> [--dry-run] [--json]` preserves source bundles. `archive finalize <name> --bundle <archiveIdentity>` uses the exact identity returned by archive.

- `learn playbook --station <s> [--modules <m,…>]` is registered in `commands/learn.ts`; `formatters/learn-output.ts` writes the complete active catalog and station-selected bodies to stdout, and fallback, unknown declaration and over-cap diagnostics to stderr. In station mode, modules only sort catalog rows; `--modules` alone and `--id` retain their legacy output contracts.
- `createProgram()` / `runProgram(argv)` — in `program.ts`: the Commander program (all 20 commands) and the parse+error-dispatch loop; both importable with no side effects. `index.ts` is the shebang entry that calls `runProgram(process.argv)` and exports `GlobalOptions`
- `registerXxxCommand(program)` — 33 registrars; `formatXxxOutput(result, logLevel)` — 42 output functions (+ the `formatEscapingNotice(escapedCells)` and `formatDelegationSettlement(settlement)` helpers; `change-delegate-output` prints a mutation refusal as one `facet: pre-spawn … → now …` line per facet, the checkpoint path and the hand-off sentence, every value sanitized); `handleError(err, verbose)` → stderr
- `resolveLogLevel(opts)` / `parseDepth(value)` / `parseDate(value)` / `collect(value, prev)` / `parseIntOption` / `parseBoundedInt` / `parseRatio` — shared cli helpers
- `sanitizeTerminal(s)` — in `formatters/sanitize.ts`, re-exported by `check-output.ts`
- `GlobalOptions` (type) — `{ verbose?, quiet? }`

## Dependencies

**Depends on:** `services` (command actions call their service), `types` (errors, config, LogLevel, `PROSPEC_VERSION`)
**Used by:** `tests` (E2E drive `createProgram`/`runProgram` from `program.ts` in-process; a handful of subprocess smokes still spawn the compiled `dist/cli/index.js`) — entry point, no internal consumers

## Modification Guide

1. **Add a command** — `commands/{name}.ts` with `registerXxxCommand(program)` + matching `formatters/{name}-output.ts`; register in `program.ts` (+ E2E test).
2. **Add a station command** — take the skill's judgment as a `--*-json` file/flag, hand it to one service, print the service's verdict; never decide in the CLI.
3. **Add a flag** — `.option()` in the command file; reuse `parseDepth`/`parseDate`/`collect`/`resolveLogLevel` (option-name changes break E2E tests).
4. **Change error output** — `formatters/error-output.ts`, dispatch by error class.
5. **Change log-level / shared parsers** — edit once in `log-level.ts` / `parse-options.ts`, never per-command.

## Ripple Effects

- `preAction` in `program.ts` runs before every command; option/command-name changes silently break E2E tests.

## Pitfalls

- Abandon human output names the dedicated abandoned destination; its JSON preserves the `archiveDir` key with the same actual path and adds `preservedFileCount`. Normal output reports the captured count, unrestored work tree and human restoration decision using preservation/version control; quiet remains silent.

- History import JSON keeps the complete per-entry report on stdout even with exit 1; command-level errors, including `HistoryError` retained-path details, go to stderr. Quiet suppresses success text, never conflicts or failures.

- Human abandon/history/retry output sanitizes file-derived values. JSON preserves typed partial phase/path/entry details on stderr with exit 1; the tracker summary is local text, never a network write.

- `validate proposal <change> [--json]` addresses a change name, not an arbitrary file. `premise-output.ts` renders shared structural-limit and legacy/exemption notices; validation policy stays in lib/services. Status may route to `prospec-explore` while preserving the recorded lifecycle status.

- `review merge`, `verify record` and `change log` support `--json`: success on stdout, structured refusal on stderr with exit 1. Shared error formatting prints service-owned decisions, partial persistence and observed-only events; history and replay labels remain visible after PASS.

- Ordinary status routing excludes Handlebars and stays under 250 dependency modules; recognized saved-report assessment runs canonical rendering with a separate 300-module ceiling. Both paths retain the four unrelated-heavy-dependency exclusions.
- Archive target-fence refusals print the sanitized source path and instruct the user to close the fence before retrying.
- Evidence formatters project service reasons for changed inputs, legacy versions and uncertified attempts; never derive validity or suggest a commit-only rebaseline.

- No business logic in cli — always delegate to services; `.action()` callbacks are async → `await` + try/catch with `handleError()`.
- A flag declared on BOTH a parent and its subcommand (e.g. `--dry-run` on `archive` and `archive finalize`) binds to the PARENT — the subcommand's own `opts()` arrives EMPTY, so reading it would silently write on a dry run. Use `optsWithGlobals()` in such an action (and keep the action a `function` so `this` is the Command).
- Success → stdout, errors → stderr; `mcp serve` keeps stdout byte-clean (JSON-RPC channel — any write corrupts the session; contract test spies on `process.stdout.write`).
- `check --strict` ∧ hasFail → exit 1 (warn/skipped never affect it); skipped ≠ PASS — show its reason. `--record-review`/`--record-tests` are non-check modes that exit without grading drift, so they never touch the exit code; `--auto-draft` is REFUSED alongside them (`PrerequisiteError`) rather than accepted and ignored, and drafting runs after the report is written so it cannot discard it, yet a failed draft exits 1. `change auto-draft` exits 1 when any group's scaffold could not be written (`failedCount > 0`) — the other groups are still reported. `--json` help names its output file (`prospec-report.json`) — keep it in step when a mode gains a file. `--json` only WRITES that file: stdout stays human-readable formatted text in every mode, so a caller wanting structured facts reads the file and never pipes stdout.
- Station-command flag grammar is deliberately non-uniform, and a rejection does not always come from the same layer — the error type says where to look: `change log` takes EXACTLY ONE of a composed entry (`--result` + the station fields), `--verifier-report <file>` (plan/tasks) or `--signoff <option>` (the human plan sign-off, which Commander declares exclusive of the other two and of every composed-entry field; `--warning` stays as the human's notes) — refused together at both layers, and refused when none is given (its `--criticals-found/--criticals-fixed/--majors` are prospec-review expected-value audit inputs — compared to the CLI-owned round counts, never written through); `verify record` takes verdicts EITHER as `--dimension name=result` — the three gate results UPPERCASE (`PASS`/`WARN`/`FAIL`), the two non-adjudicated states lowercase, anything else refused by commander (`InvalidArgumentError`) — OR as a `--dimensions <file>` JSON array that also carries each dimension's evidence and per-entry grading context; the flag form declares that context run-level (`--graded-by` enum-validated by the parser, `--executor` non-empty — both refused alongside `--dimensions`), and `check --graded-by` rides `--record-review` the same way; the two verdict sources are mutually exclusive, refused at BOTH layers — `Option.conflicts()`, so commander renders a usage error rather than `handleError`'s "unexpected error" (which is what throwing from the action produced), and the service again (`PrerequisiteError`) for programmatic callers; `learn upsert --lesson` takes exactly ONE JSON object per call — an array fails schema validation in the service (`PrerequisiteError`) — and that schema is non-strict, so an unknown key such as `status` is silently DROPPED rather than refused (a ledger status transition is a human-approved hand edit, never a flag); `--related-module` exists ONLY on `change story`, and `--issue` on `change story` and `change auto-draft` (whose refusal of an existing directory, `AlreadyExistsError`, is service-layer as well) — a missed `--issue` means rebuilding the change; `change related-modules` amends `related_modules`.
- `upgrade-output.ts` labels (`Docs inventory:`, `stale Language Policy wording:`, `Current Language Policy rule:`) are the `/prospec-upgrade` skill's parse contract — renaming one silently disables the step that reads it.
- `sanitizeTerminal()` strips C0/C1/DEL and lives once in `formatters/sanitize.ts` — EVERY formatter must route free-form repo/report/error/finding strings through it (reimplementing, or forgetting it in a new formatter, reopens the ANSI/OSC-injection gap). `measure-output.ts` stays verdict-free (numbers only, REQ-MEASURE-005).
- `setup-color.ts` MUST precede any picocolors import in `index.ts` — only the picocolors-free `enable-compile-cache.ts` sits ahead of it; reordering it after a picocolors consumer re-enables color on non-TTY stdout and corrupts piped output.
- A command's service loads via `await import()` INSIDE the action, never at module top — registration imports no service, so `--version`/`status`/`check` never pull command-irrelevant heavy deps (MCP SDK, @inquirer, xml/toml parsers). A formatter that needs a shared helper imports it from `types`/`services`, never a cli→lib shortcut (eslint-enforced). The startup guard `scripts/measure-startup-modules.ts` (+ `tests/e2e/startup-modules.test.ts`) pins the load set — a static service import at a command's top would regress it.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
