# Verification Suite

> 4-layer Vitest suite (fast-glob/git bypass memfs — 189 test files, 4,671 tests (unit 3320, contract 1175, integration 45, e2e 131)).
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/{lib,services,cli,types,scripts}/*.test.ts` | Isolated units — mock `node:fs` with memfs; one suite per station engine (`markdown-table`, `delegated-evidence`, `verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`, `review-circuit-breaker`, `lens-yield`), service and formatter (incl. `learn-yield.service` / `learn-yield-output`); heaviest are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/*.test.ts` (21) | Format, registry, public-document and trust-zone pins, including bare Skill identities, host invocation matrices, README parity, website release/version/social-preview readiness, and deployed artifacts — see [Contract Guards](./contract-guards.md). |
| `tests/unit/scripts/counts-registry.test.ts` | Factual-count registry structure and target completeness, including one total/passed/skipped target in each website language source. |
| `tests/integration/*.test.ts` | Multi-service flows — init, change (story→plan→tasks), upgrade, skill/agent-config generation. |
| `tests/e2e/cli-{basics,change,station,knowledge,check-mcp,lifecycle}.test.ts` | The CLI e2e suite, run **in-process** via `helpers/run-cli.ts` (`createProgram`/`runProgram`, no per-test subprocess — was one 126s file) across command groups: init/version/help, change+spec, cli-first station commands, knowledge/agent/measure, check+mcp, upgrade+auto-draft. `run-cli-helper.test.ts` pins the helper's isolation contract. |
| `tests/e2e/cli-subprocess-smoke.test.ts` · `startup-modules.test.ts` | Real-subprocess coverage that lives outside the JS module boundary — shebang + bundled bin, exit-code propagation, non-TTY color (setup-color), mcp stdio startup; and the startup module-graph guard (REQ-CLI-045). Spawn `dist/cli/index.js`, so need `pnpm build`. |
| `tests/fixtures/` | `startup-loading-baseline.json` (71 loading items), `token-corpus/` (12 task descriptions), `lessons-harvest/` (synthetic archived corpus). |

## Public API

- No exports — test files run by `vitest run`. Entry: `pnpm test`.

## Dependencies

**Depends on:** all source modules (`lib`, `services`, `cli`, `types`) — the system under test.
**Used by:** none (leaf; the CI pipeline invokes it).

## Modification Guide

1. **Add a unit test** — `tests/unit/{layer}/{name}.test.ts`; mock `node:fs` with memfs, `vol.reset()` in `beforeEach`.
2. **Add a contract test** — see [Contract Guards](./contract-guards.md).
3. **Add an integration test** — `tests/integration/{flow}.test.ts`; drive multiple services over memfs.
4. **Add an E2E case** — most cases run in-process: add to the matching `tests/e2e/cli-*.test.ts` using the shared `runCli` helper (no build needed, runs against `src`). Only genuinely subprocess-bound behavior goes in `cli-subprocess-smoke.test.ts` (spawns `dist/cli/index.js` — run `pnpm build` first).
5. **Run one layer** — `pnpm vitest run tests/{unit|contract|integration|e2e}/`.
6. **Measure coverage** — `pnpm test:coverage --testTimeout=30000` (see Pitfalls).
7. **Change a delegated-receipt rule** — update the section-scoped five-skill/four-reference matrix in `skill-format.test.ts`; every physical, lifecycle, degradation, zero-mock, schema-owner, and downstream-neutral predicate needs a killing mutation.
8. **Add a machine-owned documentation count** — register each narrowly anchored target in `scripts/counts/registry.ts`, add completeness coverage in `counts-registry.test.ts`, then run `pnpm counts` and `pnpm counts:check`.

## Ripple Effects

- Template/skill/service/CLI changes ripple to contract + E2E expectations; public README or website claims ripple to the section-scoped document contracts; a new station command needs a formatter unit test AND an E2E case.

## Pitfalls

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`. Every git/spawn-bound file declares a FILE-level `vi.setConfig({ testTimeout })` (PB-010) — 90_000 where the file shells out to a real subprocess or runs git-bound services (`drift-sources`, `check.service`, `test-runner`, `counts-from-report`, and every `tests/e2e/*` file — the in-process `cli-*` files still drive git via check/archive/status, and the smoke/startup files spawn node), since `prospec check --record-tests` nests the whole suite inside another node process and 30 s did not hold there: full-suite load blows the 5s default, and per-test overrides are outranked by a later file default.
- The subprocess smokes and the startup-modules guard spawn the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or they fail; the in-process `cli-*` e2e files run against `src` and need no build. The in-process runner (`helpers/run-cli.ts`) patches BOTH `process.stdout/stderr.write` AND `console.*` (vitest intercepts `console`, so a stream patch alone misses formatter output) and restores every global in a `finally` — its `run-cli-helper.test.ts` pins that contract.
- A fixture encoding a POSIX assumption (chmod `0o000` revoking read, signal-based kill) is unbuildable on Windows, where windows-smoke runs the same suite: gate it with `it.skipIf`/`describe.runIf` on `process.platform` and state inline which condition loses coverage there — the product behavior itself still holds.
- `pnpm mutate <path>` runs Stryker as an on-demand audit — never a gate, never in CI (a contract test pins that by enumerating every workflow file). A path is required. Cost = (static mutants) × (dependent-suite runtime); neither predicts it alone — `date-utils` 2 mutants/57 tests → 4s, `task-markers` 57 (26 static: module-level regex constants defeat `coverageAnalysis`)/416 tests → 9m09s. `--ignoreStatic` → 63.8s (8.6×) but scores those 26 as survived (89.47 → 45.61). Timeouts score as KILLED, so a loaded machine reports a higher score; `tests per mutant` is bistable (5.00 vs 1.00, identical runs) — never argue from it. Surviving mutants need human equivalence judgment.
- v8 instrumentation slows the real-temp-dir git suites past vitest's 5s default: bare `pnpm test:coverage` times out ~7 passing tests. Raise `--testTimeout`; a plain `pnpm test` is the authority on pass/fail.
- `vi.mock()` is hoisted — dynamic import paths don't resolve inside the mock factory.
- Tests ARE type-checked: `pnpm typecheck` runs `tsc -p tsconfig.typecheck.json` (includes `tests/` + `scripts/`, `rootDir:"."`+`noEmit`) — a test-file type error fails the gate. Never re-add `tests` to that config's `exclude` (guarded by `tests/contract/typecheck-config.test.ts`); the build `tsc` stays on the base config and emits `src` only.

## Sub-Modules

- [Contract Guards](./contract-guards.md) — the 21 `tests/contract/` pins and the assertion discipline that keeps them falsifiable

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
