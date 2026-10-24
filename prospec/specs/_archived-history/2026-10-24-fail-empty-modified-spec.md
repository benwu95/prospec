# fail-empty-modified-spec — Archive Summary

- **Archived**: 2026-10-24
- **Original Created**: 2026-10-24T03:01:09.424Z
- **Quality Grade**: S
- **Issue**: #409
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 撰寫 delta-spec 的開發者（或代理），
I want `prospec check` 在 MODIFIED 條目的 `**Spec:**` 標籤存在、內容卻解析為空時直接 FAIL，且 `prospec archive`（含 `--dry-run`）以相同判定在寫入前拒收，
So that 貼上 `#### REQ-…` 標題造成的空 Spec 能在 plan／review／verify 階段被修正，而不是在 feature commit 之後才以 pendingConvergence 浮現。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | `landing-fidelity` 新增共用判定 `emptyLandingBlock`（含結束行）；drift collector 帶出 `emptySpec`，evaluator 在 mis-route 之後 FAIL |
| services | Medium | archive spec-sync 新增 `empty-spec` 拒收；`blockRefusal` 統一 truncation 與 empty-spec，涵蓋 existing-file 與 creation 兩條路徑 |
| cli | Low | `archive-output` 渲染 `empty-spec`（sanitize 後的結束行或條目已結束）與 remedy |
| templates | Low | `delta-spec-format`、`spec-graduation`、`drift-report-format` 說明空區塊拒收，並等義壓縮鄰近文字守住 startup-loading ceiling |
| tests | Medium | unit／contract／e2e 覆蓋；語料庫釘住 #106 的 5 個空 Spec 條目 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-131 | ADDED | Refuse a MODIFIED REQ whose `**Spec:**` label parses empty |
| REQ-LIB-061 | MODIFIED | Delta-Spec Landing Fidelity Check（空區塊 FAIL、mis-route 優先、共用判定） |
| REQ-SERVICES-072 | MODIFIED | preserve-and-report 收窄為「沒有 `**Spec:**` 標籤」（breaking-change，經人工核可） |
| REQ-SERVICES-081 | MODIFIED | 無內容的中斷標籤不構成 truncation；空 MODIFIED 區塊交由 REQ-SERVICES-131（breaking-change，經人工核可） |
| REQ-TEMPLATES-166 | MODIFIED | 格式參考說明空區塊被拒收而非視為缺少 Spec |
| REQ-TESTS-077 | MODIFIED | 語料庫重播只宣稱無 truncation 拒收，空區塊命中集合釘為歷史條目 |
| REQ-CLI-032 | MODIFIED | 拒收輸出涵蓋空區塊的結束行 |

## Completion

- **Tasks**: 15/15 code tasks（100%）；[M]/[V] 3/3 已完成
- **Acceptance Criteria**: 7/7（verify 2/5 逐 REQ 判定，凍結情境無語義偏離）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 0 major — review-clean。第 2 輪為 knowledge 同步後的 full-lens 再審；reviewer 回報 `boundary` 的 `.trim()` 移除為唯一存活 mutation，判為推測性未立案。
- **Verify**: Grade S（machine：task-completion／knowledge／tests PASS；judgment：delta-spec-compliance PASS、constitution PASS，皆 fresh-subagent；design not-applicable）；`pnpm test` 321 檔／8,663 passed、4 skipped，`test:coverage` statements 96.44%。
- **Quality Log**: plan verifier 第 1 輪 FAIL（REQ-TESTS-077、REQ-SERVICES-081 未列 MODIFIED，終止符列舉不完整）→ 第 2 輪 WARN（概括 bullet 未讓位給例外、drift-report-format token 上限）→ 第 3 輪 PASS；tasks verifier WARN（parity 測試、boundary null 措辭、corpus 測試標題、e2e 檔案未指名、micro-task），皆已修入 tasks.md。

## Notes

- issue AC-2 原寫「語料庫不新增 finding」，實測語料庫有 5 個同形狀的真陽性（2026-08-03-fix-issue-106-drift-engine-blindspots 的 REQ-LIB-033／036／015／024、REQ-TEMPLATES-153），改為釘住恰為這 5 個。
- REQ-TESTS-116 的 reference ceiling 沒有餘裕，以等義壓縮讓 reference 總量 −1、cumulative −1，兩個 anchor 不變。
