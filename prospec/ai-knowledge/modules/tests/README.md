# tests

> 4-layer Vitest suite (fast-glob/git bypass memfs — 85 test files, 2,086 tests (unit 1362, contract 643, integration 38, e2e 43)); tests every source module.

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/{lib,services,cli,types}/*.test.ts` | Isolated units — mock `node:fs` with memfs; heaviest suites are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/skill-format.test.ts` | All 17 skills' format/gate/flywheel/Startup-Loading contract (section-scoped, mutation-verified). |
| `tests/contract/{knowledge,cli-output}-format.test.ts`, `init-doc-registry.test.ts`, `mcp-server.test.ts` | Output-format + registry + MCP-protocol pins via real `renderTemplate()` / InMemoryTransport. |
| `tests/integration/*.test.ts` | Multi-service flows — init, change (story→plan→tasks), upgrade, skill/agent-config generation. |
| `tests/e2e/cli.test.ts` | Real compiled CLI in tmpdir (quickstart, upgrade, measure, check, mcp serve). |
| `tests/fixtures/` | `startup-loading-baseline.json` (81 loading items), `token-corpus/` (12 task descriptions), `lessons-harvest/` (synthetic archived corpus). |

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

## Ripple Effects

- Template/skill/service/CLI changes ripple to contract + E2E expectations; a new skill bumps the `skill-format` count and the loading-item baseline.

## Pitfalls

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`.
- MCP behavior is tested over the SDK in-memory linked transport, never a spawned daemon.
- Contract assertions must be section-scoped AND structure-aware (PB-001) — bare `toContain` over a whole doc yields false-greens; mutation-verify new assertions.
- E2E spawns the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or the suite fails.
- `vi.mock()` is hoisted — dynamic import paths don't resolve inside the mock factory.

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
