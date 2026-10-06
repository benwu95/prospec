# Verification Suite

> 4-layer Vitest suite (fast-glob/git bypass memfs — 291 test files, 7,526 tests (unit 5508, contract 1652, integration 153, e2e 213)).
<!-- prospec:module-readme-format 2026-09-01 -->

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `change-abandon.service.test.ts` / `abandon-consumers.test.ts` / `change-abandon.test.ts` | Real Git preservation/publication faults, retry writer admission, archive/yield exclusion and in-process CLI flow |
| `tests/unit/{lib,services,cli,types,scripts}/*.test.ts` | Isolated units — mock `node:fs` with memfs; one suite per station engine (`markdown-table`, `delegated-evidence`, `verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`, `review-circuit-breaker`, `lens-yield`), baseline/assessment engines (`acceptance-baseline`, `requirement-assessment`, `verification-context`), service and formatter (incl. `change-acceptance`, `verify-context`, `learn-yield.service` / `learn-yield-output`, and the CLI-owned review round counts across `change-metadata` round-keyed upsert, `review-merge` clean-sentence idempotency and `change-log` self-report mismatch audit); heaviest are `services/archive`, `knowledge-update`, `upgrade`, `lib/config`, `module-detector`, `drift-*`. |
| `tests/contract/*.test.ts` | Format, registry, public-document and trust-zone pins, including bare Skill identities, host invocation matrices, registry↔program help completeness (both directions), skill negative-scope / bare-trigger hygiene, README parity, website release/version/social-preview readiness, and deployed artifacts — see [Contract Guards](./contract-guards.md). |
| `tests/unit/scripts/counts-registry.test.ts` | Factual-count registry structure and target completeness, including one total/passed/skipped target in each website language source. |
| `tests/integration/*.test.ts` | Multi-service flows — init, change (story→freeze→plan→tasks), verify context and per-REQ evidence evaluation, upgrade, skill/agent-config generation, and a real four-host `agent sync` on a real filesystem whose output the station-reference collector and evaluator then judge (mutations asserted applied before their verdict is read). |
| `tests/e2e/cli-{basics,change,station,knowledge,check-mcp,lifecycle}.test.ts` | The CLI e2e suite, run **in-process** via `helpers/run-cli.ts` (`createProgram`/`runProgram`, no per-test subprocess — was one 126s file) across command groups: init/version/help, change+spec, cli-first station commands, knowledge/agent/measure, check+mcp, upgrade+auto-draft. `run-cli-helper.test.ts` pins the helper's isolation contract. |
| `tests/e2e/cli-subprocess-smoke.test.ts` · `startup-modules.test.ts` | Real-subprocess coverage that lives outside the JS module boundary — shebang + bundled bin, exit-code propagation, non-TTY color (setup-color), mcp stdio startup; and the startup module-graph guard (REQ-CLI-045). Spawn `dist/cli/index.js`, so need `pnpm build`. |
| `tests/helpers/` | Shared test infrastructure (the in-process CLI runner lives in `tests/e2e/helpers/run-cli.ts`): `mandatory-loads.ts` / `station-references.ts` (baseline projections); `git-fixture.ts` — `GIT_ID`, `gitIn(cwd, …args)` (git with the fixture identity) and `imageOf(root)` (a byte-and-mode image of a directory, so a chmod alone makes two images differ); `no-child-process.ts` — `withoutSpawns(actual)` (memfs suites: every spawn fails without starting a process); `private-tmpdir.ts` — `usePrivateTmpdir(label)` gives a test file its own temporary directory (so `os.tmpdir()` and `snapshotRoot()` point there) and removes it in `afterAll`; every test file that builds a delegation snapshot calls it, since a ticket-keyed or stem-keyed cleanup either leaks or races a parallel worker. |
| `tests/setup-env.ts` | vitest `setupFiles`: deletes `PROSPEC_PAUSE_AT` so a developer's or CI runner's pause override never reroutes a `status` assertion (in-process and spawned alike); a test of the override passes `env` or `vi.stubEnv` explicitly |
| `tests/fixtures/` | `startup-loading-baseline.json` (per-skill loading items + size ceilings), `workflow-eval/` (evaluator corpus), `token-corpus/`, `lessons-harvest/` (synthetic archived corpus). |

