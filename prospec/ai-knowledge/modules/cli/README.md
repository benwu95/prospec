# cli

> Thin I/O layer — Commander commands parse args → call one service → format output (35 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | `createProgram()` registers all 14 commands + `preAction` config gate (resolves `.prospec.yaml` against `mcp serve --cwd`, else cwd); `main()` entry; `setup-color.js` first import; `.version()` from `types/version` |
| `commands/` | 14 `registerXxxCommand(program)` files, one per command (init, quickstart, upgrade, print-template, knowledge[+init], agent, config, change story/plan/tasks, measure, check, mcp): parse flags → call service → format |
| `formatters/` | 17 `formatXxxOutput(result, logLevel)` modules — stdout success, stderr errors; `error-output.ts` also has `handleError()` |
| `formatters/sanitize.ts` | Shared `sanitizeTerminal()` — strips C0/C1/DEL; single source for check/measure/error output |
| `log-level.ts` | `resolveLogLevel(opts)` — root-flag → LogLevel; imported by every command |
| `parse-options.ts` | `parseDepth(value)` — shared `--depth` validator (positive int or throws) |
| `setup-color.ts` | Sets NO_COLOR for non-TTY stdout before picocolors loads; honors NO_COLOR/FORCE_COLOR |

## Public API

- `createProgram()` — Commander program, all 14 commands; `main()` runs on load (NOT exported)
- `registerXxxCommand(program)` — 14 registrars; `formatXxxOutput(result, logLevel)` — 17 formatters; `handleError(err, verbose)` → stderr
- `resolveLogLevel(opts)` / `parseDepth(value)` — shared cli helpers
- `sanitizeTerminal(s)` — in `formatters/sanitize.ts`, re-exported by `check-output.ts`
- `GlobalOptions` (type) — `{ verbose?, quiet? }`

## Dependencies

**Depends on:** `services` (every command calls one `execute()`), `types` (errors, config, LogLevel, `PROSPEC_VERSION`), `lib` (shared picocolors singleton via `logger`)
**Used by:** `tests` (E2E spawn the compiled `dist/cli/index.js`) — entry point, no internal consumers

## Modification Guide

1. **Add a command** — `commands/{name}.ts` with `registerXxxCommand(program)` + matching `formatters/{name}-output.ts`; register in `index.ts` (+ E2E test).
2. **Add a formatter** — `formatters/{name}-output.ts` exporting `formatXxxOutput(result, logLevel)`.
3. **Add a flag** — `.option()` in the command file; reuse `parseDepth`/`resolveLogLevel` (option-name changes break E2E tests).
4. **Change error output** — `formatters/error-output.ts`, dispatch by error class.
5. **Change log-level / `--depth`** — edit once in `log-level.ts` / `parse-options.ts`, never per-command.

## Ripple Effects

- `preAction` in `index.ts` runs before every command; option/command-name changes silently break E2E tests (they spawn the real compiled CLI).

## Pitfalls

- No business logic in cli — always delegate to services; `.action()` callbacks are async → `await` + try/catch with `handleError()`.
- Success → stdout, errors → stderr; `mcp serve` keeps stdout byte-clean (JSON-RPC channel — any write corrupts the session; contract test spies on `process.stdout.write`).
- `check --strict` ∧ hasFail → exit 1 (warn/skipped never affect it); skipped ≠ PASS — show its reason.
- `sanitizeTerminal()` strips C0/C1/DEL, lives once in `formatters/sanitize.ts` — route all free-form repo/report/error strings through it (reimplementing reopens the ANSI/OSC-injection gap). `measure-output.ts` stays verdict-free (numbers only, REQ-MEASURE-005).
- `setup-color.ts` MUST be the first import in `index.ts` — reordering re-enables color on non-TTY stdout and corrupts piped output.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
