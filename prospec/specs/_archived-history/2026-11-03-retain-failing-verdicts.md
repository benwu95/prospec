# retain-failing-verdicts — Archive Summary

- **Archived**: 2026-11-03
- **Original Created**: 2026-11-03T06:17:34.714Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/443
- **Plan Decision**: option-a (graded_by: human)

## User Story

As a 使用 backfill 與 full-scale plan sign-off 的開發者，
I want 保留當次失敗判定、並行 verifier 結果與實際 publication milestones，
So that 舊 sign-off 或整維豁免不會把真實 FAIL 轉成可前進狀態。

三個 Stories 分別處理 backfill grading、sign-off 並行與部分結果、lifecycle 的 scale／status 指引；八個 frozen acceptance scenarios 均無語義偏離。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| types | High | applicability 與 typed publication failure 契約 |
| lib | High | 共用 publication claim、optional guard、逐規則 debt eligibility |
| services | High | grading、sign-off freshness、各 writer catch 的持久狀態投影 |
| cli | Medium | text／JSON 真實 milestones 與 check 的非零錯誤路徑 |
| templates | Medium | quick 三種選擇方式、七個 statuses、逐規則 backfill 指引 |
| tests | High | 真實 writer／process、成對故障、來源／bundle／部署契約 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-TYPES-117 | ADDED | 真實 metadata／sign-off publication errors |
| REQ-LIB-109 | ADDED | 共用 claim 與 optional commit guard |
| REQ-TESTS-147 | ADDED | FAIL 保留與 lifecycle 回歸矩陣 |
| REQ-TYPES-102 | MODIFIED | 逐規則 Constitution applicability |
| REQ-TEMPLATES-116 | MODIFIED | proven debt 豁免與 actual FAIL 保留 |
| REQ-SERVICES-113 | MODIFIED | raw audit 與 selective effective floor |
| REQ-SERVICES-117 | MODIFIED | stale sign-off 拒絕與部分結果 |
| REQ-CLI-029 | MODIFIED | grading 保留 aggregate FAIL 與 test FAIL |
| REQ-CHNG-004 | MODIFIED | scale 選擇分工與七個 metadata statuses |
| REQ-SERVICES-126 | MODIFIED | accepted／event／grant 實際持久狀態 |
| REQ-SERVICES-068 | MODIFIED | check completion 傳遞 typed publication error |
| REQ-CLI-022 | MODIFIED | check 非零與既有 --json 錯誤輸出 |

## Completion

- **Tasks**: 25/25 code tasks（100%）；1/1 verification reminder 已完成。
- **Acceptance Criteria**: 8/8 frozen scenarios；REQ coverage 12/12。
- 六個 Knowledge 模組已同步與蓋章，當時 feature commit 為 ec576070。

## Review & Verify

- **Review**: 2 rounds，0 critical／1 major；metadata-format 的人工確認前提已刪除並釘回歸，最終 0 未解決 finding。Fresh reviewer 定向驗證 16/16 files、673/673 tests PASS。
- **Verify**: Grade A；machine tasks／Knowledge／tests PASS，Constitution 8/8 PASS，spec compliance WARN，design not-applicable，八個 scenarios 無偏離。
- **Tests**: macOS、Node 24.20.0、pnpm 11.3.0、Vitest 4.0.18；完整 342/342 files，9270 passed＋4 skipped／9274 inventory。Coverage statements 96.85%、branches 92.03%、functions 99.17%、lines 98.14%。
- **CI**: lint、typecheck、build、counts:check、agents:check、source check --strict 均 exit 0；23 checks 無 FAIL，保留既有 knowledge-size WARN。Feature commit 後 knowledge:check 亦 exit 0，六個 source-touched modules 全部 confirmed。
- **Quality Log**: plan verifier 前兩輪 FLAWS 暴露 partial-publication 語義與 check catch 遺漏，第三輪 PASS；review 第一輪 WARN 為 scale 文件矛盾，第二輪 PASS。Verify 的唯一 WARN 原為 commit-range knowledge:check 尚 SKIP，已在 ec576070 後實測通過；原 grade A 與警告歷史保留。

## Harvest

依 quality_log／review 收割 2 筆新 lessons，對平行站點遺漏與 source-touched Knowledge 確認各再證一次；未晉升 shared rules。Scale writer 的結構 pin 已在 contract suite，後續由 prospec-learn 評估跨欄位 family 擴充。

## Knowledge Update

types、lib、services、cli、templates、tests 的 READMEs 與受影響 sub-modules 已反映實作；來源、bundle、四種 agent host 部署與雙語公開文件一致。

## Boundaries

A 方案的 sign-off guard 明示捕捉輸入；共用 claim 約束 cooperating Document writers，其他 callers 維持既有 revision 語義。Claim 遺留需人工確認，跨檔案 partial publication 不宣稱 rollback。#444 projection 契約與無法重建的舊 archive baseline 不在本 change 範圍。

## Windows CI Follow-up

PR 首輪 Linux gate 通過，Windows smoke 四個新 publication fixtures 失敗：fault target 的 realpathSync 字串與 writer 的 native resolution 語意不一致，造成 rename spy 未注入故障。以 case-alias target 本機重現相同 4 failed／1 passed 型態，三處 oracle 改用 fs.promises.realpath；保留所有既有斷言，沒有新增 skip，產品邏輯不變。CI 結果以 PR checks 為準，後續完成狀態記錄於 PR 本文。
