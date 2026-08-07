# tests

> 4-layer Vitest suite (fast-glob/git bypass memfs — 143 test files, 3,324 tests (unit 2420, contract 793, integration 45, e2e 66)).

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/{lib,services,cli,types,scripts}/*.test.ts` | Isolated units — mock `node:fs` with memfs; one suite per station engine (`markdown-table`, `verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`), service and formatter; heaviest are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/skill-format.test.ts` | All 17 skills' format/gate/flywheel/Startup-Loading contract, 18 `references/*.hbs` render/format contracts, and the **CLI-first contract** block — `{{> cli-probe}}` exactly once per skill, the probe STOP sentence single-sourced, `{{minimum_cli_version}}` live (sentinel-injected, no version literal), and a repo-wide negative for forbidden CLI-fallback phrases. Also the **harness-capability** block — both `can_spawn_subagent` branches, the partial as single source, a negative for prose that judges harness capability, and deployed `.claude` vs `.agents` SKILL.md divergence. Column sets and closed enums rendered, section-scoped, mutation-verified. The lifecycle block pins BOTH copies' light-scale artifact matrix against `SCALE_FORBIDDEN_ARTIFACTS` and their audit-scope table against `PROVENANCE_AUDITED_STATUSES`, by set equality keyed exhaustively over each registry's own domain (every scale; every status) — doc↔doc agreement alone never proved either matches the code, and a Yes-rows-only table leaves an exclusion unfalsifiable. Archive's provenance Entry-Gate assertion narrows to that one bullet: only `The CLI is required` recurs in the gate, so narrowing buys immunity to a *weakened* marker list, not the redness. |
| `tests/contract/change-artifact-format.test.ts` | Renders the real `change/proposal.md.hbs` (no mocks) — pins that a module name is bolded exactly once, with a `****` negative. |
| `tests/contract/{knowledge,cli-output}-format.test.ts`, `init-doc-registry.test.ts`, `mcp-server.test.ts`, `language-policy-scope.test.ts`, `bundled-templates-sync.test.ts`, `generated-artifacts-single-source.test.ts` | Output-format + registry + MCP-protocol pins via real `renderTemplate()` / InMemoryTransport; cross-document language-scope agreement; bundle ≡ `src/templates`; the generated-artifact registry ≡ the path its producer writes. `knowledge-format` also pins raw-scan's disclosure block — item-set, caps, empty placeholder, fallback-exception sentence, and order-independence (two orderings of one file list render identically — the same-input-twice form was a tautology). |
| `tests/contract/own-knowledge-sync.test.ts`, `spec-req-body-ledger.test.ts` | Self-referential trust-zone guards: `index.md`'s module table ≡ `module-map.yaml` regenerated through `collectAllModules`+`buildIndexRow` (a count or curated cell that lives only in the generated file is a pending revert); and a set-equality ledger of the legacy body-less REQs — shrink-only, so repairing one requires deleting its `LEGACY_BODYLESS` entry. |
| `tests/integration/*.test.ts` | Multi-service flows — init, change (story→plan→tasks), upgrade, skill/agent-config generation. |
| `tests/e2e/cli.test.ts` | Real compiled CLI in tmpdir (quickstart, upgrade, measure, check, mcp serve), plus the cli-first station commands — incl. the `archive finalize --dry-run` pin that NOTHING is written, and the removal of `knowledge generate`. |
| `tests/fixtures/` | `startup-loading-baseline.json` (71 loading items), `token-corpus/` (12 task descriptions), `lessons-harvest/` (synthetic archived corpus). |

## Public API

- No exports — test files run by `vitest run`. Entry: `pnpm test`.

## Dependencies

**Depends on:** all source modules (`lib`, `services`, `cli`, `types`) — the system under test.
**Used by:** none (leaf; the CI pipeline invokes it).

## Modification Guide

1. **Add a unit test** — `tests/unit/{layer}/{name}.test.ts`; mock `node:fs` with memfs, `vol.reset()` in `beforeEach`.
2. **Add a contract test** — `tests/contract/{name}.test.ts`; use real `renderTemplate()`, no mocks; keep assertions section-scoped.
3. **Add an integration test** — `tests/integration/{flow}.test.ts`; drive multiple services over memfs.
4. **Add an E2E case** — extend `tests/e2e/cli.test.ts`; spawn `dist/cli/index.js` (run `pnpm build` first).
5. **Run one layer** — `pnpm vitest run tests/{unit|contract|integration|e2e}/`.
6. **Measure coverage** — `pnpm test:coverage --testTimeout=30000` (see Pitfalls).

## Ripple Effects

- Template/skill/service/CLI changes ripple to contract + E2E expectations; a new skill bumps the `skill-format` count and the loading-item baseline; a new station command needs a formatter unit test AND an E2E case.

## Pitfalls

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`. Every git/spawn-bound file declares `vi.setConfig({ testTimeout: 30_000 })` at FILE level (PB-010): full-suite load blows the 5s default, and per-test overrides are outranked by a later file default.
- MCP behavior is tested over the SDK in-memory linked transport, never a spawned daemon.
- Contract assertions must be section-scoped AND structure-aware (PB-001) — bare `toContain` over a whole doc yields false-greens; mutation-verify new assertions.
- A `--dry-run` command needs a "writes NOTHING" pin, not just an output assertion: snapshot the tree before and after, since a flag bound to the wrong Commander scope still prints the preview while writing.
- E2E spawns the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or the suite fails.
- A fixture encoding a POSIX assumption (chmod `0o000` revoking read, signal-based kill) is unbuildable on Windows, where windows-smoke runs the same suite: gate it with `it.skipIf`/`describe.runIf` on `process.platform` and state inline which condition loses coverage there — the product behavior itself still holds.
- `pnpm mutate <path>` runs Stryker as an on-demand audit — never a gate, never in CI (a contract test pins that by enumerating every workflow file). A path is required. Cost = (static mutants) × (dependent-suite runtime), and neither factor alone predicts it: `date-utils` 2 mutants over 57 tests → 4s; `task-markers` 57 mutants (26 static — module-level regex constants defeat `coverageAnalysis`) over 416 tests → 9m09s. `--ignoreStatic` gives 63.8s (8.6×) but leaves those 26 untested and scored as survived (89.47 → 45.61). Timeouts score as killed, so a loaded machine reports a higher score. `tests per mutant` is bistable (5.00 vs 1.00 on identical runs) — do not build an argument on it. Surviving mutants need human equivalence judgment.
- v8 instrumentation slows the real-temp-dir git suites past vitest's 5s default: bare `pnpm test:coverage` times out ~7 passing tests. Raise `--testTimeout`; a plain `pnpm test` is the authority on pass/fail.
- `vi.mock()` is hoisted — dynamic import paths don't resolve inside the mock factory.
- Tests ARE type-checked: `pnpm typecheck` runs `tsc -p tsconfig.typecheck.json` (includes `tests/` + `scripts/`, `rootDir:"."`+`noEmit`) — a test-file type error fails the gate. Never re-add `tests` to that config's `exclude` (guarded by `tests/contract/typecheck-config.test.ts`); the build `tsc` stays on the base config and emits `src` only.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->

