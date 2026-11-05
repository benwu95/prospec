# replace-design-station — Archive Summary

- **Archived**: 2026-11-05
- **Original Created**: 2026-11-05T05:38:45.853Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/456
- **Plan Decision**: option-a (graded_by: human)

## User Story

As a 使用 prospec 開發前端功能的開發者,
I want 在 proposal 宣告 UI 變更的設計來源、UI 變更必排視覺回歸測試，並由 verify 獨立評估實作與設計來源的符合度,
So that agent 依設計稿或元件庫實作而不是猜測，舊 design station 的設定不被支援與來源規則互相矛盾的問題一併消失。

（完整 Story：US-1 宣告設計來源並據以實作、US-2 視覺回歸測試、US-3 獨立設計符合度評分、US-4 完整移除舊 design station。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `SDD_STATIONS`／`STATION_SKILLS` 移除 `design`；移除 `DESIGN_REQUIRED`、`UI_SCOPES`、`hasDesignSpec`／`uiScope`、`StationReferenceUse.uiScopes`、`VALIDATE_KINDS` 的 `design-spec`、`prospec-design` 定義與 reference 註冊 |
| lib | Medium | status-router 移除 design 路由；skill-reference-map 只依 scale 過濾；移除 `validateDesignSpec`；bundle 重生 |
| services | Medium | status 不再收集 UI Scope／design-spec fact；validate 移除 design-spec 分支 |
| cli | Low | `validate` 說明與列舉 |
| templates | High | 刪 design skill 與 6 份 reference；proposal-format 新增 `## Design Source`；plan-format、tasks、implement、verify 改為 Design Source／視覺回歸測試／設計符合度；cascade、metadata、archive、status-lifecycle 同步 |
| tests | High | 契約、單元、整合、e2e 改為新契約並新增移除斷言；重錄 station-reference 與 startup-loading baseline、workflow-eval 情境與 policies |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-270 | ADDED | proposal 以 `## Design Source` 宣告 UI 變更（sdd-workflow US-58） |
| REQ-TEMPLATES-271 | ADDED | plan／tasks／implement 傳遞 Design Source，UI 變更必排視覺回歸測試（US-58） |
| REQ-TEMPLATES-272 | ADDED | verify 依 Design Source 評設計符合度並確認視覺測試（US-58） |
| REQ-TEMPLATES-273 | ADDED | lifecycle 兩份副本記錄沒有 status transition 的站點（US-28，取代 REQ-TEMPLATES-138） |
| REQ-CHNG-011、REQ-TEMPLATES-192／097／133／211／228／034、REQ-TESTS-028／044／058／113／124、REQ-TYPES-064／070／106、REQ-LIB-035／087、REQ-SERVICES-070／111、REQ-CLI-031 | MODIFIED | sdd-workflow：移除 design 路由、UI Scope 與 `validate design-spec`，reason code 改為依值比對且僅能連同路由移除 |
| REQ-AGNT-013、REQ-SKILL-012、REQ-AGNT-033、REQ-TESTS-053／029／103／119、REQ-TYPES-035／099、REQ-TEMPLATES-147／160 | MODIFIED | agent-integration：skill 數與 design 相關敘述 |
| REQ-TESTS-024 | MODIFIED | feedback-promotion：刪除 skill 計數子句 |
| REQ-DSGN-001～009、REQ-TEMPLATES-164、REQ-TEMPLATES-138 | REMOVED | design-phase 全部退休；feature 標為 deprecated，定義保留於 Deprecated 區段 |

## Completion

- **Tasks**: 24/24 code tasks（100%）；[M]／[V] 6 項，T29（archive）於本站完成
- **Acceptance Criteria**: 13/13 凍結情境（verify 2/5 無 scenario finding）
- **實作偏離（已記錄於 tasks.md）**：private workflow-eval oracle 保留 `design-spec.md` 禁止項；`standard-ui` 改走 tasks → implement，closure ceiling 15,380 → 16,426（依據寫於 proposal Edge Cases）；verify 評分測試加在 `verify-grade.test.ts`

## Review & Verify

- **Review**: 6 round(s), 0 critical / 5 major — R1-1 verify V6 的 none 跳過條件吞掉視覺測試 WARN、R1-2 standard/full 的 tasks／implement 讀不到 Design Source、R1-4 外部設計來源未標為 untrusted、R2-1 設計工具名稱掃描大小寫敏感、R4-1 not-adjudicated 條件措辭收窄 REQ；另 8 個 minor（計數、措辭、量測宣稱、文件指引）全部修正。第 5 輪觸發 fix-induced circuit breaker（53.8%），開發者以 break-glass 授權修正 R5-1 後，第 6 輪全清；review baseline 以 fresh-subagent 記錄。
- **Verify**: Grade S — 1/5 PASS、2/5 PASS（47/47 REQ，fresh-subagent）、3/5 PASS（8/8 規則）、4/5 PASS、5/5 PASS、6 not-applicable（本 change 非 UI 變更）；`pnpm test` 349 files、9,473 passed、4 skipped，coverage Statements 96.92%／Branches 92.09%
- **Quality Log**: new-story WARN（行數誤記，已以 PASS 更正）；plan FAIL×2 → WARN×2（缺 test_command 證據路徑、coverage 基線），之後由人簽核 option-a；tasks WARN（標記與 REQ 追溯）；review WARN×6 輪（major 與 breaker）、escalation 1 次（fix_induced_threshold_exceeded，override 已消耗）

## Knowledge Update

Module documentation to check:
- `prospec/ai-knowledge/modules/types/frozen-registries.md`
- `prospec/ai-knowledge/modules/templates/README.md`、`skill-authoring.md`
- `prospec/ai-knowledge/modules/lib/README.md`、`routing-flow.md`（生成）
- `prospec/ai-knowledge/modules/services/read-only-queries.md`
- `prospec/ai-knowledge/modules/tests/contract-guards.md`

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:5 | prospec-review | 開發者於 2026-11-05 選擇「Break-glass＋修 R5-1」：五輪 0 critical，僅剩文件 minor R5-1，修正後跑最後一輪 review | consumed by prospec-review:9946648bf8e19b2af7a9e757763caacac15b52013afc137c09968685a83ee89f |
<!-- prospec:escalation-history-end -->
