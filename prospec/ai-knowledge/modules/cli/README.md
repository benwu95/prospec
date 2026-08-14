# CLI Surface

> Thin I/O layer — Commander commands parse args → call one service → format output (58 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | `createProgram()` registers all 18 top-level commands + `preAction` config gate (resolves `.prospec.yaml` against `mcp serve --cwd`, else cwd); `main()` entry; `setup-color.js` first import; `.version()` from `types/version` |
| `commands/` | 26 `registerXxxCommand(program)` files: init, quickstart, upgrade, print-template, knowledge (init/update), agent (sync/triggers), config, change (story/plan/tasks/log/status/scale/progress), status, spec show, archive (+`finalize`), review merge, verify record, learn, validate, measure (with projection mode), check, mcp — parse flags → call service → format |
| `formatters/` | 27 `formatXxxOutput(result, logLevel)` modules (+ `sanitize.ts`) — stdout success, stderr errors; `review-merge-output.ts` prints the round's criticals as a bounded digest (claim line + `repro` line) and NEVER the evidence prose, which is what makes the artifact the only place it lives; `error-output.ts` also has `handleError()`; `archive-output.ts` prints each dry-run `PlannedMutation` by its action — including `skip`, a planned NON-mutation (a write the run will deliberately not perform), rendered by the same generic branch — and routes skipped/refused/not-found to stderr (each drives exit 1, visible under `--quiet`). Two spec-loss worklists are BLOCKING-class — exit 1, feature spec left unwritten, and the wording says so: `refusedRequirements` and `droppedBehavior` (printed in full per bullet, never as a count). Six stay WARNING-class (visible under `--quiet`, never exit 1): `refusedReconciliations`, `pendingConvergence`, `acknowledgedDrops`, `staleDeclarations`, `missingChangeHistory` (no `## Change History` host for the graduation row), `productSpecDeclined` — the last being the only signal separating a deliberate non-write from a successful sync. What each one means is in `services`' Spec Sync sub-module |
| `log-level.ts` | `resolveLogLevel(opts)` — root-flag → LogLevel; imported by every command |
| `parse-options.ts` | Shared Commander parsers — `parseDepth` (positive int), `parseDate` (bare ISO 8601), `collect` (repeatable option → array) |
| `setup-color.ts` | Sets NO_COLOR for non-TTY stdout before picocolors loads; honors NO_COLOR/FORCE_COLOR |

## Public API

- `createProgram()` — Commander program, all 18 top-level commands; `main()` runs on load (NOT exported)
- `registerXxxCommand(program)` — 26 registrars; `formatXxxOutput(result, logLevel)` — 27 formatters; `handleError(err, verbose)` → stderr
- `resolveLogLevel(opts)` / `parseDepth(value)` / `parseDate(value)` / `collect(value, prev)` — shared cli helpers
- `sanitizeTerminal(s)` — in `formatters/sanitize.ts`, re-exported by `check-output.ts`
- `GlobalOptions` (type) — `{ verbose?, quiet? }`

## Dependencies

**Depends on:** `services` (every command calls one `execute()`), `types` (errors, config, LogLevel, `PROSPEC_VERSION`), `lib` (shared picocolors singleton via `logger`)
**Used by:** `tests` (E2E spawn the compiled `dist/cli/index.js`) — entry point, no internal consumers

## Modification Guide

1. **Add a command** — `commands/{name}.ts` with `registerXxxCommand(program)` + matching `formatters/{name}-output.ts`; register in `index.ts` (+ E2E test).
2. **Add a station command** — take the skill's judgment as a `--*-json` file/flag, hand it to one service, print the service's verdict; never decide in the CLI.
3. **Add a flag** — `.option()` in the command file; reuse `parseDepth`/`parseDate`/`collect`/`resolveLogLevel` (option-name changes break E2E tests).
4. **Change error output** — `formatters/error-output.ts`, dispatch by error class.
5. **Change log-level / shared parsers** — edit once in `log-level.ts` / `parse-options.ts`, never per-command.

## Ripple Effects

- `preAction` in `index.ts` runs before every command; option/command-name changes silently break E2E tests (they spawn the real compiled CLI).

## Pitfalls

- No business logic in cli — always delegate to services; `.action()` callbacks are async → `await` + try/catch with `handleError()`.
- A flag declared on BOTH a parent and its subcommand (e.g. `--dry-run` on `archive` and `archive finalize`) binds to the PARENT — the subcommand's own `opts()` arrives EMPTY, so reading it would silently write on a dry run. Use `optsWithGlobals()` in such an action (and keep the action a `function` so `this` is the Command).
- Success → stdout, errors → stderr; `mcp serve` keeps stdout byte-clean (JSON-RPC channel — any write corrupts the session; contract test spies on `process.stdout.write`).
- `check --strict` ∧ hasFail → exit 1 (warn/skipped never affect it); skipped ≠ PASS — show its reason. `--record-tests`/`--escaped-defects` are non-check modes that exit without grading drift, so they never touch the exit code. `--json` help names its output file per mode (`prospec-report.json`; `escaped-defect-report.json` with `--escaped-defects`) — keep it in step when a mode gains a file. `--json` only WRITES that file: stdout stays human-readable formatted text in every mode, so a caller wanting structured facts reads the file and never pipes stdout.
- Station-command flag grammar is deliberately non-uniform, and a rejection does not always come from the same layer — the error type says where to look: `verify record` takes verdicts EITHER as `--dimension name=result` — the three gate results UPPERCASE (`PASS`/`WARN`/`FAIL`), the two non-adjudicated states lowercase, anything else refused by commander (`InvalidArgumentError`) — OR as a `--dimensions <file>` JSON array that also carries each dimension's evidence; the two are mutually exclusive, refused at BOTH layers — `Option.conflicts()`, so commander renders a usage error rather than `handleError`'s "unexpected error" (which is what throwing from the action produced), and the service again (`PrerequisiteError`) for programmatic callers; `learn upsert --lesson` takes exactly ONE JSON object per call — an array fails schema validation in the service (`PrerequisiteError`) — and that schema is non-strict, so an unknown key such as `status` is silently DROPPED rather than refused (a ledger status transition is a human-approved hand edit, never a flag); `--related-module` and `--issue` exist ONLY on `change story` (whose refusal of an existing directory, `AlreadyExistsError`, is service-layer as well) — either missed at scaffold time is recovered by rebuilding the change, not by amending it.
- `upgrade-output.ts` labels (`Docs inventory:`, `stale Language Policy wording:`, `Current Language Policy rule:`) are the `/prospec-upgrade` skill's parse contract — renaming one silently disables the step that reads it.
- `sanitizeTerminal()` strips C0/C1/DEL and lives once in `formatters/sanitize.ts` — EVERY formatter must route free-form repo/report/error/finding strings through it (reimplementing, or forgetting it in a new formatter, reopens the ANSI/OSC-injection gap). `measure-output.ts` stays verdict-free (numbers only, REQ-MEASURE-005).
- `setup-color.ts` MUST be the first import in `index.ts` — reordering re-enables color on non-TTY stdout and corrupts piped output.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
