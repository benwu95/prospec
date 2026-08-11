## Types

- [x] Define `ConventionInfo` interface in `src/types/knowledge.ts` ~10 lines

## Lib

- [x] [P] Implement `listConventions(knowledgePath)` in `src/lib/knowledge-reader.ts` to scan `_*.md` files (excluding `_index.md`) and resolve their descriptions ~45 lines
- [x] [P] Implement `formatConventionsList(conventions)` in `src/lib/knowledge-reader.ts` to format files list to markdown ~15 lines

## Services

- [x] [P] Update `src/services/init.service.ts` to pre-compute the initial canonical `conventions_list` and inject it into the `init/index.md.hbs` render context ~30 lines
- [x] [P] Update `src/services/knowledge.service.ts` to fetch conventions and inject `conventions_list` into `knowledge/index.md.hbs` render context ~30 lines
- [x] Update `src/services/knowledge-update.service.ts`'s `updateIndex` to reconstruct the full auto block containing Modules, Project Info, How to Use, Conventions, and Loading Rules ~60 lines

## CLI

- [x] [M] Run `prospec agent sync` to redeploy the updated skills locally ~5 lines

## Tests

- [x] [P] Reorganize `src/templates/agent-configs/entry.md.hbs` to replace `Core Resources` with the `Layered Index` L0-L3 structure ~40 lines
- [x] [P] Reorganize `src/templates/knowledge/index.md.hbs` to expand `prospec:auto` block and include `{{conventions_list}}` ~50 lines
- [x] [P] Reorganize `src/templates/init/index.md.hbs` to mirror the expanded `prospec:auto` block ~50 lines
- [x] Update all 17 skills templates (`src/templates/skills/*.hbs`) to add dynamic conventions check in their `Startup Loading` instructions ~120 lines
- [x] [P] Write unit tests for `listConventions` and `formatConventionsList` in `tests/unit/lib/knowledge-reader.test.ts` ~45 lines
- [x] [P] Write unit tests for `knowledge-update.service.ts`'s `updateIndex` new auto block formatting in `tests/unit/services/knowledge-update.service.test.ts` ~40 lines
- [x] [P] Update `tests/contract/knowledge-format.test.ts` to assert the new `_index.md` template structure and auto-block layout ~40 lines
- [x] [P] Update `tests/contract/skill-format.test.ts` to reflect the new dynamic loading instructions ~35 lines
- [x] Update `tests/fixtures/startup-loading-baseline.json` by running vitest baseline regeneration command ~10 lines
- [x] [V] Run the full Vitest suite (`pnpm test`) to ensure all tests pass and coverage is maintained ~10 lines
- [x] [V] Verification check of `CLAUDE.md`, `AGENTS.md`, and `_index.md` files locally for correct layered index formatting ~10 lines

## Summary

- **Total Tasks:** 17
- **Parallelizable Tasks:** 11
- **Total Estimated Lines:** ~625 lines
