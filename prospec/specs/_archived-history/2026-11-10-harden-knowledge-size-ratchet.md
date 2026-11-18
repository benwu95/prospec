# harden-knowledge-size-ratchet — Archive Summary

- **Archived**: 2026-11-10
- **Original Created**: 2026-10-21T06:26:50.598Z
- **Quality Grade**: A
- **Issue**: #401
- **Plan Decision**: option-a (graded_by: human)

## User Story

As a 在 CI 用 `prospec check --strict` 守門、知識庫含 submodule 或 symlink 目錄的專案維護者,
I want ratchet 在 merge-base 讀不到檔案內容的情況下略過該檔而不是判它為 absent,
So that 內容未變的檔案不會讓 CI 永久轉紅。

本 change 共 5 個 Story（回應 PR #406 review P1／P2／P3）：
- US-1 merge-base 端的 gitlink／symlink／非一般檔案不被誤判為新債 [P0]
- US-2 大小寫不敏感的檔案系統上只改目錄大小寫不誤判 [P0]
- US-3 無法解析的 ratchet 依原因給修正提示，且每條 fail-closed 分支有測試 [P1]
- US-4 知識 skill 不讓已超標的 L1/L2 檔變大 [P1]
- US-5 模組知識記錄 ratchet 而不讓任何超標檔變大 [P1]

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `applySizeRatchet` 加入祖先 gitlink／symlink 查詢、只量測 100644／100755、`core.ignorecase` 時以 index 路徑查詢；unresolvable 帶 `cause`，`evaluateKnowledgeSize` 以 `RATCHET_REMEDY` 依原因給提示 |
| templates | Medium | `prospec-knowledge-update`／`-generate` 加入「已超標檔不得比 merge-base 大」的程序；`drift-report-format` 補 skip 範圍與分因提示 |
| tests | Medium | collector unit、真實 git repo integration（情境 A／B／C、大小寫）、drift-checker 分因提示、skill-format contract |
| types | Low | 程式不變；`frozen-registries.md` 補 `size_ratchet` 與 finding 欄位說明 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-275 | ADDED | knowledge skills keep an over-budget L1/L2 file from growing |
| REQ-LIB-111 | MODIFIED | knowledge-size ratchet against the merge-base |
| REQ-TESTS-148 | MODIFIED | knowledge-size ratchet tests |
| REQ-TEMPLATES-274 | MODIFIED | the ratchet is documented where users configure and read it |

規格寫入 `prospec/specs/features/drift-detection/us-27.md`；US-27 的 Acceptance Scenarios 另補兩條（merge-base 端 submodule／symlink／大小寫維持 WARN、知識 skill 不讓超標檔變大）。

## Completion

- **Tasks**: 17/17 code tasks (100%)；[M]/[V] 1/4 勾選（不計入）——T19–T21 [V] 未勾選，但 verify 已有對應證據：mutation 驗證（grader）、source 版 `check --strict` exit 0、全部 Pre-Merge gate exit 0
- **Acceptance Criteria**: 14/15 個凍結情境符合；US-4.3 為 WARN（見下）

## Review & Verify

- **Review**: 5 rounds，1 critical / 6 major。R-1 critical（rebase 後 `gitCapture` 清除 `PATHSPEC_ENV` 的 pin）已修；R-9、R-14 major 已修；**R-2、R-3、R-4、R-12 major 維持 proposed**（祖先為一般目錄 → absent 的 pin、collector cause 分類、`_knowledge-loading-rules` 只有負面關鍵字斷言、ancestor `literal()` 無 pin）；minor R-5、R-6、R-8、R-11、R-13 未處理
- **Verify**: Grade A（2026-11-10）。機器：1/5、4/5、5/5 PASS；判定（fresh-subagent）：2/5 WARN（REQ-TESTS-148）、3/5 WARN（8 條規則 7 PASS，TDD 加註 WARN）、6 not-applicable。`pnpm test`（Node 22）exit 0，9,589 passed / 4 skipped；`test:coverage` Lines 98.18%
- **Verify 偏差**：US-4.3 凍結情境要求 "reported for downstream continuity"，但 main `d3e0bc7c` 已將該段改寫為 "Commit-time keys stay for continuity"，情境文字過時，非本 change 遺漏（`verify.md` 2026-11-10 grade A 段）
- **Quality Log**: ff WARN（US-5 依賴 US-1～3）；plan 三輪 WARN（Call Chain 入口、`_knowledge-loading-rules` 渲染進下游、ignorecase 跨平台、REQ bullet 拆分，皆在 tasks T13 落實）；implement WARN（範圍外測試補 `hookTimeout`）；review 多輪 WARN（上述 proposed majors、R-14 counts）；delegation WARN（round 5 ticket 因 rebase 被拒，人類接受現狀）

## Follow-ups

- R-2／R-3／R-12：補 collector 層 `history`／`ref` cause 斷言、祖先為一般目錄的新檔 pin、ancestor `literal()` pin
- R-13：ratchet 的 index read 改用 main 的 `readIndexEntries`，讓 `GIT_DIR`＋`GIT_WORK_TREE` 下 repo 選擇一致
- R-5／R-6：使用者文件與 config-example 補 `ref` 類提示、大小寫歧義與 merge-base 端連結例外

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | max_rounds_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | R-1 是局部修正，補 env 清理與 pin 後再 review 一輪 | consumed by prospec-review:e0d3b448bab01b6eda1391ac3c3794610d9e1714ce827f020ca7e50627a947b1 |
<!-- prospec:escalation-history-end -->