## Public API

- `tests/contract/playbook-station.test.ts` checks all 20 active declarations, the 7 approved compact entries, and service-plus-formatter output for every `SDD_STATIONS` value against the full-file token cost. `skill-format.test.ts` pins Startup loads, caps, cleanup rules, baseline ceilings and both languages' public docs; unit and CLI E2E tests cover parser, service and formatter behavior.
- No exports — test files run by `vitest run`. Entry: `pnpm test`.

## Dependencies

**Depends on:** all source modules (`lib`, `services`, `cli`, `types`) — the system under test.
**Used by:** none (leaf; the CI pipeline invokes it).

## Modification Guide

1. **Add a unit test** — `tests/unit/{layer}/{name}.test.ts`; mock `node:fs` with memfs, `vol.reset()` in `beforeEach`.
2. **Add a contract test** — see [Contract Guards](./contract-guards.md). `skill-format` also pins quantitative target baselines, audited claims, reference-heading removal and retained operational guidance.
3. **Add an integration test** — `tests/integration/{flow}.test.ts`; drive multiple services over memfs.
4. **Add an E2E case** — most cases run in-process: add to the matching `tests/e2e/cli-*.test.ts` using the shared `runCli` helper (no build needed, runs against `src`). Only genuinely subprocess-bound behavior goes in `cli-subprocess-smoke.test.ts` (spawns `dist/cli/index.js` — run `pnpm build` first).
5. **Run one layer** — `pnpm vitest run tests/{unit|contract|integration|e2e}/`.
6. **Measure coverage** — `pnpm test:coverage --testTimeout=30000` (see Pitfalls).
7. **Change a delegated-receipt rule** — edit `delegation-protocol.hbs` and its section-scoped predicate in `skill-format.test.ts`; the nine pointer surfaces must keep only a link (a negative guard refuses re-inlined steps, ticket-flow invariants and detection limits anywhere in them), the protocol must render the same for every host, the user-facing descriptions (both READMEs, both CLI references) claim detection and preservation only, and every physical, bounded-wait, degradation, zero-mock, pointer, claim and downstream-neutral predicate needs a killing mutation. The delegation lib suites run real git in temp repos, each judgment condition has its own killing mutation, and the e2e suite pins that every `change delegate` mode leaves `.git` and the five facets byte-identical under a read-only `.git`.
8. **Add a machine-owned documentation count** — register each narrowly anchored target in `scripts/counts/registry.ts`, add completeness coverage in `counts-registry.test.ts`, then run `pnpm counts` and `pnpm counts:check`.

## Ripple Effects

- Template/skill/service/CLI changes ripple to contract + E2E expectations; public README or website claims ripple to the section-scoped document contracts; a new station command needs a formatter unit test AND an E2E case.

## Pitfalls

- Abandon suites pin directory isolation (same-named successful archive, unsafe/missing history root, linked-record recheck), opposing staged/unstaged patches, byte/mode/link/deletion preservation, nested project scope and failure phases. Retry tests cover legacy/all scales, linked-record changes, incomplete sources and direct writers; contract mutations delete the ordered retry handoff and preservation-before-metadata clause.

- Premise coverage spans schema/parser/contained-reader, read/write services, rendered contracts and `cli-premise` E2E. `helpers/premise.ts` explicitly authors verified fixtures for workflows advancing newly created stories; never make the production scaffold ready to repair fixtures. Its default source is `ai-proposed`, which pauses a standard/full change at plan, so a fixture whose subject is not the pause passes `withVerifiedPremise(text, 'user-observation')`. Refusal tests compare artifact bytes, and template mutation checks must prove the edit landed before judging failure.

- Escalation fixtures pin lifetime chronology, same-round changed-input admission, source-content identity without context IDs, one-use grants, partial-write repair and persisted-versus-observed failures. Fault injection checks actual metadata/artifact bytes; history contracts preserve fenced examples and adjacent prose.

