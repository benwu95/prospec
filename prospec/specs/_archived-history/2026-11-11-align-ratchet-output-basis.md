# align-ratchet-output-basis — Archive Summary

- **Archived**: 2026-11-11
- **Original Created**: 2026-11-10T10:51:35.549Z
- **Quality Grade**: S
- **Issue**: #401
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 在 Windows（`core.autocrlf=true`）上跑 `prospec check` 讀分組輸出的維護者,
I want 每行並列的目前值與 merge-base 值用同一個量測基準,
So that 內容未變的超標檔不會看起來像漏抓的成長。

本 change 回應 PR #406 第三輪 review（P3 ×2 與兩點補充），共 2 個 Story：
- US-1 CRLF checkout 下的分組輸出印出同基準的兩個數字 [P1]
- US-2 設定文件列出 ratchet 的每種修正提示與略過原因 [P2]

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `KnowledgeSizeFindingSchema` 新增選填 `ratchet_actual`（非負整數） |
| lib | Low | `ratchetGrade` 在比較值與原始值不同時回傳 `ratchet_actual`；FAIL detail 改讀它 |
| cli | Low | `ratchetNote` 有 `ratchet_actual` 時並列它與 merge-base 值 |
| templates | Low | `drift-report-format` 說明 `ratchet_actual` 與完整的 `ratchet_skipped` 原因 |
| tests | Medium | types、evaluator、formatter、integration、contract 測試；刪除對 reference 措辭的負向斷言 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-083 | MODIFIED | knowledge-size structured finding field |
| REQ-TYPES-118 | MODIFIED | knowledge.size_ratchet config and the ratchet finding fields |
| REQ-LIB-111 | MODIFIED | knowledge-size ratchet against the merge-base |
| REQ-CLI-011 | MODIFIED | `prospec check` command |
| REQ-TEMPLATES-274 | MODIFIED | the ratchet is documented where users configure and read it |
| REQ-TESTS-148 | MODIFIED | knowledge-size ratchet tests |

規格寫入 `drift-detection/us-1.md`（US-4）與 `drift-detection/us-27.md`，既有 bullet 全數保留；US-27 另補一條 check 輸出同基準的 story 層級情境。

## Completion

- **Tasks**: 12/12 code tasks (100%)；[M] 1/1；[V] 2/2
- **Acceptance Criteria**: 6/6 個凍結情境符合，`scenario_findings` 為空

## Review & Verify

- **Review**: 2 個 loop、共 4 輪，0 critical / 0 major / 4 minor（皆已修）。R-1／R-3 `configuration.md` 對 `ratchet_actual` 出現條件與大小寫歧義略過條件說得比程式寬；R-2 knowledge-size.md 漏列欄位；R-4 reference 的 `ratchet_skipped` 原因不完整。第二個 loop 只審 knowledge stamp 變動，0 open
- **Verify**: Grade S。機器：1/5、4/5、5/5 PASS；判定（fresh-subagent）：2/5 PASS（6/6 REQ，5 組 mutation 皆轉紅，CRLF 端到端 probe 確認輸出與 JSON）、3/5 PASS（8/8）、6 not-applicable。`pnpm test`（Node 22）exit 0，9,616 passed / 4 skipped；`test:coverage` Lines 98.19%
- **Quality Log**: new-story WARN（scale）；plan verifier WARN → WARN → PASS（三輪）並經人類簽核；tasks verifier WARN（排序備註）；review 各輪 PASS
- **流程事件**：
  - `pnpm counts` 在機器滿載（auditd、Spotlight、Jamf）時因 `spawnSync git ETIMEDOUT` 少載入 3 個測試檔，照不完整報告把計數改小（9,613 → 9,560）；負載退去後重算為 9,620，並以 `vitest list` 逐層核對
  - review 第 2 輪修 R-4 時改了模板與 fixture 但未重新 stamp templates／tests，verify 時 `knowledge-health` 轉 WARN；補 stamp 後重錄測試並以新的 review loop 審查 stamp 變動

## Follow-ups

- `--auto-draft` 排除 `history`／`environment` 類 unresolvable（`config`、`ref` 保留）：reviewer 已同意，另開 issue
- `scripts/sync-counts.ts` 在測試檔載入失敗時仍照常寫入計數，應改為拒絕不完整的報告
- #458：ratchet 的 `cat-file` 批次讀取與整體 deadline
