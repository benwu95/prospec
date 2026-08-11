# Review: inject-resolved-knowledge-budgets

**Rounds:** 1 / cap 3   **Status:** review-clean

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| tests/unit/lib/drift-sources.test.ts:20 | major | parallel-site (PB-007) / test-quality | fixed |
| tests/unit/lib/drift-checker.test.ts:24 | major | parallel-site (PB-007) / test-quality | fixed |

## Round 1

**0 criticals, 1 major (fixed in-loop).**

Independent fresh-context reviewer confirmed one real defect: after `KnowledgeSizeBudget` moved from `lib/drift-sources.ts` to `types/config.ts`, `drift-sources.ts` re-imports it as a non-re-exported `import type`, but both test files still imported it from `drift-sources.js` → **TS2459** (reproduced directly). It escaped the shipped gate only because `tsconfig.json` excludes `tests/` from `pnpm typecheck`, esbuild strips type-only imports at runtime (`pnpm test` green), and lint is clean. Fixed by repointing the `KnowledgeSizeBudget` import in both test files to `../../../src/types/config.js`; full suite re-run green (2086 pass), isolated compile of both files no longer errors.

> Classified major (shipped gate SC-004 passed, zero runtime impact) but fixed anyway — a confirmed type error with a concrete, local, drop-in fix; a developer decision, not an unattended auto-fix.

## Observation (not a finding)

Gate blind-spot: `tsconfig.json` `exclude: ["tests"]` means a type-only import break in test files cannot be caught by `pnpm typecheck`. Out of scope for this change (surgical); candidate lesson for `/prospec-learn`.

## Verified clean (no findings)

- **Spread correctness**: `...resolveKnowledgeTokenBudget(config)` injects `l1_per_file`/`l2_per_module`/`readme_max_lines` — no key collision with existing `templateContext` keys.
- **Dependency direction**: resolver in `lib/config.ts` (lib→types); consumed by `agent-sync`/`check.service` (services→lib); no service→service import; `drift-sources` imports the type from `types/config` (lib→types). Consistent with `cli → services → lib → types`. One resolver definition survives (REQ-LIB-028 AC1).
- **Symbol leak (SC-001/SC-003)**: `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` = 0 hits across generated skills, `prospec/index.md`, `README*`, `src/templates/skills/**`. Residual `1800`/`1000` in generated output are legitimate per-project rendered defaults.
- **Test quality (PB-001)**: new tests are mutation-catching (sentinel budgets 4242/2424/77); `not.toMatch(/1,800|1,000/)` is not brittle (the only comma-free number in the 5 skills is `100%`, unmatched by the comma-anchored regex).
- **Spec-graduation**: delta-spec ADDED/MODIFIED set matches the implementation; no unlisted existing REQ describes changed behavior (REQ-TEMPLATES-149 governs the untouched init seed).
- **Docs-claims (PB-003)**: reworded notes accurately state budgets come from `.prospec.yaml knowledge.token_budget`, enforced by `prospec check knowledge-size`; single-source `types/config.test.ts` green; `pnpm counts:check` in sync.
