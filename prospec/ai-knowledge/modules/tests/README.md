# tests

> 4-layer test architecture using Vitest + memfs — 73 test files, 1,726 tests (unit 1127, contract 542, integration 17, e2e 40)

<!-- prospec:auto-start -->

## Key Files

| File | Purpose |
|------|---------|
| `tests/unit/lib/config.test.ts` | Config resolution and validation (20 tests) |
| `tests/unit/lib/module-detector.test.ts` | Module detection with 4 strategy modes, incl. boundary-anchored relationships + barrel imports (26 tests) |
| `tests/unit/services/archive.service.test.ts` | Archive + spec sync workflow, incl. kind-aware task stats + MODIFIED-REQ h2/--- boundary + non-fatal raw-scan refresh wiring + BL-043 related_modules forwarded to the auto knowledge-update (70 tests) |
| `tests/unit/services/raw-scan.service.test.ts` | Deterministic `generateRawScan` — regenerate raw-scan.md, dry-run, depth, curated files byte-identical (never created), fixpoint idempotency (9 tests) |
| `tests/unit/services/knowledge-init.service.test.ts` | Init scaffolding + `--raw-scan-only` branch — raw-scan-only regenerates only raw-scan.md, never seeds/touches curated files, dry-run writes nothing |
| `tests/unit/services/knowledge.service.test.ts` | Knowledge generation with key_exports (7 tests) |
| `tests/unit/services/knowledge-update.service.test.ts` | Incremental knowledge updates incl. in-place auto-block replace (no $-injection), collectAllModules case-insensitive, removal-wins, and BL-043 feature-prefix resolution (REQ-MCP-* → feature.modules ∪ related_modules, mint guard skips an unresolved feature prefix, module-prefix fallback preserved) (40 tests) |
| `tests/unit/services/change-resolver.test.ts` | Change-resolution branch coverage — explicit slug, single in-progress auto-select, ambiguous/none/not-found errors |
| `tests/unit/cli/output-sanitization.test.ts` | `measure`/error output strips control chars before printing (control-char-injection regression) |
| `tests/unit/types/knowledge.test.ts` | Canonical _index column constant — order, derived header/separator, index lock (3 tests) |
| `tests/integration/init-flow.test.ts` | Full init → scaffold workflow |
| `tests/integration/change-flow.test.ts` | Story → Plan → Tasks flow |
| `tests/contract/skill-format.test.ts` | All 15 skills format validation (incl. prospec-quickstart `excludeFromEntryConfig` — only it is entry-excluded), incl. Output Contract + Startup Loading ordering (markers, STABLE-before-DYNAMIC, set-vs-baseline, contiguity) + BL-038 gate semantics + BL-004 scale/kind contract (frozen kind schema, quick gates, lifecycle-copy sync) + BL-029 flywheel block (relocated ledger path, archive Phase 4.5 auto-harvest, learn Entry Gate ledger-OR-archive, negative no-auto-write `_conventions.md`, archive self-contained promotion-format ref REQ-AGNT-015) + instruction-quality pass (ff Phase-1 start, per-phase gates on 8 skills, Constitution-empty prompt, status-aware handoff, entry session-detection, implement progress anchoring) + vendored engineering-heuristic references (full-MIT + SHA in each rendered ref, severity-mapped review lenses, on-demand-not-Startup-Loading citations, no `agent-skills:` runtime dep; REQ-TEMPLATES-083/084/085, REQ-AGNT-022) + BL-034 dependency-layer on-demand Context7 (section-scoped plan/implement assertions + negative no-Context7-in-Startup-Loading; REQ-TEMPLATES-101/102/103, REQ-TESTS-027); shared module-scope `sectionOf` helper (EOF-tolerant); prospec-backfill-spec section-scoped assertions (triangulation source→field, >50% denominator scoped to story-level intent, trust-zone never-write, route-compatible `backfill-draft.md`, WHAT-layer scoping; mutation-verified) + negative assertions that prospec-design no longer carries the variant (`input=code`/`Phase 2b-code`/`reverse-draft` absent) |
| `tests/fixtures/startup-loading-baseline.json` | Pre-reorder loading-item baseline (75 items / 15 skills + MANDATORY counts) — regenerate when a loading item is intentionally added/removed |
| `tests/contract/knowledge-format.test.ts` | Knowledge output format contract (incl. `### {Category}` grouping + canonical index-column single-source + Dependencies labels + `feature-map.yaml.hbs` format pin incl. empty `modules: []`, BL-040) |
| `tests/e2e/cli.test.ts` | Real CLI in tmpdir (37 tests, incl. `prospec quickstart` one-command onboarding + re-run skip, `prospec measure`, `prospec check`, and `mcp serve --cwd` config-resolution paths) |
| `tests/unit/lib/token-accounting.test.ts` | Pure measurement math + naive-rag codepoint-determinism (22 tests, TDD red-first) |
| `tests/unit/lib/drift-sources.test.ts` + `drift-checker.test.ts` | Drift collectors (real tmpdir + git, incl. shallow clone) and pure evaluators (honest-skip, WARN-only staleness, byte-identity); BL-040 adds feature-map collector + two evaluators (both severities mutation-verified); BL-043 adds the readme-counts collector/evaluator (declared-vs-actual count, string/template- and fenced-block-aware, WARN-only) |
| `tests/unit/lib/knowledge-reader.test.ts` | Content read layer (real tmpdir) — realpath/symlink containment both directions, archived exclusion, name guard, loadModuleMap missing-vs-invalid, loadFeatureMap module-name safety (BL-043 traversal drop), searchModules distinct-term ranking, grouped-subtable parse resilience + attachModuleCategories join |
| `tests/contract/mcp-server.test.ts` | MCP protocol surface over InMemoryTransport.createLinkedPair() — resources/tools/health parity with `prospec check` (SC-006), stdout purity spy, loud invalid-map listing, search_modules category join from module-map; BL-042 adds the `knowledge://feature-map` + `spec://product` resource registration/read coverage (8 resources total); the stdio daemon is never spawned in tests |
| `tests/unit/services/check.service.test.ts` | Drift orchestration — skipped-never-PASS (all 8 checks), init-ci hardening assertions (SHA pins, shell: bash, fence-proof compose), feature-map drift wiring (BL-040), readme-counts wiring (BL-043) |
| `tests/unit/types/feature-map.test.ts` | `FeatureMapSchema` shape/validation (BL-040) |
| `tests/unit/services/archive-feature-map.service.test.ts` | `syncFeatureMap` bootstrap + no-clobber on real temp dirs (renders a real template, so not memfs — like check.service.test) (BL-040) |
| `tests/fixtures/token-corpus/` | 12 task DESCRIPTIONS for the benchmark runner — contexts assembled live, never pre-baked |
| `tests/contract/lessons-harvest-fixtures.test.ts` + `tests/fixtures/lessons-harvest/` | Synthetic archived-change corpus (alpha/beta recurrence, gamma all-complete) for the BL-029 flywheel; well-formedness + scenario discrimination (the harvest itself is an LLM step — dogfood-verified, not vitest-executable) |

