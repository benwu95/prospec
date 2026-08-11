## Lib

- [x] T1 [P] In `src/lib/scanner.ts` (or `knowledge-reader.ts`), define `CORE_CONVENTIONS` array (`_conventions.md`, `_diagram-conventions.md`, `_glossary.md`, `_playbook.md`, `_status-lifecycle.md`) ~10 lines
- [x] T2 In `src/lib/scanner.ts`, add a helper function `filterConventions(files: string[])` returning `{ core: string[], demand: string[] }` ~25 lines

## Templates

- [x] T3 [P] Modify `src/templates/knowledge/index.md.hbs` to change header and path description to root `prospec/index.md` ~10 lines
- [x] T4 Modify `src/templates/knowledge/index.md.hbs` to use `{{#each core_conventions}}` and `{{#each demand_conventions}}` for rendering L1 ~20 lines
- [x] T5 [P] Modify `src/templates/agent-configs/entry.md.hbs` to add `_diagram-conventions.md` to Core Resources ~5 lines
- [x] T6 Modify `src/templates/agent-configs/entry.md.hbs` to add navigation guidance pointing L1-L3 to `prospec/index.md` ~10 lines

## Services

- [x] T7 Modify `src/services/knowledge.service.ts` to use `filterConventions` and pass `core_conventions`, `demand_conventions` to template context ~20 lines
- [x] T8 Modify `src/services/knowledge.service.ts` to write output to `prospec/index.md` instead of `prospec/ai-knowledge/_index.md` ~5 lines
- [x] T9 Modify `src/services/knowledge-update.service.ts` to use `filterConventions` and pass the separated arrays to template context ~20 lines
- [x] T10 Modify `src/services/knowledge-update.service.ts` to read/write `prospec/index.md` instead of `_index.md` ~10 lines
- [x] T11 Check and update `src/services/archive.service.ts` for any hardcoded `_index.md` paths ~15 lines
- [x] T12 Check and update `src/services/upgrade.service.ts` for any hardcoded `_index.md` paths ~15 lines

## CLI & Docs

- [x] T13 [P] Update project root `README.md` to reflect the new L0-L3 structure and `prospec/index.md` path ~20 lines
- [x] T14 [M] Run `prospec agent sync` and `prospec knowledge generate` to verify local generation ~5 lines

## Tests

- [x] T15 [P] Write unit tests for `filterConventions` in `tests/unit/lib/scanner.test.ts` ~40 lines
- [x] T16 Update unit tests in `tests/unit/services/knowledge.service.test.ts` for new template context and output path ~30 lines
- [x] T17 Update unit tests in `tests/unit/services/knowledge-update.service.test.ts` for new template context and output path ~30 lines
- [x] T18 Update contract tests in `tests/contract/knowledge-format.test.ts` to assert L1 section splitting and path changes ~40 lines
- [x] T19 Update contract tests in `tests/contract/agent-entry.test.ts` to assert L0 guidance and diagram conventions ~30 lines
- [x] T20 [V] Mutation-verify the new template assertions ~10 lines

## Summary

- **Total Tasks:** 20
- **Parallelizable Tasks:** 5
- **Total Estimated Lines:** ~370 lines
