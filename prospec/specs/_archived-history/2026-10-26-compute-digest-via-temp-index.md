# compute-digest-via-temp-index — Archive Summary

- **Archived**: 2026-10-26
- **Original Created**: 2026-10-25T14:05:31.121Z
- **Quality Grade**: A
- **Issue**: #415
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 依 `prospec check` 與 `prospec knowledge verify` 判斷模組新鮮度的開發者，
I want 模組 digest 由 git 對目前 work tree 會記錄的路徑與內容算出，
So that 內容相同的工作樹不會因為變更是否已 stage 或 commit 而得到不同答案。

（另含：權限錯誤不產生永遠新鮮的 digest、計算 digest 不改變使用者的 repository、REQ-TYPES-082 路徑基準改為 project-root-relative。第二次嘗試，前次 `close-digest-edge-cases` 於 plan 站 abandon。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `drift-sources.ts` 以兩段暫存 index 記錄取代 `hash-object` 與 lstat 持有判定；`git-read.ts` 匯出 `PATHSPEC_ENV`；`source-digest.ts` 刪孤兒 |
| types | Low | `SourceInventory.deleted` 換成 `changedBookkeeping`、刪 `prefix` |
| tests | Medium | module-digests 新增三態、權限、repo 不變、hook、racy、失敗歸因等 pin；spawn pin 改計兩段 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-015 | MODIFIED | 變更檔貢獻 git 會記錄的 entry（第一段 `git add -A` 判存在、第二段 `update-index --info-only` 取 id）；兩段各自的失敗歸因 |
| REQ-LIB-070 | MODIFIED | `hash-object` 改為最多五個暫存 index subprocess，只在模組列出變更檔時執行 |
| REQ-TYPES-082 | MODIFIED | `generated_artifacts` 為 project-root-relative globs |

## Completion

- **Tasks**: 16/16 (100%), 3/3 [M]/[V] (not counted)
- **Acceptance Criteria**: 12/12（frozen baseline revision 6；late-capture：plan 與 review 階段 amend 過）

## Review & Verify

- **Review**: 2 個 loop、共 6 輪（第一個 loop 5 輪達絕對上限，再加新 loop 1 輪）；critical 2 個（R1-1 index 複本失去 mtime 使 racy entry 被信任的 fail-open、R1-2 config-based hooks 不受 `core.hooksPath` 影響），皆經獨立 verifier 確認並以 pin 修正；第 2 輪起 0 critical。未修並帶入 verify 的 major：R1-3（第一段對整個專案 `git add -A` 的效能代價，已簽核取捨）、L2-1（記錄 lazy 觸發無 spawn pin）；minor：L2-2、L2-3。斷路器觸發 3 次（fix-induced ratio 一次、oscillation 兩次，後者源於 R1-5 的 bookkeeping 翻轉），皆由開發者 Manual override 決定。第 5 輪後的 R5-1～R5-4 修正為 in-session、未經獨立複審（見 review.md 註記），其後新 loop 第 1 輪 fresh-subagent 覆審確認。
- **Verify**: Grade A；task-completion／knowledge／tests 三個機器維度 PASS，constitution PASS（8/8 規則，fresh-subagent），delta-spec-compliance 由 grader 判 PASS（3/3 REQ、12/12 情境）但因 late-capture baseline 記為 not-adjudicated，design not-applicable；`pnpm test` 8785 passed／4 skipped，coverage 96.49%。
- **Quality Log**: plan verifier r1、r2 FLAWS，r3～r7 WARN（開發者簽核：spawn 上限放寬、不接受 object mtime 變動、接受並揭露 clean filter）；tasks verifier WARN；review 各輪 WARN（major 帶到 verify、斷路器 3 次）；verify WARN 2（未修 major、late-capture）。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md` 已同步兩段記錄、racy、hooks 與失敗歸因；lib、types、tests 已重新蓋章（`knowledge:check` 於 commit 後通過）。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 3. Overrides: 3. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |
| 2 | prospec-review | oscillation | review:4 | not pending |
| 3 | prospec-review | oscillation | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 開發者選擇 Break-glass 再一輪——第 3 輪 0 critical、新發現皆為 major／minor 且未推翻設計；修正 R3-1～R3-5、更正第 2 輪已修項目的 fixed 狀態，再做第 4 輪 full-lens re-review | consumed by prospec-review:d3fa6825ba777283ea656eb445e18ff74298aad58c9d64ad88e4deb9cd7b9c23 |
| review:4 | prospec-review | 開發者選擇修 R4-1～R4-6 後跑第 5 輪（絕對上限）就停——第 5 輪若只有 major／minor 不再修，記錄 review baseline 以 WARN 帶到 verify；只有 critical 才停下來問開發者 | consumed by prospec-review:008a08d14aa6aea2615ab7e845603c61f44e805c187953d80a8006a4d6fa4245 |
| review:5 | prospec-review | 開發者決定修完 R5-1～R5-4 後進 verify——review 已達 5 輪絕對上限、第 5 輪 0 critical；#412 未發布且 gitCapture 未 export，刪除 options 無外部影響；這批修正不再獨立複審，review baseline 以 in-session 記錄 | consumed by prospec-review:6db5981428e8f9edb51c17fe32dd4fa81d77afc512bf6af31992621358fcd7eb |
<!-- prospec:escalation-history-end -->
