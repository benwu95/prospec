# Tasks: inject-resolved-knowledge-budgets

## Types

- [x] T1 Move `KnowledgeSizeBudget` interface from `lib/drift-sources.ts` to `types/config.ts` (export, beside `TokenBudget`/`DEFAULT_KNOWLEDGE_TOKEN_BUDGET`) ~15 lines

## Lib

- [x] T2 Add `resolveKnowledgeTokenBudget(config): KnowledgeSizeBudget` to `lib/config.ts` (import `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`/`KnowledgeSizeBudget`/`ProspecConfig` from types; per-field override) ~15 lines
- [x] T3 Update `lib/drift-sources.ts` (and `drift-checker.ts` if it references the type) to import `KnowledgeSizeBudget` from `types/config`; remove the local interface ~10 lines

## Services

- [x] T4 `check.service.ts`: remove local `resolveKnowledgeTokenBudget`, import it from `lib/config`; repoint the type import ~10 lines
- [x] T5 `agent-sync.service.ts`: import resolver from `lib/config`; inject `l1_per_file`/`l2_per_module`/`readme_max_lines` into `templateContext` ~15 lines

## Templates

- [x] T6 `_knowledge-loading-rules.hbs`: render L1/L2 numbers via `{{l1_per_file}}`/`{{l2_per_module}}`; rewrite the budget note to drop `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`, pointing to `.prospec.yaml knowledge.token_budget` + `prospec check knowledge-size` ~10 lines
- [x] T7 `prospec-knowledge-generate.hbs`: variable-render budgets (incl. `{{readme_max_lines}}`), drop the symbol, and fix the "write index.md budget note" instruction to point to `.prospec.yaml` ~10 lines

## Docs & Knowledge

- [x] T8 [M] Regenerate generated skills: `pnpm build` then `prospec agent sync` (6 `SKILL.md` × `.claude` + `.agents`) ~5 lines
- [x] T9 Align dogfood docs: remove the internal symbol from `prospec/index.md` budget note, `README.md`, `README.zh-TW.md` (keep the number tables) ~15 lines
- [x] T10 Sync module READMEs (same commit, PB-005): move the `resolveKnowledgeTokenBudget` API line services→lib; reflect `KnowledgeSizeBudget` home in types ~15 lines

## Tests

- [x] T11 Add agent-sync/skill-format test: rendered skill output excludes `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`; injected L1/L2/line numbers == `resolveKnowledgeTokenBudget` for default + override config fixtures ~55 lines
- [x] T12 Relocate `resolveKnowledgeTokenBudget` unit coverage to `lib/config`; confirm `tests/unit/types/config.test.ts` single-source assertion stays green ~20 lines
- [x] T13 [V] Mutation-verify the new negative (no-symbol) + positive (numbers==resolver) assertions go red when template/injection is broken ~10 lines
- [x] T14 [V] Run full gate: `pnpm test` / `pnpm typecheck` / `pnpm lint` / `prospec check` all green ~5 lines

## Summary

- **Total Tasks:** 14 (11 code, 1 `[M]`, 2 `[V]`)
