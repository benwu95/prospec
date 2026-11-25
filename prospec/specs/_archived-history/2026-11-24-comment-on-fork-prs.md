# comment-on-fork-prs — Archive Summary

- **Archived**: 2026-11-24
- **Original Created**: 2026-11-24T15:56:14.453Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/460
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 維護 prospec repo 的開發者,
I want fork PR 的 coverage 摘要與 Prospec Check 報告以 sticky 留言出現在 PR 上，
So that fork PR 不再掛著需要人工判斷可忽略的紅燈，fork 貢獻者也看得到報告。

As a 在自己專案執行 `prospec check --init-ci` 的下游開發者,
I want 產出的 workflow 在 fork PR 上同樣能留言且不亮紅燈，
So that 接受 fork PR 的下游專案不會繼承同一個失敗。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `prospec-check.yml.hbs` 移除 comment job、上傳 PR 編號；新增 `prospec-check-comment.yml.hbs`（`workflow_run` 留言） |
| services | Medium | `check.service` 的 `--init-ci` 產出兩檔、先寫 comment 後寫 check、回報每檔 created／exists／skipped |
| cli | Low | `--init-ci` 說明與逐檔輸出 |
| tests | Medium | 新增 `pr-comment-workflows.test.ts`（以 bash＋假 `gh` 執行驗證與組字步驟）；更新 init-ci、ci.yml baseline、e2e 與範本 guard |

另：`.github/workflows/` 兩個上游 workflow 改為只上傳報告與 PR 編號，新增 `ci-comment.yml` 與 `prospec-check-comment.yml`（後者與範本渲染結果相同，只有 action 版本不同：repo 用版本號、範本釘 commit SHA）；`docs/reference/cli-reference.md`／`.zh-TW.md` 同步。

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-151 | ADDED | PR comment workflows are pinned by executing their verification |
| REQ-TEMPLATES-091 | MODIFIED | CI Workflow template — 拆成 check 與 `workflow_run` comment 兩個 workflow |
| REQ-SERVICES-027 | MODIFIED | Check Service thin orchestration — `--init-ci` 兩檔、不覆寫、回報每檔結果 |

## Completion

- **Tasks**: 15/15 (100%)；[M]/[V] 2/4（T19 合併後以 fork PR 實測、T17 gate 已於 verify 前完成但未勾選）
- **Acceptance Criteria**: 8 個凍結情境中 US-1.1／US-1.2 只能在合併後以 fork PR 實測（`workflow_run` 只從預設分支觸發），其餘由測試覆蓋

## Review & Verify

- **Review**: 2 round(s), 1 critical / 0 major — R1-1（critical，verifier 確認）：drift 報告中的單獨 CR 讓 fork 內容跳出 4-space code block，已改為先 `tr '\r' '\n'` 再縮排並加 regression pin；R1-2、R2-1（minor）：`--init-ci` 文件與 skipped 訊息的不實宣稱；R2-2（minor）：不存在的 PR 編號讓留言 workflow 失敗、在預設分支亮紅燈，改為 warning 並略過
- **Verify**: Grade A（graded_by fresh-subagent）；machine：task-completion／knowledge／tests 皆 PASS；judgment：constitution PASS（8/8）、delta-spec-compliance WARN（3/3 REQ PASS，US-1.5 情境例子不精確）、design not-applicable；`pnpm test` 368 檔 9989 passed／4 skipped，`test:coverage` statements 96.95%
- **Quality Log**: prospec-plan verifier r1 WARN（12 項：寫入順序、artifact 解壓路徑、base repo 查詢、fork 欄位內插、coverage REQ 情境等，皆已納入 plan）→ r2 WARN（1 項：下載路徑斷言，已納入）→ r3 PASS；prospec-tasks verifier WARN（11 項 advisory，已納入 tasks）；prospec-verify WARN：US-1.5 的例子「例如被取消」不精確，被取消的 run 仍會上傳 pr-number.txt 並留下「報告不可用」留言（與舊 comment job 行為一致，未修訂凍結情境）

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md`（init 範本列；為維持 knowledge-size ratchet 同檔刪一個重複子句）
- services、cli、tests、lib 已以 `prospec knowledge verify` 蓋章；services／tests README 未增文字（ratchet 下行為已寫在程式碼註解與 Feature Spec）
