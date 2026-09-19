# bound-recovery-loops — Archive Summary

- **Archived**: 2026-09-19
- **Original Created**: 2026-09-19
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/275

## User Story

As a 依賴 cascade 無人模式的維護者,
I want verify B/C/D、plan FLAWS、tasks FLAWS 三個站間恢復迴圈各自計數並在達上限 N 時改回 `ESCALATE_TO_HUMAN`,
So that 弱模型無法在同一站無限重跑，死亡螺旋由遞迴深度計數器攔下，且 `prospec status` 維持唯讀。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `WORKFLOW_REASON_CODES` 加 `ESCALATE_TO_HUMAN`；`ChangeRouteFacts` 加 streak/threshold 欄；`ProspecConfigSchema` 加 `workflow.max_station_retries`＋`DEFAULT_MAX_STATION_RETRIES`；`EscalationReportSchema.type` 加 `station_retry_limit_exceeded` |
| lib | High | `routeChange` 三分支 escalation；`resolveMaxStationRetries` 純解析 |
| services | High | `status.service` 唯讀推導三 streak 並注入門檻；enrichment 改以 `next!==null` 為準 |
| cli | Medium | status formatter 渲染 escalated route（HALT 指引），與 terminal 區分 |
| templates | Medium | `cascade-protocol.hbs` Step 5 [NEXT] HALT；兩份 `_status-lifecycle.md` 補 bound |
| tests | High | unit／contract／integration／e2e／workflow-eval 覆蓋 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-101 | ADDED | `workflow.max_station_retries` 設定＋`DEFAULT_MAX_STATION_RETRIES`(3) |
| REQ-LIB-082 | ADDED | 純 `resolveMaxStationRetries` resolver |
| REQ-TESTS-122 | ADDED | 三迴圈封頂／唯讀／預設／cascade HALT 覆蓋 |
| REQ-TYPES-070 | MODIFIED | 新 code＋streak/threshold facts；escalated 路由 `next: null` |
| REQ-TYPES-086 | MODIFIED | `EscalationReport.type` 加 `station_retry_limit_exceeded` |
| REQ-LIB-035 | MODIFIED | router 於 streak ≥ 上限時回 `ESCALATE_TO_HUMAN` |
| REQ-SERVICES-070 | MODIFIED | 唯讀推導三 streak＋解析門檻 |
| REQ-SERVICES-092 | MODIFIED | enrichment 判準改「route 有 next」 |
| REQ-CLI-023 | MODIFIED | formatter escalated 分支 |
| REQ-CLI-039 | MODIFIED | action line 判準改「route 有 next」 |
| REQ-TEMPLATES-195 | MODIFIED | Step 5 [NEXT] HALT on escalation |

## Completion

- **Tasks**: 19/19 code tasks (100%)；[M]×2、[V]×1 為提醒
- **Acceptance Criteria**: US-1..US-4 全數覆蓋

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major / 1 minor（`reverify-c` oracle JSON 未改，同意圖由 `workflow-failure-fixtures.test.ts` 確定性測試覆蓋）— fresh-subagent、review-clean
- **Verify**: Grade S；machine 1/5·4/5·5/5 PASS，judgment 2/5·3/5 PASS（fresh-subagent）、6 not-applicable；test suite 236 files／5815 passed／4 skipped
- **Quality Log**: prospec-plan WARN（架構驗證器 7 warns，已於 delta-spec/plan 全數處理）；prospec-tasks PASS；prospec-review PASS；prospec-verify S

## Knowledge Update

已同步並 stamp last_verified：`types`、`lib`、`services`、`cli`、`templates`、`tests`。
