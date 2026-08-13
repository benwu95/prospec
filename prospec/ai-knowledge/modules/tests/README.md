# Verification Suite

> 4-layer Vitest suite (fast-glob/git bypass memfs — 151 test files, 3,814 tests (unit 2854, contract 830, integration 45, e2e 85)).

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/{lib,services,cli,types,scripts}/*.test.ts` | Isolated units — mock `node:fs` with memfs; one suite per station engine (`markdown-table`, `delegated-evidence`, `verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`), service and formatter; heaviest are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/*.test.ts` (19) | Format, registry and trust-zone pins rendered from the real templates — see [Contract Guards](./contract-guards.md). |
| `tests/integration/*.test.ts` | Multi-service flows — init, change (story→plan→tasks), upgrade, skill/agent-config generation. |
| `tests/e2e/cli.test.ts` | Real compiled CLI in tmpdir (quickstart, upgrade, measure incl. projection, check, mcp serve), plus the cli-first station commands — incl. the `archive finalize --dry-run` pin that NOTHING is written, and the removal of `knowledge generate`. |
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
4. **Add an E2E case** — extend `tests/e2e/cli.test.ts`; spawn `dist/cli/index.js` (run `pnpm build` first).
5. **Run one layer** — `pnpm vitest run tests/{unit|contract|integration|e2e}/`.
6. **Measure coverage** — `pnpm test:coverage --testTimeout=30000` (see Pitfalls).

## Ripple Effects

- Template/skill/service/CLI changes ripple to contract + E2E expectations; a new station command needs a formatter unit test AND an E2E case.

## Pitfalls

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`. Every git/spawn-bound file declares `vi.setConfig({ testTimeout: 30_000 })` at FILE level (PB-010): full-suite load blows the 5s default, and per-test overrides are outranked by a later file default.
- E2E spawns the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or the suite fails.
- A fixture encoding a POSIX assumption (chmod `0o000` revoking read, signal-based kill) is unbuildable on Windows, where windows-smoke runs the same suite: gate it with `it.skipIf`/`describe.runIf` on `process.platform` and state inline which condition loses coverage there — the product behavior itself still holds.
- `pnpm mutate <path>` runs Stryker as an on-demand audit — never a gate, never in CI (a contract test pins that by enumerating every workflow file). A path is required. Cost = (static mutants) × (dependent-suite runtime); neither predicts it alone — `date-utils` 2 mutants/57 tests → 4s, `task-markers` 57 (26 static: module-level regex constants defeat `coverageAnalysis`)/416 tests → 9m09s. `--ignoreStatic` → 63.8s (8.6×) but scores those 26 as survived (89.47 → 45.61). Timeouts score as KILLED, so a loaded machine reports a higher score; `tests per mutant` is bistable (5.00 vs 1.00, identical runs) — never argue from it. Surviving mutants need human equivalence judgment.
- v8 instrumentation slows the real-temp-dir git suites past vitest's 5s default: bare `pnpm test:coverage` times out ~7 passing tests. Raise `--testTimeout`; a plain `pnpm test` is the authority on pass/fail.
- `vi.mock()` is hoisted — dynamic import paths don't resolve inside the mock factory.
- Tests ARE type-checked: `pnpm typecheck` runs `tsc -p tsconfig.typecheck.json` (includes `tests/` + `scripts/`, `rootDir:"."`+`noEmit`) — a test-file type error fails the gate. Never re-add `tests` to that config's `exclude` (guarded by `tests/contract/typecheck-config.test.ts`); the build `tsc` stays on the base config and emits `src` only.

## Sub-Modules

- [Contract Guards](./contract-guards.md) — the 19 `tests/contract/` pins and the assertion discipline that keeps them falsifiable

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
