# remove-self-reported-signals — Archive Summary

- **Archived**: 2026-09-28
- **Original Created**: 2026-09-27T17:44:46.102Z
- **Quality Grade**: A
- **Issue**: #303
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

As a 執行 review／verify／new-story 站的 agent 與專案維護者,
I want 移除兩條「agent 自報、CLI 累加、無人消費」的訊號——review／verify 的 token spend 自報軸（`review merge --spend/--budget`、`maxSpend` 跳閘、`verify record --spend`、`dimensions[].spend`）與 escaped-defect 登記（`change story --introduced-by`、`introduced_by`、`check --escaped-defects`），舊資料靠 `.loose()` schema 與 attr-map 解析寬容讀取,
So that 不再維護沒有 ground truth、沒有決策掛靠的資料，文件宣稱與可觀察行為一致（PB-003）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | 刪 `escaped-defect.ts`、`EscapedDefectReportInvalid`；`cascade.ts` 去 `maxSpend`／`spend_budget_exceeded`／`cumulativeSpend`；`change.ts` 去 `introduced_by` 與 `dimensions[].spend`；`station.ts` 去 `spend` |
| lib | High | 刪 `escaped-defects.ts`；`drift-sources.ts` 刪 `collectQualityLedger`／`readGateResults`；`DIGEST_EXCLUDED_REPORTS`、`DELEGATION_REPORT_FILES` 縮為 `prospec-report.json`；breaker 與 review.md metrics 去 spend |
| services | Medium | `review-merge`、`verify-record`、`change-story`、`check` 四個 service 去 spend／introduced_by／escaped-defects 路徑 |
| cli | Medium | 四個命令刪 option；`check-output` 刪 escaped-defects formatter；`review-merge-output` 刪 spend 行 |
| templates | Medium | review／verify skill、circuit-breaker（重新編號為五節）、review-format、metadata-format、drift-report-format、delegated-evidence-format、status-lifecycle 不再描述 spend 軸與逃逸率；startup-loading 基線重測 |
| tests | High | 刪 `escaped-defects.test.ts`；五旗標 unknown-option e2e、真實 archive metadata fixture（`tests/fixtures/legacy-metadata/`）、舊 metrics 屬性 fixture、section-scoped contract 負向斷言，皆經 mutation 驗證 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-067 | REMOVED | EscapedDefectReport schema |
| REQ-LIB-034 | REMOVED | Quality-ledger collector + pure aggregator |
| REQ-SERVICES-069 | REMOVED | check.service --escaped-defects aggregation mode |
| REQ-TYPES-058 | REMOVED | ChangeMetadata introduced_by escaped-defect registration field |
| REQ-SERVICES-094 | MODIFIED | auto-draft 互斥清單去 `--escaped-defects` |
| REQ-CLI-022 | MODIFIED | `prospec check --record-tests` 單一 non-check 模式；`--escaped-defects` 為 unknown option |
| REQ-TESTS-056 | MODIFIED | 引擎測試清單去逃逸率聚合器與 quality-ledger collector |
| REQ-TYPES-022 | MODIFIED | `dimensions[]` 去 `spend`；舊鍵 loose 讀取 |
| REQ-TYPES-066 | MODIFIED | canonical order 鄰接改以 `delta_spec_provenance` 描述 |
| REQ-TYPES-080 | MODIFIED | `issue` 順序參照改 `delta_spec_provenance`，不再對照 `introduced_by` |
| REQ-LIB-088 | MODIFIED | 移除 escaped-defect gate-results 讀取情境 |
| REQ-LIB-090 | MODIFIED | content facet 只與 `prospec-report.json` 併雜湊 |
| REQ-TEMPLATES-238 | MODIFIED | delegation-protocol 舉例只剩 `prospec-report.json` |
| REQ-TEMPLATES-157 | MODIFIED | drift-report-format 去逃逸率姊妹報表；metadata-format 去 `spend` |
| REQ-TYPES-089 | MODIFIED | breaker config 無 `maxSpend`；trigger enum 無 `spend_budget_exceeded` |
| REQ-LIB-063 | MODIFIED | breaker 軸：round cap／oscillation／fix-induced ratio／persistent test failure |
| REQ-TEMPLATES-066 | MODIFIED | review skill 跳閘條件只剩 fix-induced ratio |
| REQ-TEMPLATES-067 | MODIFIED | review-format 不再標 dual-axis |
| REQ-TEMPLATES-203 | MODIFIED | circuit-breaker reference 不提 spend budget 與旗標 |
| REQ-TESTS-099 | MODIFIED | 測試釘 ratio／oscillation 跳閘、舊屬性寬容、旗標拒收 |
| REQ-CLI-028 | MODIFIED | review merge 不追蹤 spend |
| REQ-SERVICES-098 | MODIFIED | review-merge service 無 spend 記帳與選項 |
| REQ-CLI-043 | MODIFIED | `--spend`／`--budget` 成 unknown option；formatter 不印 spend |
| REQ-SERVICES-086 | MODIFIED | metrics-only 建檔情境去 spend |
| REQ-TESTS-120 | MODIFIED | 拒收路徑斷言去 spend |
| REQ-CLI-038 | MODIFIED | verify record 無 `--spend`；file form 的 `spend` 不落盤 |

