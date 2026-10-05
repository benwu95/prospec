# enforce-escalation-contracts — Archive Summary

- **Archived**: 2026-10-05
- **Original Created**: 2026-10-05
- **Quality Grade**: S
- **Issue**: #330
- **Plan Decision**: option-a (graded_by: in-session)

## User Story

作為使用 Prospec 的 developer，我需要 CLI 統一 escalation 決策與歷史、事件綁定的單次重試授權，以及可安全補齊的部分寫入，才能保留人的決策權並信任每次錄取結果。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | High | 結構化決策、ledger 與 CLI 契約（3 REQs） |
| lib | High | 事件歷史、因果身分與路由（4 REQs） |
| services | High | 三 sink admission、grant 與部分寫入修復（6 REQs） |
| cli | Medium | text／JSON 決策與誠實拒收（6 REQs） |
| templates | Medium | station／ff 同步 CLI policy（5 REQs） |
| tests | High | policy／service／CLI／template 反例矩陣（1 REQ） |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-110 | ADDED | 結構化 escalation 決策契約 |
| REQ-LIB-098 | ADDED | quality_log escalation reducer 與事件身分 |
| REQ-SERVICES-126 | ADDED | 三 sink admission 與單次授權 |
| REQ-TEMPLATES-244 | ADDED | station 原樣轉述 CLI 出口 |
| REQ-TESTS-130 | ADDED | escalation 四層反例覆蓋 |
| REQ-TYPES-022 | MODIFIED | quality_log Metadata Field |
| REQ-LIB-035 | MODIFIED | Pure Route Evaluator |
| REQ-SERVICES-070 | MODIFIED | Status Service (Scan + Facts + Tolerance) |
| REQ-SERVICES-098 | MODIFIED | Review Merge Service Circuit-Breaker Bookkeeping |
| REQ-CLI-043 | MODIFIED | Review Merge CLI Flags and Escalation Output |
| REQ-TEMPLATES-187 | MODIFIED | Shift-Left Task Contract & DAG Dependency Verifier in prospec-tasks and prospec-ff |
| REQ-TEMPLATES-192 | MODIFIED | Cascade Protocol, Circuit Breaker, and Project Test Runner References |
| REQ-TEMPLATES-203 | MODIFIED | Review Format Reference and Circuit Breaker Reference Updates |
| REQ-SERVICES-086 | MODIFIED | `review merge` lands evidence, and refuses before writing |
| REQ-SERVICES-087 | MODIFIED | `verify record` appends judgment evidence to `verify.md` |
| REQ-CLI-028 | MODIFIED | `prospec review merge` Merges the Cumulative Findings Table |
| REQ-TYPES-098 | MODIFIED | Typed CLI help registry with escaping disclosure |
| REQ-LIB-063 | MODIFIED | Circuit Breaker and Fix-Induced Ratio Calculation |
| REQ-CLI-029 | MODIFIED | `prospec verify record` Grades and Records the Verify Verdict |
| REQ-CLI-025 | MODIFIED | Change Lifecycle Write Commands (log / status / scale / progress) |
| REQ-SERVICES-109 | MODIFIED | change log records a planning verifier report |
| REQ-CLI-053 | MODIFIED | change log --verifier-report and status reason codes |
| REQ-CLI-055 | MODIFIED | Table-writing commands disclose escaping when it happened |
| REQ-LIB-088 | MODIFIED | Single plan-verifier provenance rule and sign-off freshness |
| REQ-TEMPLATES-228 | MODIFIED | One verdict vocabulary and one station route across skills |

## Completion

- **Tasks**: code 27/27（100%）；T28 [V] 完成；T29 [M] 為後續 archive commit／PR 交付提醒，保留歷史勾選狀態。
- **Acceptance Criteria**: 13/13 frozen proposal scenarios、25/25 REQs、8/8 Constitution rules 通過；issue AC-1～14 均有 traceability。
- **Scope**: 無 UI；不新增 #333 abandon 指令，人工停止並保留 artifacts；不涉及 release。

## Review & Verify

- **Review**: 5 個已接受的累積 round；共 8 critical／0 major，8 項均經獨立確認、regression pin 修復。R4 無新 findings，規格文字修正後的 R5 完整七 lens review 亦無 findings。
- **Findings**: 修正 partial receipt 被舊 replay 遮蔽、candidate set 枚舉不完整、legacy reset／resolution、Git 診斷資訊誤入身分、兩階段 assessment fence，以及 owned-marker evidence 保護。
- **Verify**: 首次 C 指出舊 Break-Glass 條款與文件計數不一致；修正文件後由獨立 grader 重驗為 S。task／Knowledge／tests／spec／Constitution PASS，design N/A。
- **Tests**: 274 files；7188 passed、4 skipped（7192 total）；coverage statements 96.55%、branches 91.12%、functions 98.69%、lines 97.68%。lint、typecheck、build、144 generated assets 與 counts check 通過。
- **Quality Log**: tasks 29 項高於建議 15–25、低於 30 上限（27 code，依 owner／故障邊界拆分）；R2 verifier 因 thread limit、R3 第一次 reviewer 因 workspace credits 終止，重新分派後完成；R3 round cap 由使用者具理由授權一次，R4 消耗該 grant；首次 verify C 已由後續 S 解決。無未處理 critical／major。
- **Checks**: strict 22 checks 無 FAIL；既有 knowledge-size WARN 保留。feature commit 後 knowledge:check 確認六個 source-touched modules 全部同步。

## Knowledge Update

types 3、lib 4、services 6、cli 6、templates 5、tests 1 項需求皆已反映於 module README；新 US-47 與既有 US-13／28／29／36 文字於封存時收斂。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: legacy-partial.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | max_rounds_exceeded | review:3 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 使用者授權繼續處理已有獨立確認與 regression pin 的局部缺陷 F330-R3-1，並將本次 review 上限延長至 4 輪 | consumed by prospec-review:b74ef0ac49df65409ecc02a5492eb93a77e804216678924a1e64e8cb6dee549d |
<!-- prospec:escalation-history-end -->
