# require-green-tests — Archive Summary

- **Archived**: 2026-09-18
- **Original Created**: 2026-09-17
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/273

## User Story

**US-1（以測試證據宣告實作完成）**：身為執行 Prospec workflow 的開發者，我希望 CLI 只接受目前內容的成功測試證據，讓 `implemented` 具有可驗證的完成意義。

**US-2（審查合併要求綠燈且能辨識持續失敗）**：身為負責 review 的維護者，我希望每次合併 findings 時都有目前內容的綠燈證據，並在持續觀測到紅燈時停止自動重試，讓審查與修復投入有明確界線。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `TestEvidenceFacts`／`TestEvidenceDecision`／`TestGateOutcome` 與 `TestGateError`；`maxConsecutiveTestFailures` 預設 3 與有界 streak／breaker diagnostics |
| lib | High | 共用的 status-independent 測試政策 `evaluateChangeTestEvidence`、target-scoped `collectChangeTestEvidence`／`assessCurrentTestEvidence`、metrics-only splice 與 `persistent_test_failure` 接線 |
| services | High | `change status implemented` 與 `review merge` 兩個 gate、WARN-first 豁免與 pre-write fence |
| cli | Medium | 共用的 `tests: not-adjudicated` WARN 行、拒絕輸出與 ESCALATE_TO_HUMAN 呈現 |
| templates | Medium | implement／review 兩處 prose 各縮為一句 CLI refusal；review-format／circuit-breaker 與雙份 lifecycle 更新 |
| tests | High | unit／contract／integration／e2e 決策與寫入邊界矩陣，含真實 Git 與 CLI 端對端 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-080 | ADDED | 兩個入口共用的 fresh-test gate 政策與 target-scoped live assessment |
| REQ-TESTS-120 | ADDED | 兩個 gate 與失敗 metrics 的回歸覆蓋矩陣 |
| REQ-TEMPLATES-234 | ADDED | 雙語 CLI reference 與 lifecycle 雙份文件的 gate 說明對等 |
| REQ-SERVICES-103 | MODIFIED | `implemented` 在 code-task gate 之外新增獨立測試 gate |
| REQ-CLI-028 | MODIFIED | 每次 `review merge` 先要求 fresh green 證據，拒絕僅允許 metrics 寫入 |
| REQ-SERVICES-098 | MODIFIED | review.md 有界 distinct-attempt 計數、綠燈重設與 WARN-first 邊界 |
| REQ-SERVICES-086 | MODIFIED | 保留 payload／round 拒絕零寫入，僅測試 gate 拒絕可 splice metrics |
| REQ-TYPES-086 | MODIFIED | 獨立預設 3 的 threshold、typed error 與 breaker diagnostics |
| REQ-LIB-057 | MODIFIED | breaker 消費 CLI 推導的失敗次數並輸出 `persistent_test_failure` |
| REQ-CLI-043 | MODIFIED | 拒絕 exit 1 並呈現 remediation、WARN 與熔斷診斷 |
| REQ-LIB-033 | MODIFIED | 抽出 status-independent policy 供兩個 gate 共用，保留原 drift 輸出映射 |
| REQ-TEMPLATES-161 | MODIFIED | implement Phase 4 測試 prose 縮為一句 CLI refusal |
| REQ-TEMPLATES-163 | MODIFIED | review Loop step 3 測試 prose 縮為一句 CLI refusal |
| REQ-TEMPLATES-203 | MODIFIED | review-format 的 test metrics 與 circuit-breaker 的 persistent failure 段 |

兩條 `**Dropped:**` 宣告已於 delta-spec 明列並由 CLI 確認為 intentional：REQ-SERVICES-103 的「backfill 直接放行」與 REQ-SERVICES-086 的「任何拒絕都 byte-identical」。

## Completion

- **Tasks**: 26/26 (100%)（另有 1 項 `[V]` 驗證任務 T27，已執行）
- **Acceptance Criteria**: 6/6（issue AC-1 至 AC-6）

## Review & Verify

- **Review**: 4 round(s)，1 critical / 6 major — 全部 fixed，每條皆有 RED→GREEN 且 mutation 驗證的 regression pin。critical F-4 為 F-2 修正引入的迴歸（proven-backfill 配 stale `unavailable` attempt 由 `skipped` 退化為 `pass`），經獨立 verifier 以 OLD/NEW 對照確認後修復
- **Verify**: Grade S — 機器帳 task-completion／knowledge／tests 全 PASS；判斷帳 delta-spec-compliance PASS、constitution PASS（8/8 原則）、design not-applicable（`ui_scope: none`），皆由 fresh-context grader 評定；測試套件 5,732 passed / 4 skipped，`prospec check --strict` 21 PASS
- **Quality Log**: plan 首輪 FLAWS（WARN-first 邊界與 delta 矛盾，已於次輪修正）；tasks WARN（任務數 27 略高於理想區間）；review 三輪 WARN、末輪 PASS，其中 round 3 的 fix-induced ratio 熔斷器曾跳閘（57.1%，7 條中 4 條 origin_round > 1，實際僅 F-4 為 fix-induced），F-7 修復後新迴圈回到 0%

## Knowledge Update

六個 source-touched 模組的 README／sub-module 已於 verify S 的 commit 點同步並蓋 `last_verified`：

- `prospec/ai-knowledge/modules/{types,lib,services,cli,templates,tests}/README.md`
- `prospec/ai-knowledge/modules/lib/{drift-engine,station-engines}.md`、`modules/tests/contract-guards.md`

殘留 advisory：`tests/contract-guards.md` 因新增契約列由 1997 跨過 2000 token 的 L2 預算（壓縮後 2082），`knowledge-size` WARN；再壓需動與本變更無關的既有段落，留待 knowledge Sweep。
