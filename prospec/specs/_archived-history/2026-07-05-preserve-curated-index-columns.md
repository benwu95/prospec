# preserve-curated-index-columns — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a 維護 prospec AI Knowledge 的 agent，
I want curated index 欄位（Keywords/Aliases/Rationale/Depends On）以 module-map.yaml 為單一真相、index.md auto block 由其生成，且 updateIndex 內建 no-clobber 回填，
So that 任何自動更新都不會清空 curated 欄位，既有下游專案零遺失遷移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | ModuleEntrySchema 加 aliases/rationale |
| lib | High | index-table.ts（buildIndexRow/buildIndexTable/backfillCuratedFromIndex）+ parseIndexModules 擴充 |
| services | High | knowledge-update updateIndex 自 module-map 生成 + execute() on-the-fly 回填 |
| templates | Medium | module-map.yaml.hbs scaffold + knowledge skill 指引；SKILL.md regen |
| tests | Medium | index-table 8 + execute() 遷移測試（mutation-verified） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-056 | ADDED | ModuleEntry curated 欄位（aliases/rationale） |
| REQ-LIB-026 | ADDED | index 表 curated 保真工具（row-builder + no-clobber 回填 + parse 擴充） |
| REQ-KNOW-036 | ADDED | updateIndex 自 module-map 生成並 no-clobber 遷移 |
| REQ-KNOW-008 | MODIFIED | Index Idempotent Update 保留 curated 欄（自 module-map 生成，非填 —） |

## Completion

- **Tasks**: 9/9 code tasks (100%); [M] 1/1, [V] 5/5
- **Acceptance Criteria**: US-1 3/3, US-2 3/3 met

## Review & Verify

- **Review**: 1 round, 0 critical / 3 major — 2 fixed (doc overclaim scoped honestly; execute()-level backfill test added), 1 accepted (bootstrap array-rebuild may drop rare item-level module-map comments — bounded: bootstrap-once + no-clobber). Reviewer verdict: `depends_on` non-backfill is correct/safe (not data loss).
- **Verify**: Grade S, dimensions 1/5·2/5·3/5·4/5·5/5 PASS, 6 N/A (ui_scope none); full suite 1995 tests green; `prospec check` 10/10 (0 fail, 0 warn).
- **Quality Log**: review majors advisory (resolved); no FAIL.

## Knowledge Update

Synced at verify S/A commit (folded into feature commit):
- `prospec/ai-knowledge/modules/types/README.md`, `lib/README.md`, `tests/README.md`
- `prospec/ai-knowledge/module-map.yaml` reconciled to curated index (single-source truth)

## Notes

方案 A（單一真相）+ `index.md ## Modules` 保留為生成式 view（人類確認）。stack 於 #57 branch（issue #57 止血先行）。index.md 重生：curated content 欄零 diff；cli/tests「Depends On」改為 relationships.depends_on 真值（修正 stale 手寫）。
