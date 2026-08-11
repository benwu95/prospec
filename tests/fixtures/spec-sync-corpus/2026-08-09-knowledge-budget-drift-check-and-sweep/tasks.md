## Types

- [x] Add `knowledge/unjustified-budget-override` to `DRIFT_CHECK_IDS` in `src/types/drift-report.ts` ~10 lines
- [x] Add `headroom` field to `TokenBudgetSchema` and `KnowledgeSizeRules` in `src/types/config.ts` ~15 lines

## Lib

- [x] [P] Create `sweepModuleReadme` in `src/lib/knowledge-reader.ts` (or new utility) applying 3-criteria rules ~80 lines
- [x] Update `evaluateKnowledgeSize` in `src/lib/drift-evaluators.ts` to check the `headroom` threshold ~30 lines
- [x] Create `evaluateBudgetOverrides` in `src/lib/drift-evaluators.ts` utilizing YAML AST comments ~50 lines

## Services

- [x] Update `drift-sources.ts` or `check.service.ts` to collect `.prospec.yaml` AST for budget override checks ~40 lines
- [x] Update `knowledge-update.service.ts` Phase 3a to call `sweepModuleReadme` before write ~30 lines
- [x] Implement token count logging (using `Math.ceil(chars/4)`) pre/post sweep in `knowledge-update.service.ts` ~20 lines

## Tests

- [x] [P] Write unit tests for `sweepModuleReadme` ~80 lines
- [x] [P] Write unit tests for `evaluateBudgetOverrides` (missing comment, present comment, <= default) ~80 lines
- [x] Update drift engine tests for headroom signal ~40 lines
- [x] [V] Verify `demand_knowledge_per_file: 15000` fixture passes cleanly in regression tests ~10 lines

## Summary

- **Total Tasks:** 12
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~485 lines