## Completion

- **Tasks**: 24/24 code（100%）；`[M]` 2/2；`[V]` 2/2
- **Acceptance Criteria**: 14 個凍結情境（revision 1）13 個吻合；US-4.1 的 grep 字面被 cli-reference 雙語刻意加入的「Removed flags (breaking)」段與既有 `measure:tokens --budget` 條目命中（意圖達成、字面不符，verify 記 WARN）；26/26 REQ coverage

## Review & Verify

- **Review**: 3 round(s), 0 critical / 8 major — round 1 四個持票 fresh lens 提 7 major（types README 錯誤子類計數、service docstring 殘留 dual-axis、review skill 誤把 early-stop 歸給 CLI、lib README 檔數分帳、三個測試鑑別性缺口）全修；round 2 fresh 全 lens 確認 7 個 fixed、新增 1 major（修補新增測試造成計數漂移）→ `pnpm counts`；round 3 fresh 確認乾淨，1 minor（legacy fixture 目錄需 `git add`）；baseline `graded_by: fresh-subagent`
- **Verify**: Grade A, 1/5 PASS · 2/5 WARN（US-4.1 字面）· 3/5 WARN（INVEST：US-4 Independent 偏弱）· 4/5 PASS · 5/5 PASS · 6 not-applicable（in-session 判定，S 因此封頂）；`pnpm test` 259 檔、6585 passed、4 skipped，exit 0
- **Quality Log**: ff WARN（INVEST advisory US-4）；plan verifier WARN（漏列 review-format.hbs／module-map.yaml、delta-spec 替換殘渣、US-3.3 unknown-key 語意、provenance digest 下游影響，皆回寫）；tasks verifier WARN（review-merge-output 測試未點名、行號錯位、delegated-evidence-format 裸字 spend、兩個 verify record e2e，皆回寫）；prospec-delegation WARN ×2（一個 lens payload 帶空 `repro` 被 schema 拒收後重派；verify grader 因 harness 429 重派）；review R1／R2 WARN、R3 PASS；verify PASS A（2 WARN）
- **Limitations**: `knowledge-size` 為既有 advisory WARN；feature commit 後六模組 `last_verified` 需重戳（戳記進 archive commit），review／test provenance 於戳記後重錄（內容位元組相同）；main 於分支切出後多一個 docs commit，PR 前 rebase

## Knowledge Update

六模組 README、`prospec/index.md`、`module-map.yaml` 已於 feature commit 同步（types 22 files、lib 65 files、errors 18 subclasses、計數 6589／6585）；`knowledge verify` 戳記 2026-09-28T00:40:23Z。Feature spec 於本次 archive 畢業：4 個 REMOVED 移入 Deprecated 並手動刪除 active 本文與 drift-detection US-11 段。

## Harvest

quality_log 的 WARN 與 review majors 以 keyed upsert 累積至 ledger（修補輪新增測試須重跑 counts；delegate payload 選填欄位不得為空字串；delta-spec landing-fidelity 只認 WHEN bullet；commit 後重戳 knowledge 會翻 provenance 需重錄），不自動晉升。永久證據：[review.md](./2026-09-28-remove-self-reported-signals/review.md)、[verify.md](./2026-09-28-remove-self-reported-signals/verify.md)。
