# extend-provenance-audit-scope — Archive Summary

- **Archived**: 2026-08-03
- **Original Created**: 2026-08-03T01:43:19.464Z
- **Quality Grade**: A
- **Issue**: #125 · **PR**: #126 · **introduced_by**: `mechanize-review-gate`

## User Story

作為守 archive 閘門的維護者，
我要兩道 provenance 閘門的稽核狀態集合由一份明示登記表決定且涵蓋 `verified`，並讓 `/prospec-archive` 的 Entry Gate 機器消費它們，
以便 verify 之後的程式碼變動會在下一次 `prospec check` 就轉紅，而不是靠人手動比對 digest 才發現。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `PROVENANCE_AUDITED_STATUSES` 登記表 ＋ `Set` 支撐的 `isProvenanceAudited()`；同步 `DRIFT_CHECK_IDS` 兩處 per-id 註解 |
| lib | High | 兩個 evaluator 改讀登記表（`drift-checker.ts:364`／`:515`）；`status-router` 的 `verified` 分支補宣告兩道閘門 |
| templates | High | archive Entry Gate 新條目；review／verify 的 status 條目改述為 floor；`init/status-lifecycle.md.hbs` 新增 audit-scope 表 |
| tests | High | 兩個 gate 的 `verified` 雙向案例＋負向案例；audit-scope 表 ↔ 登記表雙向集合相等；Entry Gate bullet-scoped 斷言；router 單元斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-075 | ADDED | provenance 稽核範圍登記表 ＋ 純述詞（`satisfies` 守衛、`Set` 而非物件查表） |
| REQ-TEMPLATES-171 | ADDED | archive Entry Gate 消費兩道 check，並明載重驗未達 S/A 時不可 archive |
| REQ-TEMPLATES-172 | ADDED | `_status-lifecycle.md` 兩份副本的逐 status audit-scope 表 |
| REQ-TEMPLATES-173 | ADDED | review／verify 兩站可自 `verified` 再進入（status 條目為下限，無需回退轉換） |
| REQ-TESTS-073 | ADDED | 雙向覆蓋、文件↔登記表集合相等、契約散文的正負向斷言，逐一 mutation 驗證 |
| REQ-LIB-024 | MODIFIED | 稽核範圍改讀登記表；`archived` 為不可達而非豁免；verify 後 commit 必然 stale |
| REQ-LIB-033 | MODIFIED | 同讀一份登記表（兩道閘門不可分岔）；判序與平台語意完全不變 |
| REQ-TESTS-042 | MODIFIED | 場景清單的 `non-implemented` 改稱 outside-the-audit-scope |
| REQ-TESTS-056 | MODIFIED | 同上；其餘 shim／平台／revert-red 條目逐字保留 |
| REQ-LIB-035 | MODIFIED | router 的 `verified` 邊補宣告 provenance 閘門（宣告而非評估） |

## Completion

- **Tasks**: 26/26 code (100%)，4 `[M]` ＋ 2 `[V]`（不計入分母；T26 於本次 archive 執行，見下節）
- **Acceptance Criteria**: 三則 User Story 的 WHEN/THEN 全數有 `file:line` 或測試名對應，由 fresh-context grader 逐條核對
- **Gates**: `typecheck`／141 files 3104 tests／`counts:check` in sync／`prospec check` 0 fail；coverage statements 94.48%／lines 94.87%
- **現地重演**：真 CLI 於 temp git repo——`verified` 未改碼雙 PASS、改一行雙 FAIL、還原雙 PASS
- **Mutation**: `pnpm mutate src/types/change.ts` 86.49 → 90.63（新增碼零存活）＋ 6 組手動 revert-red

## Review & Verify

- **Review**: 4 round(s), 9 critical / 15 major — 5 fixed、3 refuted、1 交棒 archive。最值得記的是**後兩輪的 4 個 critical 全部源自前一輪的修復文字**，形狀一律相同：散文斷言了一個計數或 universal 而程式碼兌現不了（`seven of eight` marker 在 marker 增到 10 後過時；「唯一阻擋的 status 是 `tasks`」與 `implemented`-or-later 的 floor 矛盾）。三個 refuted 也有價值：F-1 提議的 `source_path` 過濾會把 fail-closed 轉成 fail-open；F-6 的死鎖前提被 `prospec verify record` 在 `verified` 上的既有成功路徑推翻。
- **Verify**: Grade A — machine ledger 1/5·4/5·5/5 全 PASS，judgment ledger 2/5 PASS（fresh context，10 條 REQ 逐條＋自行重跑 mutation）、3/5 PASS（6/6 條 Constitution）、6 not-applicable（`ui_scope: none`）；`pnpm test` exit 0。
- **Quality Log**: review 3 筆 WARN、verify 2 筆 WARN。兩筆為刻意保留並揭露：本變更自造的 `knowledge-size` 超標（基線餘裕僅 80／2 token，壓縮無法吸收）；`hasVerifyGrade` 的 `.some()` 既有缺口。第三筆 F-7 已於本次 archive 執行完畢（見下）。

## Story Convergence（本次 archive 執行）

`[M]` T26 已執行：`prospec/specs/features/drift-detection.md` 的 US-6 與 US-9 敘事與 acceptance scenario 原本仍宣稱只稽核 `implemented`，其中兩條與出貨行為相反。`mergeRequirementInPlace` 從 `#### REQ-` 起算，US 層文字機械合併碰不到，故由本站人工收斂：狀態條件改為指向 `PROVENANCE_AUDITED_STATUSES`，並把 `archived` 據實寫成「不可達」而非「豁免」。五條 ADDED REQ 另收攏至新建的 US-14。

## Deliberate Behavior Replacements

spec-sync 回報 1 條 REQ body 的 WHEN/THEN 被替換，確認為刻意：
- `REQ-LIB-024`：舊 bullet 的 `non-implemented` 改寫為 `outside PROVENANCE_AUDITED_STATUSES`，backfill 豁免、skipped 分支與 codepoint-sort 語意由新 bullet 完整承載，另加 `verified` 與 `archived` 兩條新 bullet

## Knowledge Update

已於 verify S/A commit prompt 同步（PB-005 的預防點），archive Entry Gate 與 Phase 4 覆核通過：
- `prospec/ai-knowledge/modules/{types,lib,templates,tests}/README.md` 與 `modules/lib/drift-engine.md`
- `prospec/ai-knowledge/_status-lifecycle.md`（新增 `## Provenance audit scope`，與 init 模板逐字一致）、`_playbook.md` PB-016 補「該順序現已由閘門強制」

## Escaped-Defect Note

`introduced_by: mechanize-review-gate` —— 該變更（2026-07-04）引入 `review-provenance` evaluator 時就把狀態過濾寫成 `status !== 'implemented'`，`split-verify-adjudication` 之後為 `test-provenance` 複製了同一行。缺陷形狀不是「機制不存在」而是「機制在跑，但稽核範圍恰好排除了最需要它的狀態」。判準已記入 lessons ledger 鍵 `gate/check-scope-excludes-the-state-it-guards`。
