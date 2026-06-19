# group-index-by-category — Archive Summary

- **Archived**: 2026-06-13
- **Original Created**: 2026-06-13
- **Quality Grade**: S
- **Scale**: full

## User Story

As a developer navigating a domain-heavy prospec project's AI Knowledge,
I want the `_index.md` module table grouped into `### {Category}` sub-tables with category sourced from `module-map.yaml`,
So that I (and agents) locate modules by domain in L0 without hand-maintaining a duplicate categorized table.

> OPT-B2 reshape: the literal "auto/user duplicate table" premise did not hold for prospec itself (ContentMerger already separates them); residual value = category-based semantic grouping. Bundles US-1 (presentation), US-2 (module-map truth), US-3 (MCP category-awareness).

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ModuleEntry.category` (ordered, optional); `SearchModuleMatch.category` (additive, default []) |
| lib | Medium | `attachModuleCategories` pure join; `searchModules` defaults category [] |
| services | Medium | `mcp.service` `search_modules` joins category from module-map |
| templates | High | knowledge-generate/update derive category, persist to module-map, render `### {Category}` sub-tables; index.md.hbs grouping hint |
| tests | Medium | +14 tests (unit +12, contract +2): schema, join, grouped parse, MCP category |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-018 | ADDED | `_index.md` category-grouped sub-tables (judgment-gated) |
| REQ-KNOW-019 | ADDED | generate auto-derive category → persist to module-map |
| REQ-TYPES-028 | ADDED | module-map ModuleEntry ordered category |
| REQ-TYPES-029 | ADDED | SearchModuleMatch additive category |
| REQ-LIB-017 | ADDED | attachModuleCategories pure join + grouped parse resilience |
| REQ-KNOW-005 | MODIFIED | index MAY group into `### {Category}` sub-tables |
| REQ-SERVICES-022 | MODIFIED | update preserves/derives category |
| REQ-MCP-005 | MODIFIED | search_modules result carries category |

## Completion

- **Tasks**: 13/13 code tasks (100%); 1×[V] + 1×[M] done
- **Tests**: 944/944 green (930→944); typecheck + lint clean
- **Review**: review-clean (Mode A, 5 lenses × verifier, 0 findings)
- **Verify**: Grade S — 5+1 dimensions all PASS

## Feature Spec Sync

- `ai-knowledge.md`: US-340 ADDED (REQ-KNOW-018/019, REQ-TYPES-028); REQ-KNOW-005 + REQ-SERVICES-022 MODIFIED
- `mcp-server.md`: US-4 extended (REQ-TYPES-029, REQ-LIB-017 ADDED; REQ-MCP-005 MODIFIED)

## Knowledge Update

Synced (commit `792ef08`): types/lib/services/templates/tests READMEs + `_index.md` + `module-map.yaml`. prospec keeps a flat `_index` (pure architectural layers — no category field), validating the judgment-gate (this feature's value is for domain-heavy downstream projects).
