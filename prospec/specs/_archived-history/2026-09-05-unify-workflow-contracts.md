# unify-workflow-contracts — Archive Summary

- **Archived**: 2026-09-05
- **Original Created**: 2026-09-05
- **Quality Grade**: S
- **Issue**: #266

## User Story

作為在多個 in-flight change 並行的開發者、以 `prospec status` 決定下一站的 agent，以及維護 prospec 的開發者：
我要局部 gate 只依 target 自身的 facts 裁決、失敗的 re-verify 立即被導回 verify、plan/tasks verifier verdict 有可執行 schema 與正式 sink，且 scale × station × verdict × UI scope 的 transition 只有一個 executable owner；
如此他人的 change 不會逼我重做 review/tests，我也不必等到下一站碰壁才反推真正的修復動作。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `DRIFT_CHECK_SCOPES` 與 `checks[].subjects`／`subject_skips`；`WORKFLOW_REASON_CODES`／`WorkflowReason`／`BREAK_GLASS_PREFIX`；`PLANNING_VERDICTS` 與 quality_log 的 `verifier_verdict`；plan/tasks verifier report schemas |
| lib | High | 新 `change-gate.ts`（per-target 裁決）、archive gate 改吃 target 與結構化 reasons、router 新增 grade/verifier 分支與 route code、evaluator 帶出 subjects |
| services | High | status 以 provenance 讀 verifier 結果、verify record 與 archive 改 per-target、change-log 新增 verifier-report sink、agent-sync 注入詞彙、cascade 移除 transition evaluator |
| cli | Medium | `change log --verifier-report` 旗標與互斥、status 輸出 `[CODE]` 前綴 |
| templates | High | ff/plan/tasks 站點導向與 advisory INVEST、兩份 rubric 由 schema 投影、cascade-protocol 表對齊站點登記表、lifecycle 雙副本與 drift-report/metadata reference |
| tests | High | change-gate/archive-gate/router/status/change-log/verify-record 單元、scope 與路線 parity contract、真 Git 雙 change integration、CLI e2e |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-096 | ADDED | Planning verifier report contract（verdict enum、dimension 集合、strict schema、sink registry） |
| REQ-LIB-077 | ADDED | Per-change check adjudication（scope／subjects／subject_skips／前綴過濾） |
| REQ-SERVICES-109 | ADDED | change log 記錄經驗證的 planning verifier report |
| REQ-CLI-053 | ADDED | `--verifier-report` 旗標與 status reason code 前綴 |
| REQ-TEMPLATES-228 | ADDED | 單一 verdict 詞彙與單一站點路線的模板投影 |
| REQ-TESTS-113 | ADDED | Per-change gate／routing／詞彙的回歸涵蓋 |
| REQ-TYPES-022 | MODIFIED | quality_log 新增 sink-only 的 `verifier_verdict` 戳記 |
| REQ-TYPES-027 | MODIFIED | Drift report 宣告 check scope 與列舉 subjects／subject_skips |
| REQ-TYPES-070 | MODIFIED | Routing 契約新增 reason codes 與 verifier facts |
| REQ-LIB-035 | MODIFIED | Route evaluator 依最新 grade 與 verifier verdict 導向 |
| REQ-SERVICES-070 | MODIFIED | Status service 以 provenance 讀取站點 verifier 結果 |
| REQ-CLI-023 | MODIFIED | status 每行 reason 前綴穩定 code |
| REQ-LIB-071 | MODIFIED | Archive Entry Gate 以 target 裁決並回報結構化 reasons |
| REQ-SERVICES-102 | MODIFIED | `prospec archive` 逐 target 拒絕，含 proven backfill 例外 |
| REQ-TEMPLATES-131 | MODIFIED | verify Entry Gate 與機器維度改 per-target |
| REQ-CLI-025 | MODIFIED | `change log` 新增 verifier report 記錄形式 |
| REQ-SERVICES-091 | MODIFIED | Cascade service 只餘 Tastemaker 呈現，移除 transition evaluator |
| REQ-TEMPLATES-192 | MODIFIED | Cascade protocol 表對齊站點登記表並補 backfill 路線 |
| REQ-TEMPLATES-193 | MODIFIED | ff INVEST advisory、Phase 3/4 進站執行 |
| REQ-TESTS-093 | MODIFIED | Cascade 測試收斂為 Tastemaker，路線由 contract 驗證 |
| REQ-TEMPLATES-182 | MODIFIED | Plan rubric 由可執行 schema 投影並指向 sink |
| REQ-TEMPLATES-187 | MODIFIED | Tasks verifier verdict 走機器 sink |
| REQ-TEMPLATES-137 | MODIFIED | INVEST advisory 契約擴及 ff 與 cascade-protocol |

## Completion

- **Tasks**: 34/34 code tasks (100%) — 另有 1 個 `[M]` 與 1 個 `[V]` 任務皆已完成
- **Acceptance Criteria**: 5/5 User Story（proposal SC-001～SC-006 全數達成）

## Review & Verify

- **Review**: 2 round(s), 2 critical / 8 major — 兩個 critical 皆由獨立 verifier 執行 repro 確認後修復並加 fail-then-pass pin：C-1（verifier sink 的 WARN verdict 與站點 Exit Gate WARN 無法區分，合法序列被永久導回站點）、Q-1（sibling 有 finding 時 target 自身的 unavailable 不產 finding，過濾後假 pass）；32 列累積、31 列 fixed，Q-12 依設計保留（ff Receipt 列受 receipt 矩陣釘住）
- **Verify**: Grade S，machine ledger task-completion／knowledge／tests 全 PASS，judgment ledger delta-spec-compliance PASS、constitution PASS（8/8 規則）、design not-applicable；`pnpm test` exit 0（196 files／4,902 passed／4 skipped）
- **Quality Log**: 4 筆 WARN — ff（INVEST Small advisory）、plan（Architecture Verifier round 1 FLAWS 已解、round 2 advisory 已折入）、tasks（Task Verifier advisory 已折入）、review round 1（critical/major 全修）；review round 2 與 verify 均為 PASS

## Knowledge Update

已於 verify S/A commit 前同步並戳記：`types`、`lib`、`services`、`cli`、`templates`、`tests` 六個模組的 README 與 `module-map.yaml`；`prospec/ai-knowledge/_status-lifecycle.md` 與其出貨模板雙副本同步。
