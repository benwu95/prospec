# unify-req-heading-matcher — Archive Summary

- **Archived**: 2026-08-06
- **Original Created**: 2026-08-06
- **Quality Grade**: S

## User Story

三個 story 共用一個根因 —— 「feature spec 裡什麼算一個 REQ heading」在 repo 裡有三份彼此獨立的定義，而最窄的那一份（archive 只認 h4）是唯一會寫檔的：

- **US-1**：身為 REQ heading 層級偏離 h4 的 prospec 使用者，我要 archive 的 spec sync 與 counter reconciliation 用與 drift 引擎相同的判準，這樣歸檔就不會在我的信任區裡製造重複 REQ、錯誤計數與無聲的死規格文字。
- **US-2**：身為專案維護者，我要 counter reconciliation 在算出「body 有 0 條 REQ 但 frontmatter 宣稱有 N 條」時拒絕寫入並回報，這樣解析盲點會以訊號現身，而不是把錯誤數字寫進信任區。
- **US-3**：身為專案維護者，我要一道 WARN 級 check 比對每份 spec 的計數與其 body，這樣錯誤計數不能無聲留下 —— 這是 Constitution「Factual Count Integrity」第三層第一次有機器守門。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `spec-headings.ts`（REQ heading 與計數推導的單一來源，零內部 import 的葉節點）；`drift-sources` 三處改吃它並新增 `collectSpecCounters`；`drift-checker` 新增 `evaluateSpecCounters` |
| services | High | `archive.service` 三個寫入點改為層級無關並保留原標題層級；歸零拒絕；重複 id 只合併第一段並回報；新建 spec 由 body 推導計數並中性化 Story 標籤 |
| types | Medium | `DRIFT_CHECK_IDS` 附加 `spec-counters`（第 15 個凍結 id，warn-class） |
| cli | Low | `archive-output` 的 finalize 輸出新增第三條 stderr worklist（refused reconciliations，`--quiet` 可見、不設 exit code） |
| templates | Low | archive skill 模板區分 finalize 的兩類 refusal；`drift-report-format` reference 加入新 check id 與其語意 |
| tests | High | 新增 matcher／collector／evaluator／wiring 測試與單一來源 contract；boundary fixture 改為可實際執行邊界；LF／CRLF 雙跑 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-041 | ADDED | REQ heading 與計數推導的單一來源（`matchReqHeading`／`readSpecCounters`／`REQ_ID_SOURCE`） |
| REQ-LIB-042 | ADDED | `spec-counters` 的 collector ＋純 evaluator（四種誠實降級，零樣本不空過） |
| REQ-TYPES-076 | ADDED | `spec-counters` 為第 15 個凍結 check id（warn-class） |
| REQ-SERVICES-077 | ADDED | `check.service` 經正規 resolver 注入新 collector |
| REQ-SERVICES-078 | ADDED | 新建 spec 只宣稱其 body 能證實的計數（REQ 分組於 Story 標題下） |
| REQ-TESTS-074 | ADDED | matcher／新 check 測試與 mutation 契約 |
| REQ-SERVICES-072 | MODIFIED | 依 id 辨識任何層級、保留層級、邊界一般化、重複 id 只合併第一段並回報 |
| REQ-CLI-024 | MODIFIED | finalize 的歸零拒絕：stderr、`--quiet` 可見、不設 exit code、理由指名欄位 |
| REQ-SERVICES-071 | MODIFIED | 新 refusal 類別的 dry-run 一致性 |
| REQ-TESTS-060 | MODIFIED | 邊界 fixture 涵蓋 h3／h4 兩層並實際執行邊界程式碼 |
| REQ-TEMPLATES-159 | MODIFIED | archive skill 區分兩類 refusal（重跑可解 vs 需人工收斂） |
| REQ-TYPES-052 | MODIFIED | 凍結 id 總數 13 → 15（第 14 個 `artifact-language` 當初從未回填） |
| REQ-TYPES-034 | MODIFIED | 同一份 spec 的第三個總數副本 13 → 15 |
| REQ-LIB-014 | MODIFIED | 「thirteen other verdicts」→ fourteen（總數減一形式） |
| REQ-TESTS-045 | MODIFIED | skipped-never-PASS 涵蓋 15 個 check |
| REQ-TESTS-057 | MODIFIED | 該斷言改由 `DRIFT_CHECK_IDS.length` 導出，不再寫死數字 |

## Completion

- **Tasks**: 23/23 code tasks (100%)；`[M]`/`[V]` 4/4 亦完成（27/27 checkbox）
- **Acceptance Criteria**: 三個 story 的 11 條 WHEN/THEN 全部有對應測試

## Review & Verify

- **Review**: 4 round(s), 14 critical / 18 major — 14 critical 全數修復，其中 **6 個由前一輪的修復造成**（round 2 的 4 個、round 3 的 2 個）。最長的一條修復鏈是 CRLF：容忍 frontmatter → writer 寫死 `\n` 造成混合行尾 → body 掃描仍 `split('\n')` 而 `\r` 是 JS regex 的 line terminator，使本 repo 10 份真實 spec 有 5 份 story 計數錯誤且非零、恰好躲過新加的歸零守門。round 4 為 0 critical 收斂；唯一未修的 major 是既有缺陷（`withoutFencedBlocks` 同型 CRLF 盲點，issue #140），不併入本變更範圍。
- **Verify**: Grade S — machine 1/5 task-completion=PASS · 4/5 knowledge=PASS · 5/5 tests=PASS；judgment 2/5 delta-spec-compliance=PASS（fresh context，初判 WARN 指出三處 spec 散文過度宣稱，修正後重評 PASS）· 3/5 constitution=PASS（7/7 rules）· 6 not-applicable。測試 3194 passed / 4 skipped，exit 0；coverage 95.11% lines / 90.09% branch。
- **Quality Log**: 1 WARN — review round 4 帶出的 advisory major（issue #140，既有缺陷，明示不在本變更範圍）。其餘 story／plan／tasks／review 1-3／verify 皆 PASS。

## Knowledge Update

六個受影響模組的 README 皆已於 feature commit 同步（`knowledge-health` 0 stale）：
- `prospec/ai-knowledge/modules/lib/README.md`（＋ `drift-engine.md` 子模組）
- `prospec/ai-knowledge/modules/services/README.md`
- `prospec/ai-knowledge/modules/types/README.md`
- `prospec/ai-knowledge/modules/cli/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/tests/README.md`
