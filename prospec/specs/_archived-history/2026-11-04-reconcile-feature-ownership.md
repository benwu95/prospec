# reconcile-feature-ownership — Archive Summary

- **Archived**: 2026-11-04
- **Original Created**: 2026-11-04T04:14:02.247Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/446
- **Plan Decision**: option-a (graded_by: human)

## User Story

統一現役 Feature Spec 歸屬並保留原 REQ 身分、Story intent 與來源歷史；修正 archive helper 同 feature 拒收仍部分建立，以及 bootstrap 漏讀 registered slices。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| services | High | 兩個既有 archive helpers 的局部修正；沒有新 API |
| lib / types / cli / templates | Low | 重用既有 reader／heading／routing；能力維持，重複規格身分收斂 |
| tests | High | 43 個新增 cases，real-FS integration 與 refusal／slice matrix |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-LIB-001 | MODIFIED | Token Budget Override Drift Check |
| REQ-LIB-002 | MODIFIED | Knowledge Size Headroom |
| REQ-LIB-052 | MODIFIED | Canonical Doc Drift Check |
| REQ-LIB-061 | MODIFIED | Delta-Spec Landing Fidelity Check |
| REQ-LIB-068 | MODIFIED | REQ Id Uniqueness Drift Check |
| REQ-SERVICES-001 | MODIFIED | Knowledge Update Sweep |
| REQ-SERVICES-090 | MODIFIED | `prospec knowledge verify` stamps `last_verified` and `source_digest` |
| REQ-SERVICES-018 | MODIFIED | Spec Sync Replaces in Place |
| REQ-LIB-067 | MODIFIED | Feature Spec Slice Parsing |
| REQ-SPECS-001 | MODIFIED | specs/ Directory Structure |
| REQ-CLI-034 | MODIFIED | Archive exits non-zero when trust-zone content would be lost |
| REQ-SERVICES-029 | MODIFIED | archive Sole writer `syncFeatureMap` (bootstrap-once + no-clobber) |
| REQ-DSGN-008 | MODIFIED | Platform Adapter -- HTML |
| REQ-TEMPLATES-050 | REMOVED | Design Spec Format Reference |
| REQ-TEMPLATES-051 | REMOVED | Interaction Spec Format Reference |
| REQ-TEMPLATES-052 | REMOVED | prospec-design Skill Template |
| REQ-TEMPLATES-053 | REMOVED | Platform Adapters (pencil / Figma / Penpot / HTML) |
| REQ-TEMPLATES-057 | REMOVED | Proposal UI Scope Field |
| REQ-TEMPLATES-058 | REMOVED | Implement Skill MCP-First Design Reading |

## Completion

- **Tasks**: code tasks 8/8；human delivery approval 已取得；archive 語意收斂完成，歷史 tasks artifact 的未勾選 [V] 保持當時原狀。
- **Acceptance Criteria**: verify 對 10/10 frozen scenarios 無 semantic deviation；archive semantic audit 3372/3372 PASS，standing checks 的最終結果另列 PR。
- **Graduation**: 9/9 retained REQ 唯一 canonical owner、57/57 原 WHEN bullets、4/4 永久 deprecated history-only 容器、6/6 Design mappings、Fast-Forward 3/3 與 stamp 3/3 scenarios；28/28 原 history rows 與 822/822 unrelated REQ bodies 保留，curated registry bytes 不變。

## Review & Verify

- **Review**: 1 round，0 critical / 0 major / 0 minor；fresh context，八個 lenses，receipt PASS。
- **Verify**: Grade S；19/19 REQ PASS、8 Constitution rules PASS，machine tasks／Knowledge／tests PASS，design not-applicable。
- **Tests**: feature commit a0d97bbe 前的完整 343/343 files，9435 passed＋4 skipped／9439 collected；四項 coverage 最低 branches 92.08%。
- **Quality Log**: no WARN/FAIL；strict 0 FAIL／1 WARN（knowledge-size）。
- **Limitations**: verifier snapshot dry-run 受 Git ancestor prerequisite 影響，採 certified main full-run 19/19 與來源對照；未宣稱 snapshot 全綠。Feature commit 後 knowledge:check 已實際通過 2/2 source-touched modules。

- **Archive contract maintenance**: REQ-SERVICES-029 補齊正文後，依既有 shrink-only ledger 移除該一筆 legacy body-less 例外（10→9）；原 assertions 維持，focused 3/3 PASS，暫時刪正文的 mutation 轉紅後還原。tests freshness 已由 CLI 重新確認。

## Knowledge Update

Services Spec Sync 與 tests 導覽更新；六個既有 modules 均已審閱、CLI stamping，無新 modules 或 templates。#445 原工作樹的 28 個修改檔、index、HEAD 與 branch 保持原狀。
