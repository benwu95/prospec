# write-review-round-counts — Archive Summary

- **Archived**: 2026-09-19
- **Original Created**: 2026-09-19T06:13:05.286Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/274

## User Story

作為依賴 quality trend／`learn yield`／escaped-defect 分析的維護者與執行 review 的開發者，
我要 `review merge` 在寫入當下自寫本輪 review counts（以 round 為冪等鍵）、`change log` 的 counts flag 降為 expected-value mismatch 稽核、0-row merge 自寫 artifact-language clean 句，
以便下游分析建立在 CLI 擁有的真值上，而非模型手抄的自報數。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | quality_log entry 新增 optional `round`（冪等鍵＋counts/close 判別） |
| lib | Medium | `upsertReviewRoundEntry`／`isReviewRoundCountsEntry`／`applyCleanReviewSentence`／`stripCleanReviewBlock` |
| services | High | review-merge 自寫 counts entry＋clean 句＋關輪過濾；change-log mismatch 稽核；status/escaped-defect 消費者濾 round-tagged entry |
| cli | Low | `change log` counts flag 語意改為 expected-value 稽核 |
| templates | Medium | prospec-review §Provenance／Clean-review callout 縮為指針 |
| tests | High | 四層覆蓋：round schema／upsert 冪等／clean 句冪等／mismatch 稽核／status 不變 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-022 | MODIFIED | quality_log entry 加 optional `round` |
| REQ-CLI-028 | MODIFIED | review merge 自寫本輪 counts（冪等 by round）＋clean 句 |
| REQ-CLI-025 | MODIFIED | change log counts flag 降為 mismatch 稽核；round-less close entry 驅動進輪 |
| REQ-SERVICES-098 | MODIFIED | 關輪計數只數 round-less entry；成功路徑 upsert counts entry＋clean 句 |
| REQ-TEMPLATES-130 | MODIFIED | CLI 記本輪 counts；skill §Provenance／Clean-review 縮為指針 |
| REQ-TEMPLATES-145 | MODIFIED | review counts writer 改為 review merge；change log flag 為稽核 |
| REQ-TEMPLATES-163 | MODIFIED | review merge 記該輪 counts＋clean 句；change log 稽核 |
| REQ-LIB-081 | ADDED | round-keyed quality_log upsert＋冪等 clean-review 句 |
| REQ-SERVICES-112 | ADDED | change log 稽核自報 review counts 對 CLI 真值 |
| REQ-TESTS-121 | ADDED | CLI-owned review round counts 四層覆蓋 |

## Completion

- **Tasks**: 20/20 code tasks (100%)
- **Acceptance Criteria**: AC-1～AC-6 全數達成（e2e／contract／unit 驗證）

## Review & Verify

- **Review**: 4 round(s)，1 critical / 3 major（另 3 minor）— 全數 resolved。F-1（critical，status.unresolvedWarnings 被 round-tagged counts entry 遮蔽，fresh reviewer 實測重現、我漏抓）與 F-3（同 class，escaped-defect gate 重複計數）以共享述詞 `isReviewRoundCountsEntry` 一次掃掉所有消費者；F-4（clean 句 clean→dirty 殘留）、F-6/F-7 亦修，關鍵 fix 皆 mutation-verified。fix-induced breaker 於 round 3/4 tripped（57%，累積 churn 訊號，非未解缺陷）。
- **Verify**: Grade S — machine 1/5·4/5·5/5 PASS，judgment 2/5·3/5 PASS（fresh-subagent），6 not-applicable；test suite 綠（5,769 tests）。
- **Quality Log**: new-story WARN（INVEST advisory）／plan WARN（architecture verifier，五 warning 已收斂）／tasks PASS（task verifier）／review WARN×4（loop，最終 0 unresolved）／verify PASS grade S。

## Knowledge Update

已同步：`prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`（含 `lib/station-engines.md`）、`index.md`、`module-map.yaml`。