- Startup measurements use isolated real-Git status fixtures (no/current/stale report and in-flight change); assert the executed branch, not only a module ceiling, so archive cannot hide a report-dependent path.
- Invalid UTF-8 path refusal uses a real Git index on macOS and Linux, with additional Linux worktree coverage, keeping both platforms' test counts aligned.
- Snapshot and live-evidence regressions use real Git fixtures (`input-snapshot`, `drift-assessment`, integration `evidence-validity`, e2e `cli-station`); assert identity relations (equivalent commits preserve input digest, across-UTC-day source commits can stale Knowledge, and re-stamping changes digest), latest-attempt safety, refusal byte identity and suite invocation counts. A fixture file the test writes (a findings JSON) must live under `.prospec/` — at the repo root it is an untracked INPUT and stales the very snapshot the gate is judging. memfs service tests inject the snapshot by partially mocking `drift-sources`' `computeChangeState` (a `sequence` of digests models a mid-call change) and `fs-utils`' `atomicWrite` (`failOn` / `afterWrite` model a write failure or a concurrent edit between the exemption WARN and revalidation).

- fast-glob and git do NOT see memfs — drift-sources / check.service / knowledge-reader tests use real temp dirs, not `vi.mock('node:fs')`; a memfs suite that must not start a real process can mock `node:child_process` with `withoutSpawns`, which fails every spawn. A file that does spawn needs a FILE-level `vi.setConfig({ testTimeout })` (PB-010) — the e2e files declare 90_000; a new spawning file takes the value of its nearest sibling — since `prospec check --record-tests` nests the whole suite inside another node process and full-suite load blows the 5s default.
- The subprocess smokes and the startup-modules guard spawn the built CLI via `process.execPath` — `pnpm build` must run first (no `pretest` hook) or they fail; the in-process `cli-*` e2e files run against `src` and need no build. The in-process runner (`helpers/run-cli.ts`) patches BOTH `process.stdout/stderr.write` AND `console.*` (vitest intercepts `console`, so a stream patch alone misses formatter output) and restores every global in a `finally` — its `run-cli-helper.test.ts` pins that contract.
- A fixture encoding a POSIX assumption (chmod `0o000` revoking read, signal-based kill) is unbuildable on Windows, where windows-smoke runs the same suite: gate it with `it.skipIf`/`describe.runIf` on `process.platform` and state inline which condition loses coverage there — the product behavior itself still holds.
- `pnpm mutate <path>` runs Stryker as an on-demand audit — never a gate, never in CI (a contract test pins that by enumerating every workflow file). A path is required. Cost = (static mutants) × (dependent-suite runtime); neither predicts it alone — `date-utils` 2 mutants/57 tests → 4s, `task-markers` 57 (26 static: module-level regex constants defeat `coverageAnalysis`)/416 tests → 9m09s. `--ignoreStatic` → 63.8s (8.6×) but scores those 26 as survived (89.47 → 45.61). Timeouts score as KILLED, so a loaded machine reports a higher score; `tests per mutant` is bistable (5.00 vs 1.00, identical runs) — never argue from it. Surviving mutants need human equivalence judgment.
- v8 instrumentation slows the real-temp-dir git suites past vitest's 5s default: bare `pnpm test:coverage` times out ~7 passing tests. Raise `--testTimeout`; a plain `pnpm test` is the authority on pass/fail.
- `vi.mock()` is hoisted above the file's own declarations; a literal `await import('…')` inside the factory resolves relative to the test file.
- Tests ARE type-checked: `pnpm typecheck` runs `tsc -p tsconfig.typecheck.json` (includes `tests/` + `scripts/`, `rootDir:"."`+`noEmit`) — a test-file type error fails the gate. Never re-add `tests` to that config's `exclude` (guarded by `tests/contract/typecheck-config.test.ts`); the build `tsc` stays on the base config and emits `src` only.

## Sub-Modules

- [Contract Guards](./contract-guards.md) — the `tests/contract/` pins and the assertion discipline that keeps them falsifiable
- [Workflow Evaluator](./workflow-evaluator.md) — the instruction-grading harness's suites, and why they are never model evidence

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
