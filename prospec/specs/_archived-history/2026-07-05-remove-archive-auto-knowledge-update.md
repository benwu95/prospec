# remove-archive-auto-knowledge-update — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a prospec 維護者，
I want `archive.service.execute()` 不再自動觸發 knowledge-update 與 raw-scan safety net，且 skill 模板誠實描述手動逐 phase 為唯一路徑，
So that 歸檔流程不再有清空 curated `index.md` 的危險死碼，規格與程式碼一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | 移除 archive.service.execute() 兩段 auto side effect + ArchiveResult/ArchivedChange 欄位 + orphan imports |
| templates | Medium | prospec-archive.hbs 反向宣稱修正；SKILL.md（.claude/.agents）regen |
| tests | Medium | 移除失效 mock/案例；新增 mutation-verified regression |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-064 | ADDED | archive.service 不自動觸發 knowledge-update / raw-scan |
| REQ-KNOW-023 | MODIFIED | raw-scan shared core 移除 archive 消費者 |
| REQ-TESTS-034 | MODIFIED | backfill contract 斷言移除 auto-update skip 子項 |
| REQ-TESTS-035 | MODIFIED | 移除 archive→auto-update 轉發斷言，保留 syncFeatureMap no-clobber |
| REQ-SERVICES-031 | REMOVED | archive 對 backfill 跳過 auto knowledge-update（moot） |
| REQ-SERVICES-033 | REMOVED | archive 轉發 related_modules 給 auto knowledge-update（moot） |

## Completion

- **Tasks**: 7/7 code tasks (100%); [M] 1/1, [V] 6/6
- **Acceptance Criteria**: US-1 3/3, US-2 2/2 met

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean (independent fresh-context reviewer, all lenses)
- **Verify**: Grade S, dimensions 1/5·3/5·4/5·5/5 PASS, 2/5 PASS (delta-spec), 6 N/A (ui_scope none); full suite 1985 tests green
- **Quality Log**: no WARN/FAIL (all stages PASS)

## Knowledge Update

Synced at verify S/A commit (folded into feature commit):
- `prospec/ai-knowledge/modules/services/README.md`
- `prospec/ai-knowledge/modules/tests/README.md`

## Notes

止血範圍：`generateProductSpec`/`syncFeatureMap` 保留。後續 issue 處理 `updateIndex` curated-column 保真度根治，以及現已無 production caller 的 `knowledge-update.service` 去留。
