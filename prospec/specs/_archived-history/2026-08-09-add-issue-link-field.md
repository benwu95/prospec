# add-issue-link-field — Archive Summary

- **Archived**: 2026-08-09
- **Original Created**: 2026-08-08T16:52:04.014Z
- **Quality Grade**: S

> 本變更自身沒有 `issue` 欄位：它新增的 `--issue` 只存在於 `change story`，而變更目錄建立時該旗標尚不存在，`metadata.yaml` 又是 CLI-written 不得手改。本輪刻意不加事後補登的 setter（超出 issue #131 範圍）。對應 issue 為 **#131**，自下一個變更起由欄位本身承載。

## User Story

As a 專案維護者（或接手的 agent），
I want 變更對應的追蹤項記錄在變更自己身上，
So that 這條連結不再只活在人與特定 harness 的記憶裡——換 session、換 harness 都不會消失。

三個子故事：US-1 機械載體（schema ＋ `--issue` 寫入）、US-2 顯示面（`prospec status` 與 archive summary）、US-3 慣例的文件載體（`CONTRIBUTING.md` ＋ 新的 `submit-pr` maintainer skill）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `ChangeMetadataShape.issue`；`ChangeRouteFacts`／`ChangeRoute` 帶 optional `issue` |
| lib | Medium | `normalizeIssueRef` 唯一決定 absent／blank／multi-line 語意；`routeChange` 原樣傳遞 |
| services | Medium | `change-story` 寫入、`status.collectFacts` 蒐集、`archive.generateSummary` 輸出 Issue 列 |
| cli | Low | `change story --issue <ref>` 旗標；`status-output` 有值才印 |
| templates | Medium | `metadata-format`／`archive-format` 兩份 reference；ff／new-story 併問追蹤項 |
| tests | High | unit／contract／e2e 三層，含 mutation 驗紅 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-080 | ADDED | ChangeMetadata issue external-tracker registration field |
| REQ-LIB-047 | ADDED | Route evaluator passes the issue registration through |
| REQ-LIB-048 | ADDED | Single-line issue reference normalization |
| REQ-SERVICES-085 | ADDED | Services write, collect and surface the issue registration |
| REQ-CLI-036 | ADDED | change story --issue flag |
| REQ-TEMPLATES-178 | ADDED | metadata-format and archive-format references document the issue field |
| REQ-TEMPLATES-179 | ADDED | Change-creating skills ask for the tracker item |
| REQ-TESTS-081 | ADDED | Issue-registration coverage at every layer |
| REQ-CLI-023 | MODIFIED | prospec status Command and Formatter |

八條 ADDED 全數畢業到 `sdd-workflow.md` 新建的 `## US-35`（機械併入只會插在 `## Edge Cases` 前，故人工歸位）；`REQ-CLI-023` 就地替換，其被取代的一條 bullet 已於 delta-spec 以 `**Dropped:**` 宣告，archive 回報為 acknowledged drop、未 hold write。

## Completion

- **Tasks**: 23/23 code (100%)，4/4 `[M]`／`[V]`（不計入分母）

## Review & Verify

- **Review**: 5 round(s)，7 critical / 5 major —— 6 個 confirmed critical 中僅 2 個出自原始實作，其餘 4 個由前一輪的修復造成（round 2 的兩個源於 round 1、round 3 的兩個源於 round 2）；1 個經獨立 verifier 判定 not-found。最重的是 F-1：多行 `--issue` 值可在已納版控的 `_archived-history/` 稽核軌跡偽造 `##` 標題與第二條 `- **Quality Grade**: S`（verifier 以 source CLI 端到端重現）。Round 5 回報 0 findings，迴圈收斂。
- **Verify**: Grade **S** —— machine ledger `task-completion` / `knowledge` / `tests` 全 PASS（皆由 `prospec check` 裁決），judgment ledger `delta-spec-compliance` / `constitution` 全 PASS、`design` not-applicable。`pnpm test` 3581 passed / 4 skipped（148 files，exit 0），coverage 95.4% lines，`prospec check` 16/16 僅餘既有的 `knowledge-size` WARN。
- **Quality Log**: 1 筆 WARN —— round 1 的 F-3（`REQ-TYPES-070` 應否列 MODIFIED）經 verifier 三點推翻並記錄理由；其餘 round 與 verify 皆 PASS。

## Knowledge Update

六個 source-touched 模組的 README 已於 feature commit 同步：`types`／`lib`／`services`／`cli`／`templates`／`tests`。`lib`／`services`／`cli` 只剩 <40 字元 headroom，皆採 net-neutral 編輯；`types/README.md` 首版編輯曾把它推過 L2 預算並產生新 WARN，已回收為 -2 字元。收斂後 `knowledge-size` 的 L2 findings 集合與 `main` 逐項一致。

**留給後續的兩個事實**：`types/README.md` 與 `lib/README.md` 皆已壓在 L2 預算天花板（1799/1800），下一次要往它們加知識必須先抽 sub-module；`--issue` 只存在於 `change story`，錯過就得重建變更，若日後證明需要事後補登，那是獨立變更。
