# add-plan-signoff-pause — Archive Summary

- **Archived**: 2026-09-25
- **Original Created**: 2026-09-24
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/279
- **Plan Decision**: hybrid (graded_by: human)

## User Story

讓 `scale: full` 變更可 opt-in 在 plan 後停頓，等人類在最便宜的介入點（設計文件）簽核架構方向；`PROSPEC_PAUSE_AT` 單次覆寫讓雲端／排程 agent 保持全自動；以 `prospec validate candidates` 的機械指標加 in-session 單向 rationale 取代與 generator 同源的 Tournament Judge，並把人類簽核（或 in-session 選定）記錄進 archive 摘要。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | `workflow.pause_at` 與 `PAUSE_*` 常數、`PauseAtInvalid`、`HUMAN_HALT_CODES`／兩個新路由碼、candidate／decision payload、`signoff_option`／`audited_option` stamp |
| lib | High | `resolvePauseAt`／`readPauseAtFallback`（fail closed）、router 停頓分支、plan provenance helpers、`checkCandidateSet` 與候選指標、`plan-candidates.ts` |
| services | High | status 解析停頓並揭露假定原因、`change log --signoff`、`validate candidates`、archive Plan Decision 行 |
| cli | Medium | `--signoff` 互斥、AWAITING HALT 輸出、候選指標表、help 範例 |
| templates | High | plan／ff／cascade／candidate-evaluation 的兩條選定路徑與 NEVER 規則、archive-format、metadata-format、lifecycle 雙份 |
| tests | High | unit／contract／integration／e2e 與各輪 regression pins、`tests/setup-env.ts` |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-105 | ADDED | Opt-in pause configuration contract |
| REQ-TYPES-106 | ADDED | Human-halt routing codes and pause facts |
| REQ-TYPES-107 | ADDED | Candidate and decision payload contracts |
| REQ-LIB-086 | ADDED | Pure pause-station resolver |
| REQ-LIB-087 | ADDED | Router opt-in plan sign-off branch |
| REQ-LIB-088 | ADDED | Single plan-verifier provenance rule and sign-off freshness |
| REQ-LIB-089 | ADDED | Candidate mechanical metrics |
| REQ-SERVICES-116 | ADDED | status service resolves the pause and fails closed |
| REQ-SERVICES-117 | ADDED | change log records a plan sign-off |
| REQ-SERVICES-118 | ADDED | validate candidates reads the change's candidate set |
| REQ-SERVICES-119 | ADDED | archive summary names the plan decision |
| REQ-CLI-056 | ADDED | CLI surfaces for the plan sign-off pause |
| REQ-TEMPLATES-236 | ADDED | Autonomous selection without a pause and the opt-in HALT |
| REQ-TEMPLATES-237 | ADDED | Archive summary format carries the plan decision |
| REQ-TESTS-124 | ADDED | Coverage for the plan sign-off pause |
| REQ-TEMPLATES-059／184／185／195／193／228／199／224／200／201 | MODIFIED | 錦標賽改為機械指標＋in-session 選定、停頓 HALT 與人類簽核路徑 |
| REQ-SERVICES-092／104／085 | MODIFIED | null-next 為人類停點、簽核不遮蔽 WARN、Plan Decision 行 |
| REQ-CLI-039／031／053／025 | MODIFIED | 停頓 HALT 輸出、`candidates` kind、第三個 verdict 來源 |
| REQ-LIB-035、REQ-TYPES-022／091 | MODIFIED | 停頓分支例外、`signoff_option`／`audited_option` 欄位 |

## Completion

- **Tasks**: 29/29 code（100%）；[M]／[V] 皆已勾選。
- **Acceptance Criteria**: 5 個 story、14 個凍結情境皆無偏離；35/35 REQ 裁決 PASS。
- **Design**: UI scope 為 none，design consistency 為 not-applicable。

## Review & Verify

- **Review**: 6 個 loop、累積 13 rounds，fresh-subagent reviewer（首輪 Mode A 三路平行）；0 critical、15 major、25 minor，40 列全部 fixed，無 open finding。主要修正：無關欄位錯誤或無法解析的 `.prospec.yaml` 靜默停用停頓（改 fail closed 並揭露原因）、decision 與候選集缺交叉檢查、簽核未綁定 verifier 所稽核的推薦（`audited_option`，Break-Glass 不可繞過）、補救訊息把略過停頓遞給自主 agent（NEVER 規則＋人類限定措辭）、Windows 無法傳空值（`none`）、錦標賽殘留用語與 Knowledge 誇大敘述。
- **Verify**: Grade S；machine ledger：tasks／Knowledge／tests PASS；judgment ledger：35/35 REQ PASS、14 情境無偏差、Constitution 8/8 PASS（fresh subagent）；design not-applicable。先前兩次 A 分別因既存 Knowledge 時間戳與 REQ-TESTS-124 解析矩陣不全，補正後重評為 S。
- **Tests**: 246 files、6198 passed、4 skipped；lint、typecheck、counts:check、agents:check 通過；feature commit 後 knowledge:check 確認六模組同步。
- **Quality Log**: plan verifier FLAWS×4 後 WARN（皆為 trust-zone REQ 連帶，第 3 次 FLAWS 觸發 ESCALATE_TO_HUMAN，使用者選擇修正重驗）；tasks verifier WARN。Review 過程有 3 筆 round-close 記錄沒有對應 merge（merge 被拒後仍關閉該輪；findings 其後已補 merge），另有 1 筆 `log_mismatch`（majors 自報值錯誤），皆保留未覆寫。本變更自身的 hybrid 決定（使用者 2026-09-24 拍板）於 2026-09-25 依使用者指示重錄 round-5 verifier（`audited_option: hybrid`）後以 `--signoff hybrid` 補錄。

## Knowledge Update

六模組 README（types、lib、services、cli、templates、tests）與四個 sub-module（station-engines、frozen-registries、read-only-queries、skill-authoring）已同步並 `knowledge verify`；未引用未畢業 REQ id。Knowledge review 修正兩處誇大敘述（NEVER 規則涵蓋範圍、Plan Decision 來源）。

## Limitations

- 本變更自身的 `candidates/option-*.json` 的 call_chain 未帶 `src/` 前綴（早於新模板），指標表 unknown_references 偏多，其 `direction_violations: 0` 不具判別力。
- 模組 README 早已超過 l2 token 預算，本變更略增，knowledge-size 仍為 WARN。
- trust zone 非 REQ 本體的過時敘述（us-39 驗收情境、US-10／REQ-AGNT-012 的 ff 流程）依 plan WARN 需於畢業時對齊。