## Public API

- No public API — test files executed by `vitest run`
- Run: `pnpm test` (all) or `pnpm vitest run tests/unit/` (layer only)

## Dependencies

- **depends_on**: All source modules (testing dependency)
- **used_by**: CI/CD pipeline

## Modification Guide

1. Adding unit tests: Create `tests/unit/{layer}/{name}.test.ts`, mock `node:fs` with memfs.
2. Adding contract tests: Create `tests/contract/{name}.test.ts`, use real `renderTemplate()` — no mocks.
3. Adding integration tests: Create `tests/integration/{flow}.test.ts`, test multi-service workflows with memfs.
4. Adding E2E tests: Add to `tests/e2e/cli.test.ts`, spawn the compiled CLI via `node dist/cli/index.js` (run `pnpm build` first).

## Ripple Effects

- Template changes require updating contract test expectations (skill-format, knowledge-format)
- Service signature changes require updating unit test mocks and assertions
- CLI option/command name changes require updating E2E test invocations
- New skills require adding to `SKILL_DEFINITIONS` count assertion in `skill-format.test.ts`

## Pitfalls

- memfs must be reset in `beforeEach(() => vol.reset())` — shared state between tests causes flaky failures
- `vi.mock()` is hoisted to top of file — dynamic import paths don't work inside mock factory
- Contract tests use real `renderTemplate()` — template syntax errors surface here first, not in unit tests
- E2E tests are slow (~1-3s each) — keep to critical paths only; use contract tests for format validation
- E2E spawns the built `dist/cli/index.js` with `process.execPath`, not `tsx`/source — `pnpm build` must run first or the suite fails (no `pretest` build hook)
- Contract assertions must be section-scoped AND structure-aware (PB-001): bare toContain over a whole document, first-backtick-only keys, and missing contiguity checks have all produced false-greens — mutation-verify new assertions
- fast-glob and git do NOT see memfs — drift-sources/check.service/knowledge-reader tests use real temp dirs (scanner.test.ts pattern), not `vi.mock('node:fs')`
- MCP protocol behavior is tested via the SDK's in-memory linked transport, never a spawned daemon — e2e only freezes CLI registration (`mcp --help`) and the no-config stderr path

<!-- prospec:auto-end -->

<!-- prospec:user-start -->
<!-- prospec:user-end -->
