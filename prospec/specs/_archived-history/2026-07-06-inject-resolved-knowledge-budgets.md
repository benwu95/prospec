# inject-resolved-knowledge-budgets — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06
- **Quality Grade**: S

## User Story

As a downstream project's AI agent (reading SKILL.md to size knowledge layers),
I want generated docs to cite `.prospec.yaml` `knowledge.token_budget` + `prospec check knowledge-size` and show this project's real numbers,
So that I never have to resolve an internal TypeScript symbol I cannot see.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `KnowledgeSizeBudget` interface relocated here (budget contract home) |
| lib | High | `resolveKnowledgeTokenBudget` relocated to `config.ts` (canonical resolver) |
| services | Medium | agent-sync injects resolved budgets; check.service imports resolver |
| templates | Medium | 3 skill `.hbs` render budgets from `{{...}}`; internal symbol dropped |
| tests | Medium | contract + unit assertions (no-symbol + numbers-from-config), mutation-verified |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-028 | ADDED | canonical `resolveKnowledgeTokenBudget` in `lib/config` |
| REQ-AGNT-035 | ADDED | agent-sync injects budgets; templates carry no internal symbol |
| REQ-TESTS-049 | ADDED | generated-skill budget rendering contract |
| REQ-TYPES-061 | MODIFIED | single source also feeds skill rendering; `KnowledgeSizeBudget`→types |
| REQ-SERVICES-065 | MODIFIED | resolver imported from `lib/config` (check behavior preserved) |
| REQ-KNOW-013 | MODIFIED | Loading-Strategy budget note points to `.prospec.yaml` |

## Completion

- **Tasks**: 11/11 code (100%); 1 `[M]` + 2 `[V]` done
- **Acceptance Criteria**: SC-001..005 met

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — major (dangling `KnowledgeSizeBudget` type-only import in `drift-sources.test.ts` + `drift-checker.test.ts` → latent TS2459 that `pnpm typecheck` misses because `tsconfig` excludes `tests/`) fixed in-loop; re-run green.
- **Verify**: Grade S; dimensions 1/5–5/5 all PASS (6/design n/a, `ui_scope: none`); 2086 tests passing, typecheck + lint clean, `prospec check` 11/11.
- **Quality Log**: one review major, resolved in-loop; no unresolved WARN/FAIL.

## Knowledge Update

Affected module READMEs synced in the feature commit (`dfdc6a2`): types, lib, services, templates, tests. Candidate `/prospec-learn` lesson noted: `tsconfig` excludes `tests/` from `pnpm typecheck`, so a type-only import break in tests escapes the gate.
