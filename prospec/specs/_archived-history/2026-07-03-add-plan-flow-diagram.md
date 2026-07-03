# add-plan-flow-diagram — Archive Summary

- **Archived**: 2026-07-03
- **Original Created**: 2026-07-03
- **Quality Grade**: S
- **Issue**: [#47](https://github.com/benwu95/prospec/issues/47) · **Commit**: `697124e`

## User Story

As a 使用 `/prospec-plan` 規劃並審閱 plan.md 的開發者,
I want plan.md 在 user story 較複雜時自動附上一張行為/決策流程圖,
So that 我能一眼掌握分支與狀態轉移，不必只靠文字逐句推敲。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `plan-format.hbs` 新增 Section 5 條件式流程圖規格；`prospec-plan.hbs` Phase 4 on-demand 產圖子步驟＋Gate＋NEVER |
| tests | Medium | `skill-format.test.ts` 新增 4 條 section-scoped 契約斷言（含 negative Startup-Loading 守衛＋跨檔一致性守衛） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-125 | ADDED | Plan 對複雜 user story 產生條件式 Mermaid 行為流程圖（any-of 結構訊號、沿用 `_diagram-conventions.md`、不計入 120 行上限、on-demand 讀取不進 Startup Loading） |

## Completion

- **Tasks**: 6/6 code tasks（100%）；`[M]`×1、`[V]`×2 已執行
- **Acceptance Criteria**: AC1–AC5 全數 met

## Review & Verify

- **Review**: review-clean，0 critical；1 major（PB-006 DRY 漂移）依使用者指示加跨檔一致性契約斷言解決
- **Verify**: Grade **S**，6 維度全 PASS；全套 **1840** 測試綠、`prospec check` 8/8 PASS

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md`（已於變更內同步，PB-005）
- `prospec/ai-knowledge/modules/tests/README.md`（已於變更內同步；測試計數 1836→1840）
- REQ-TEMPLATES-125 graduated → `prospec/specs/features/sdd-workflow.md`（US-2）
