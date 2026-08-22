# record-judgment-gate-executor — Archive Summary

- **Archived**: 2026-08-22
- **Original Created**: 2026-08-22
- **Quality Grade**: S
- **Issue**: #203

## User Story

作為稽核品質來源的開發者與跑 SDD 判斷站的 AI agent，
我要每個 judgment 裁決記錄「誰在什麼 context、花多少成本評的」，並把 in-session 自審機械封頂於 S 以下，
以便 PASS 可歸屬、`/prospec-learn` 能算 per-executor 假綠率與 detection-per-cost，且弱模型自審的假綠無法安靜拿最高分畢業。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `QualityDimensionSchema`/`ReviewProvenanceSchema` 增 grading-context 欄位；`JudgmentDimensionInputSchema.graded_by` 必填 |
| lib | High | `verify-grade` 新增 in-session grade cap（`isSelfVerified`/`applySelfVerifiedCap`） |
| services | High | `verify-record` 落盤前拒絕缺 graded_by、回傳 cap；`check.service` 寫 `review_provenance.graded_by` |
| cli | Medium | `verify record` run-level `--graded-by/--executor/--spend`；`check --graded-by`；`change log --dimension` 文法擴充 |
| templates | Medium | 4 判斷站模板加 model/harness-agnostic 路由指引；metadata-format reference 記三欄位 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-022 | MODIFIED | quality_log dimension 增 graded_by/executor/spend |
| REQ-TYPES-053 | MODIFIED | review_provenance 增 graded_by |
| REQ-CLI-029 | MODIFIED | verify record 缺 graded_by 拒絕 + in-session grade cap |
| REQ-CLI-038 | MODIFIED | judgment 輸入兩形式攜帶 grading context |
| REQ-CLI-012 | MODIFIED | check --record-review 記錄 graded_by |
| REQ-SERVICES-062 | MODIFIED | recordReviewProvenance 寫 graded_by |
| REQ-TEMPLATES-155 | MODIFIED | verify 自審 WARN 升級為機械 cap 敘述 |
| REQ-TEMPLATES-157 | MODIFIED | metadata-format reference 記錄三欄位 |
| REQ-TEMPLATES-199 | ADDED | 判斷站 model-tier 路由指引（agnostic 契約） |

## Completion

- **Tasks**: 17/17 code (100%)；[V] mutation-verify 提醒 1 項（review 已補上契約守衛）
- **Acceptance Criteria**: 4/4（AC-1 schema、AC-2 grade cap、AC-3 agnostic 契約、AC-4 全 gate 綠）

## Review & Verify

- **Review**: 4 round（獨立 fresh-subagent reviewer + verifier，全程 graded_by fresh-subagent），25 findings、6 critical + 17 major 全數 confirmed 並修復（0 未解）。代表缺陷：backfill scale-excluded in-session 維度繞過 cap（改以全 judgment set 計算）、verify/review 模板殘留舊 disclosure-WARN 因果、run-level 旗標與 --dimensions 互斥缺 Option.conflicts、禁詞守衛漏 claude/codex/copilot。
- **Verify**: Grade **S**（round-2），6 維全 PASS/not-applicable——machine 3 維（task-completion/knowledge/tests）engine-adjudicated PASS、judgment 3 維 fresh-subagent（executor claude-fable-5）；`pnpm test` exit 0（4144 passed）。round-1 為 A（delta-spec 兩處 routing-header WARN），修為 delta-spec 工件、程式碼零改動後 round-2 得 S。
- **Quality Log**: review 4 筆（WARN×3 → PASS）、verify 2 筆（A → S）；無未解 WARN/FAIL。verify round-1 揭露的 delta-spec routing-header 根因另立 issue #211（fix(archive): validate delta-spec routing headers）。

## Knowledge Update

已於 verify S/A feature commit 同步；archive Entry Gate 與 Phase 4 再確認：
- `prospec/ai-knowledge/modules/{types,cli,services,templates,lib}/README.md`（及相關 sub-module 檔）
