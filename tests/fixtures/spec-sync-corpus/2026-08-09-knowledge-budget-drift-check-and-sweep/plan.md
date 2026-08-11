## Overview

This story implements a new drift check for `knowledge.token_budget` overrides to require justification comments when they exceed defaults, preventing silent unbounded growth of module READMEs. It also introduces an automated Sweep phase during `prospec knowledge update` to mechanically compress repetitive pitfalls and clean up obsolete knowledge. Finally, it adds a `headroom` band to `KNOWLEDGE_SIZE_RULES` to provide early warning signals before a module hits its hard limit.

These changes close a loop in the `knowledge-size` control mechanism, shifting the strategy from merely warning on limits to actively pushing back on unjustified budget increases and providing an automated release valve (Sweep) for knowledge compression.

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | Zod schemas, error hierarchy, configuration types, and drift check ids | `ProspecConfigSchema`, `DRIFT_CHECK_IDS`, `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` | (None) |
| lib | Configuration reading, drift engine, token accounting, yaml utilities | `mergeIntoDocument`, `drift-evaluators`, `scanDir` | types |
| services | Knowledge update orchestration and drift check logic | `knowledge-update.service`, `check.service` | types, lib |

### Architecture Constraints (from Constitution)
- Dependency direction must strictly follow `cli → services → lib → types`.
- Measurements must consistently use `Math.ceil(chars/4)` for tokens.

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Low | Add new drift check id for budget overrides and add `headroom` to config schemas. |
| lib | High | Implement budget drift checker utilizing yaml parsed comments; update `KNOWLEDGE_SIZE_RULES` with headroom checking. |
| services | High | Hook the Sweep logic into `knowledge-update.service.ts` Phase 3a prior to writing READMEs. |

## Call Chain

**Drift Check (Budget Override)**
`check.service.execute()`
  → `lib/drift-sources.collectKnowledgeBudget()` (New collector or extend existing)
  → `lib/drift-evaluators.evaluateBudgetOverrides(doc)`
  → (Returns findings if override > default without comment)

**Knowledge Update (Sweep)**
`knowledge-update.service.executeForChange()`
  → `lib/knowledge-reader.searchModules()`
  → `sweepModuleReadme(content, moduleMap)` (New step in Phase 3a)
  → `lib/fs-utils.atomicWrite()`

## Implementation Steps

1. **Update Configuration Types (types)**
   - Add new drift check ID `knowledge/unjustified-budget-override` to `DRIFT_CHECK_IDS`.
   - Add `headroom` (optional number) to `TokenBudgetSchema` or `KNOWLEDGE_SIZE_RULES`.

2. **Implement Budget Override Drift Check (lib)**
   - In the drift engine, read `.prospec.yaml` as a YAML AST to access comments via `yaml-utils`.
   - For each `token_budget` key, if value > `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`, verify it has an adjacent comment.
   - If no comment, emit a WARN finding pointing to the specific key and values.
   - Update `KNOWLEDGE_SIZE_RULES` to evaluate size against the `headroom` threshold (e.g., 85%) and emit a distinct warning.

3. **Implement Automated Sweep (services/lib)**
   - Create a sweep function that takes existing README content and compresses/removes specific mechanical sections (e.g., repeating pitfalls).
   - In `knowledge-update.service.ts`, right before rendering and writing to the module README, run this sweep function.
   - Track token counts before and after the sweep (`Math.ceil(chars/4)`), and log the savings.

4. **Add Tests (tests)**
   - Write tests for the new drift check (testing missing comment, present comment, and value <= default).
   - Write tests for the sweep logic (mock update and assert token reduction and marker presence).
   - Verify `demand_knowledge_per_file: 15000` passes cleanly.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| YAML comment parsing fragility | Medium | Use robust YAML AST tools (`yaml-utils` / `yaml` package) already in the project to extract comments safely. |
| Over-aggressive Sweep deleting authored text | High | Ensure the Sweep criteria strictly targets "mechanized" language or explicitly marked sections; use conservative regex/ast matches. |
| Test failures due to new strictness | Medium | Update existing test fixtures to include justification comments for budget overrides if they use them. |
