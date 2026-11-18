# fix-ratchet-review-findings — Archive Summary

- **Archived**: 2026-11-10
- **Original Created**: 2026-11-10T07:58:18.888Z
- **Quality Grade**: A
- **Issue**: #401
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 在 Windows（`core.autocrlf=true`）或設定 `core.autocrlf=input` 的 repo 上跑 `prospec check --strict` 的維護者,
I want ratchet 比較的兩個值不受行尾差異影響,
So that 內容未變的檔案不會 FAIL，真正變大的檔案也不會被行尾差抵銷而漏判。

本 change 回應 PR #406 第二輪 review（P2 ×4、P3 ×5），共 4 個 Story：
- US-1 行尾設定不影響 ratchet 的成長判定 [P0]
- US-2 merge-base 沒有這個路徑時，訊息照實描述 [P1]
- US-3 以 `GIT_DIR`＋`GIT_WORK_TREE` 選 repo 時 ratchet 照常量測 [P1]
- US-4 決定 FAIL 的分支與下游 partial 大小有結構性測試 [P1]

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | 比較時兩側去掉 `\r`（選填 `lf_measure`），且去 `\r` 後仍須超標才 FAIL；absent 的獨立 detail；index 讀取改走 `listPathspecs`；`gitProjectPrefix` 帶 timeout；刪除 `RATCHET_GIT_TIMEOUT_MS` |
| types | Low | `config.ts` 新增 collector 與 evaluator 共用的 `overBudgetUnits`；`drift-report.ts` 的 `base_actual` 註解 |
| templates | Low | `drift-report-format` 補回 "whole"、寫明 absent 與正規化的 `base_actual` |
| tests | Medium | 行尾兩方向、改名、`GIT_DIR`、一般目錄祖先、collector cause、下游 index 大小錨點（819 tokens）；integration 改用 `gitIn`、移除 review 輪次編號 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-111 | MODIFIED | knowledge-size ratchet against the merge-base |
| REQ-TESTS-148 | MODIFIED | knowledge-size ratchet tests |

規格寫入 `prospec/specs/features/drift-detection/us-27.md`（新增 9 條 WHEN/THEN，既有 bullet 全數保留）；US-27 story 層級另補一條行尾與 absent 的 acceptance scenario。

## Completion

- **Tasks**: 19/19 code tasks (100%)；[M] 2/2；[V] 0/3 勾選（不計入）——T19 mutation 驗證由 review／verify 的 subagent 在 snapshot 內執行，T20／T21 的 gate 均已通過（見下）
- **Acceptance Criteria**: 11 個凍結情境中 10 個符合；US-2.1 為 WARN（見下）

## Review & Verify

- **Review**: 2 rounds，0 critical / 1 major。R-1 major（「是否超標」仍以含 CRLF 的原始量測判斷，行尾仍影響 `--strict`）已修，pin：「does not fail a file that is over budget only by its carriage returns」，mutation 拿掉 `current > budget` 轉紅；R-2 minor（grew detail 並列原始值與正規化 base）已修，pin 經 mutation 轉紅；**R-3 minor 維持 open**：merge-base 不存在且只因 `\r` 超標的分支沒有測試
- **Verify**: Grade A。機器：1/5、4/5、5/5 PASS；判定（fresh-subagent）：2/5 WARN（REQ-TESTS-148，同 R-3）、3/5 PASS（8/8）、6 not-applicable。`pnpm test`（Node 22）exit 0，9,609 passed / 4 skipped；`test:coverage` Lines 98.18%
- **Verify 偏差**：US-2.1 凍結情境寫「merge-base 不存在的超標檔 → FAIL」，但只因 `\r` 超標時依較新的 REQ-LIB-111 bullet 判 WARN；實作依 delta-spec，情境未寫明此例外（`verify.md` 2026-11-10 grade A 段）
- **Quality Log**: new-story WARN（INVEST、scale 判定）；plan verifier WARN → WARN → PASS（三輪，含 `listPathspecs` 呼叫端誤述修正）並經人類簽核；tasks verifier WARN（4 條建議已併入）；review round 1 WARN（R-1）、round 2 PASS
- **Test 記錄事件**：verify Step 0 第一次 `--record-tests` 因 round 1 reviewer 遺留在 snapshot 的 `counts:check` 同時跑完整 vitest，load 34，5 個無關測試逾時（exit 1）；負載退去後重錄 exit 0

## Follow-ups

- R-3：補「merge-base 不存在且只因 `\r` 超標 → WARN」的 pin
- #458：ratchet 的 `cat-file` 改批次讀取與整體 deadline
- `--auto-draft` 是否排除 history／environment 類 unresolvable：待 PR reviewer 回覆
