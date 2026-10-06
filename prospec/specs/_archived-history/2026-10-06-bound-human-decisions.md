# bound-human-decisions — Archive Summary

- **Archived**: 2026-10-06
- **Original Created**: 2026-10-05
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/334
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

維護者在 plan 驗證後、產生 tasks 前，對 standard 與 full 變更做一次方向確認：暫停由 `PROSPEC_PAUSE_AT` → 已驗證 `ai-proposed` Premise 預設 → `workflow.pause_at` 決定；standard 以 `--signoff plan` 簽核被審核的 plan 版本（不需 candidates），full 仍簽 candidate option，兩者都綁定 plan.md＋delta-spec.md 版本。
人工決策點共用一份呈現契約（反轉成本、推薦依據、最強替代方案的成立條件）；`workflow.always_escalate`（re-scope、break-glass-override、breaking-change）讓概括授權不能代替這些決策，已具體指定的修改則不重問。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Medium | `always_escalate` 設定與錯誤、`PLAN_SIGNOFF_OPTIONS`、兩個 plan-digest 標記、`planChangedSinceVerifier` 事實 |
| lib | High | 暫停優先順序、`resolveAlwaysEscalate`、`readWorkflowFallback`、plan 版本 digest 與簽核新鮮度、router 涵蓋 standard |
| services | High | status 逐 change 解析暫停與版本、change-log verifier stamp 與 standard 簽核、archive 依 scale 判讀簽核 |
| cli | Low | `--signoff plan`、HALT 文字與 help |
| templates | High | `_human-decision` partial 與 `human-decision` reference、plan／ff／new-story／cascade／candidate-evaluation／metadata-format／config-example／lifecycle |
| tests | High | 暫停矩陣、版本綁定、standard e2e、contract 單一定義與 mutation pins |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-113 | ADDED | Escalation category configuration contract |
| REQ-LIB-102 | ADDED | Escalation category resolver |
| REQ-TEMPLATES-247 | ADDED | Shared human-decision presentation contract and reference |
| REQ-TEMPLATES-248 | ADDED | Bounded general delegation and specific authorization |
| REQ-TYPES-022 | MODIFIED | quality_log Metadata Field |
| REQ-TYPES-105 | MODIFIED | Opt-in pause configuration contract |
| REQ-TYPES-106 | MODIFIED | Human-halt routing codes and pause facts |
| REQ-LIB-086 | MODIFIED | Pure pause-station resolver |
| REQ-LIB-087 | MODIFIED | Router opt-in plan sign-off branch |
| REQ-LIB-088 | MODIFIED | Single plan-verifier provenance rule and sign-off freshness |
| REQ-SERVICES-116 | MODIFIED | status service resolves the pause and fails closed |
| REQ-SERVICES-117 | MODIFIED | change log records a plan sign-off |
| REQ-SERVICES-119 | MODIFIED | archive summary names the plan decision |
| REQ-TEMPLATES-236 | MODIFIED | Autonomous selection without a pause and the opt-in HALT |
| REQ-TESTS-124 | MODIFIED | Coverage for the plan sign-off pause |

## Completion

- **Tasks**: code 24/24（100%）；verification 2/2；合計 26/26。
- **Acceptance Criteria**: 獨立 grader 比對 revision 2 的 16 個場景，未見語意偏離；15/15 REQ 有證據。revision 2 是 implement 後依維護者決定把第三類改名為 `breaking-change` 的 amendment（late-capture），不能宣稱是實作前凍結。
- **Knowledge**: types、lib、services、templates、tests 的 README 已更新並 stamp，cli 只 stamp；feature commit 後 `knowledge:check` 確認 6 個模組同步。
- **Spec 收斂**：4 個 ADDED REQ 移入新 slice `us-50.md` 並登錄於 hub `## Slices`；US-44 標題、As-a／I want、情境與 Independent Test 改為涵蓋 standard；us-7 的 ff 情境同步。

## Review & Verify

- **Review**: 兩個 loop 共 7 輪，0 critical；第一個 loop 5 輪（3 平行 lens＋4 輪 full-lens re-review），累計 9 major／19 minor 全部 fixed；verify 後 Knowledge 同步的窄範圍 loop 2 輪，3 minor 全部 fixed。代表性修正：SEC-1 無 digest 的簽核不能繞過已 stamp 的版本綁定；DOC-1 刪除「相同 report 會被 replay」的錯誤宣稱；MNT-1 plan 版本改由單一 `capturePlanVersion` 擁有；R2-1／R3-1 以刪除提示收斂措辭連鎖。fix-induced ratio 最高 35.7%。
- **Verify**: Grade A。機器 1/5、4/5、5/5 PASS；3/5 PASS（8 條規則）；2/5 第一次 WARN（REQ-TESTS-124 缺 service 層 quick／backfill 案例），補測試後 grader 判 15/15 PASS，因 late-capture 記為 not-adjudicated；design not-applicable。全套 7,477 tests 通過。
- **Quality Log**: plan verifier R1／R2 WARN（處理方式記於 plan Risk Assessment）；tasks verifier R1 FLAWS（漏覆蓋 REQ-TYPES-105）→ R2 WARN；new-story INVEST WARN（Small／Independent）；review 各輪 WARN 皆為已處理的 major／minor；verify 2 WARN（late-capture、第一次的 REQ-TESTS-124）。
