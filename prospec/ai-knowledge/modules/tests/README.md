# tests

> 4-layer Vitest suite (fast-glob/git bypass memfs — 136 test files, 2,837 tests (unit 2001, contract 727, integration 43, e2e 66)); tests every source module.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/{lib,services,cli,types,scripts}/*.test.ts` | Isolated units — mock `node:fs` with memfs; one suite per station engine (`markdown-table`, `verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`), service and formatter; heaviest are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/skill-format.test.ts` | All 17 skills' format/gate/flywheel/Startup-Loading contract, 18 `references/*.hbs` render/format contracts, and the **CLI-first contract** block — `{{> cli-probe}}` exactly once per skill, the probe STOP sentence single-sourced, `{{minimum_cli_version}}` live (sentinel-injected, no version literal), and a repo-wide negative for forbidden CLI-fallback phrases. Also the **harness-capability** block — both `can_spawn_subagent` branches, the partial as single source, a negative for prose that judges harness capability, and deployed `.claude` vs `.agents` SKILL.md divergence. Column sets and closed enums rendered, section-scoped, mutation-verified. |
| `tests/contract/change-artifact-format.test.ts` | Renders the real `change/proposal.md.hbs` (no mocks) — pins that a module name is bolded exactly once, with a `****` negative. |
| `tests/contract/{knowledge,cli-output}-format.test.ts`, `init-doc-registry.test.ts`, `mcp-server.test.ts`, `language-policy-scope.test.ts`, `bundled-templates-sync.test.ts` | Output-format + registry + MCP-protocol pins via real `renderTemplate()` / InMemoryTransport; cross-document language-scope agreement; bundle ≡ `src/templates`. |
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

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`. Every such git/spawn-bound file declares `vi.setConfig({ testTimeout: 30_000 })` at FILE level (PB-010): full-suite load blows the 5s default, and per-test overrides are outranked by a later file default.
- MCP behavior is tested over the SDK in-memory linked transport, never a spawned daemon.
- Contract assertions must be section-scoped AND structure-aware (PB-001) — bare `toContain` over a whole doc yields false-greens; mutation-verify new assertions.
- A `--dry-run` command needs a "writes NOTHING" pin, not just an output assertion: snapshot the tree before and after, since a flag bound to the wrong Commander scope still prints the preview while writing.
- E2E spawns the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or the suite fails.
- v8 instrumentation slows the real-temp-dir git suites past vitest's 5s default: bare `pnpm test:coverage` times out ~7 passing tests. Raise `--testTimeout`; a plain `pnpm test` is the authority on pass/fail.
- `vi.mock()` is hoisted — dynamic import paths don't resolve inside the mock factory.
- Tests ARE type-checked: `pnpm typecheck` runs `tsc -p tsconfig.typecheck.json` (includes `tests/` + `scripts/`, `rootDir:"."`+`noEmit`) — a test-file type error fails the gate. Never re-add `tests` to that config's `exclude` (guarded by `tests/contract/typecheck-config.test.ts`); the build `tsc` stays on the base config and emits `src` only.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
