# add-static-gitignore-block — Archive Summary

- **Archived**: 2026-10-18
- **Original Created**: 2026-10-18
- **Quality Grade**: A
- **Issue**: #396
- **Plan Decision**: plan (graded_by: human)

## User Story

作為在既有 git 專案導入 prospec 的開發者，我要 init 與 agent sync 維護一段固定內容的 `.gitignore` 受管區塊：ignore 本機產物（`.prospec/`、`prospec-report.json`）、重新納入 `prospec-*` skill，並在 skill 仍被既有規則 ignore 時收到造成排除的規則與可貼到檔尾的建議規則；init 輸出須說明 `.gitignore` 是新建或被修改。此為第二次嘗試，前次以暫存 repo 探測的設計已 abandon（`2026-10-18-manage-gitignore-block`）。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Low | `GitignoreBlockResult`（status／warnings／suggestedLines）。 |
| lib | High | `gitignore-block.ts` 單一 writer：固定區塊、讀寫防護、`git check-ignore` 檢查、警告與建議規則；`content-markers` 新增標記。 |
| services | Low | init 與完整 agent sync 呼叫 writer、`shippedSkillLayout`；quickstart 合併兩次結果。 |
| cli | Low | `gitignore-output.ts` 共用狀態行與 stderr 警告／建議規則，四個 formatter 沿用。 |
| tests | Medium | lib 真 git 測試、wiring／formatter／e2e、`check-agent-sync` 指紋 `.gitignore`。 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-LIB-106 | ADDED | `.gitignore` managed block ignores local artifacts and re-includes prospec skills |
| REQ-SERVICES-130 | ADDED | init and agent sync maintain the `.gitignore` block |
| REQ-CLI-063 | ADDED | Commands report `.gitignore` changes |
| REQ-SETUP-004 | MODIFIED | Create Project Structure |
| REQ-SETUP-013 | MODIFIED | First-Time Use Onboarding Flow |
| REQ-SETUP-018 | MODIFIED | Init Per-File Idempotency Guard |
| REQ-SERVICES-028 | MODIFIED | Quickstart Orchestrator Service |
| REQ-SETUP-019 | MODIFIED | prospec upgrade Command |
| REQ-TESTS-079 | MODIFIED | CI gates deployed agent artifacts on template freshness |

## Completion

- **Tasks**: code 15/15（100%）；verification 2/2、manual 1/1。
- **Acceptance Criteria**: 11/11 經獨立 grader 核對無語意偏離；acceptance revision 2（US-2.2 限專案 `.gitignore`）於 plan 簽核修訂，為 late-capture。
- **Mutation**: unit-only Stryker 387 mutants；補 8 項測試後 18 個代表性存活者以手動 mutation 確認轉紅，等價 mutants 理由記於 tasks.md T15。

## Review & Verify

- **Review**: 3 rounds，4 critical／2 major／1 minor，全數修正並以 fail-then-pass 測試釘住，critical 皆經獨立 verifier 確認：建議規則的 `prospec-*/*` 重新排除會連帶排除其他 skill 的子目錄（改為附上該 skill path 的區塊行）、在地化 git 使非 repo 判定失準（`LC_ALL=C`）、建議規則帶縮排貼上即失效（改為不縮排）、子目錄 cwd 下警告的規則來源以 repo 頂層為基準（改為相對 cwd）；major：子目錄行未排序、報告檔名未用 `DRIFT_REPORT_FILENAME`；minor：quiet 註解措辭。第 3 輪 fix-induced ratio 57.1% 因全數解決依 Findings-Based Recovery 收斂。
- **Verify**: Grade A；machine tasks／Knowledge／tests PASS，Constitution 8/8 PASS；spec-compliance 9/9 REQs 獨立符合但因 late-capture 記為 not-adjudicated；design not-applicable。
- **Tests**: Vitest 4.0.18、Node 24.20.0、macOS；正式 `pnpm test` 320/320 files，8454 PASS、4 skip／8458（負載下降後重錄）；lib writer 63 tests、e2e 貼上建議規則以 `git check-ignore` 驗證；lint、typecheck、counts、agents（含 `.gitignore` 指紋）、committed-range `knowledge:check` 通過。
- **Quality Log**: plan verifier 三輪（r1／r2 FLAWS、r3 WARN 七項經簽核併入 tasks 並在 delta-spec 措辭對齊）；breaking-change（init 會修改既有 `.gitignore`）於 plan 簽核確認；verify late-capture 限制保留。
- **Disclosure**: 本機整套測試在高負載（load average 4–8，jamf 安全擴充與其他 session）下反覆出現與本變更無關的 git 重測試 hook timeout，各檔單獨執行皆通過；依開發者規則（base 同樣失敗才提高 timeout）未調整 timeout，改在負載下降後重錄。

## Knowledge Update

lib／services／cli／types／tests 五個模組 README（lib 與 types 的 `gitignore-block.ts` 列、services wiring 與 quickstart 合併、cli helper）、counts 與 index 已在最終 review／tests／verify 前同步並以 `prospec knowledge verify` 蓋章；雙語 `docs/reference/cli-reference` 改寫受管區塊段落。

## Archive Completion

9/9 REQ bodies 已核對：3 個 ADDED REQ 由母檔移入新 slice `project-setup/us-021.md` 並補 US-021 Story 與 11 個英文驗收情境；US-011（`project-setup/us-009.md`）三處 recovery 措辭與 REQ-SETUP-018 對齊；REQ-SETUP-004／018 的宣告 drop 為刻意改寫。product map 由 CLI 同步，counters 由 finalize 調和，raw-scan 已刷新。
