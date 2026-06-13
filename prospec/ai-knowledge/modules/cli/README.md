# cli

> Thin CLI orchestration layer — parse args → call service → format output (Commander.js, 25 files)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `src/cli/index.ts` | createProgram(), main(), preAction config check (resolves `.prospec.yaml` against `mcp serve --cwd <path>` when given, else cwd), command registration (imports `setup-color.js` first) |
| `src/cli/setup-color.ts` | Sets NO_COLOR for non-TTY stdout before picocolors loads — keeps piped/`tee`'d output free of raw ANSI; honors explicit NO_COLOR/FORCE_COLOR |
| `src/cli/commands/init.ts` | `prospec init` — project initialization |
| `src/cli/commands/knowledge-init.ts` | `prospec knowledge init` — scan and raw-scan generation |
| `src/cli/commands/change-story.ts` | `prospec change story` — create change proposal |
| `src/cli/commands/change-plan.ts` | `prospec change plan` — generate implementation plan |
| `src/cli/commands/agent-sync.ts` | `prospec agent sync` — multi-agent config deployment |
| `src/cli/commands/measure.ts` | `prospec measure` — read-only token measurement report display |
| `src/cli/commands/check.ts` | `prospec check` — drift check; `--strict` ∧ hasFail → exitCode 1 (warn/skipped never affect it) |
| `src/cli/commands/mcp.ts` | `prospec mcp serve [--cwd <path>]` — read-only MCP server on stdio (`--cwd` pins the served project root, default `process.cwd()`, so one agent can run several project servers); action writes nothing to stdout |
| `src/cli/formatters/mcp-output.ts` | Startup banner to STDERR by design — stdout is the MCP protocol channel |
| `src/cli/formatters/measure-output.ts` | Per-provider sections, two baselines, warm asterisk — numbers only, no verdicts |
| `src/cli/formatters/check-output.ts` | Five check statuses with explicit skip reasons; sanitizeTerminal() strips C0/C1 from untrusted repo strings |
| `src/cli/formatters/error-output.ts` | handleError() — error type dispatch to stderr |
| `src/cli/formatters/init-output.ts` | formatInitOutput() — init command output |

## Public API

- `createProgram()` — Create Commander.js program with all 11 commands registered
- `main()` — Entry point: create program → parse argv → execute
- `registerXxxCommand(program)` — 11 command registration functions (one per command)
- `formatXxxOutput(result, logLevel)` — 12 formatter functions (stdout for success, stderr for errors; `mcp serve` is the one deliberate exception: success banner also goes stderr)

## Dependencies

- **depends_on**: `services` (all execute functions), `types` (errors, config, LogLevel)
- **used_by**: None (entry point — user-facing)

## Modification Guide

1. Adding a new command: Create `src/cli/commands/{name}.ts` with `registerXxxCommand(program)`, create matching formatter, register in `index.ts`.
2. Adding a formatter: Create `src/cli/formatters/{name}-output.ts` with `formatXxxOutput(result, logLevel)`.
3. Changing error output: Modify `formatters/error-output.ts` — dispatch by error class type.

## Ripple Effects

- New commands need: service (execute), formatter (output), registration (index.ts), E2E test
- `preAction` hook in `index.ts` changes affect ALL commands — config check runs before every command
- Error output format changes affect E2E test expectations
- Command option name changes break E2E tests silently (spawns real CLI)

## Pitfalls

- CLI layer must NOT contain business logic — always delegate to services
- Commander.js `.action()` callbacks are async — always `await` and wrap in try/catch with `handleError()`
- Success output → stdout, error output → stderr — never mix channels
- E2E tests spawn real `npx tsx src/cli/index.ts` — any option/command name change breaks them
- `measure-output.ts` must stay verdict-free (numbers only, REQ-MEASURE-005) — never add PASS/FAIL-style threshold judgments to its output
- `check-output.ts` must show skipped checks with their reason (skipped ≠ PASS) and route untrusted strings through `sanitizeTerminal()`; the semantic line stays `not-checked`
- `setup-color.ts` MUST be the first import in `index.ts` (before any picocolors consumer — cli formatters and `lib/logger` share one picocolors singleton); reordering re-enables color on non-TTY stdout and corrupts piped output (e.g. the CI comment job)
- `mcp serve` must keep stdout byte-clean — it is the JSON-RPC channel; any stdout write corrupts the MCP session (contract test spies on process.stdout.write)

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
