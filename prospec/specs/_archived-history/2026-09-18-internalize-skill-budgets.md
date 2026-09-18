# internalize-skill-budgets — Archive Summary

- **Archived**: 2026-09-18
- **Original Created**: 2026-09-17
- **Quality Grade**: S
- **Issue**: #291

## User Story

As a 下游專案的 AI agent（讀 `index.md` 與 knowledge skill 表格者）,
I want 表格只列我所在專案能設定、`knowledge-size` 會評分的預算（shipped 的 skill／reference 預算不進表格）,
So that 我看到的門檻就是這批 skill 實際遵守的門檻，不會拿一個被違反的數字當依據。

（US-2：prospec 維護者希望 init 種子與 config-example 不再列出這兩個鍵，且下游殘留舊鍵時 `prospec check` 給出指名該鍵與行號的 WARN。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `TokenBudgetSchema` 移除 `skill_per_file`／`reference_per_file`；新增 `SHIPPED_BUDGET_FIELDS` 與 `isShippedBudgetField`；`DEFAULT.skill_per_file` 5000→12500 |
| lib | Medium | `resolveKnowledgeTokenBudget` 對 shipped 欄位永遠取 DEFAULT；`collectBudgetOverrides` 分流 shipped 鍵為 `ineffective`、`evaluateBudgetOverrides` 發 WARN（沿用 `unjustified-budget-override`） |
| templates | Medium | init 種子與 config-example 去兩鍵（種子補 `headroom`）、留一句出貨說明；`_knowledge-loading-rules.hbs` 註記區分 per-project 列與出貨 Skill 列；`drift-report-format.hbs` check 表補述 |
| tests | Medium | key-set 守衛改「schema ∪ SHIPPED ＝ DEFAULT」；resolver／collector／evaluator／seed／example／render-parity 斷言；startup-loading baseline 更新 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-061 | MODIFIED | schema 只宣告六個 per-project 欄位；shipped 兩欄由 `SHIPPED_BUDGET_FIELDS` 具名、常數 12500／2500 |
| REQ-LIB-028 | MODIFIED | resolver 只覆寫 schema 宣告欄位，shipped 欄位取常數 |
| REQ-LIB-001 | MODIFIED | `unjustified-budget-override` 另對殘留 shipped 鍵發 WARN（鍵、行號、動作為刪除） |
| REQ-TEMPLATES-149 | MODIFIED | 兩個 seed 宣告 schema 六欄，不含 shipped 鍵，附一句出貨說明 |
| REQ-KNOW-013 | MODIFIED | Loading Strategy 表格移除 Skill 列（shipped 預算非專案設定、下游不評分），註記只指向 `.prospec.yaml` |
| REQ-AGNT-035 | MODIFIED | 任一下游 config 下 loading table 皆無 Skill 列、無 shipped 預算數字 |
| REQ-TESTS-048 | MODIFIED | 鍵集合差集守衛＋shipped 鍵五類斷言 |
| REQ-LIB-044 | MODIFIED | partial 只渲染 per-project 欄位列；shipped 欄位注入但無列（PR #292 追加）|

## Completion

- **Tasks**: 15/15 code（100%）；[M] 2／[V] 2 皆完成
- **Acceptance Criteria**: 7/7（US-1 三條、US-2 四條）

## Review & Verify

- **Review**: 2 round(s)（verify 後新 loop 第 1 輪計為 round 2），0 critical / 3 major — 8 條 finding（3 major：F-1 Spec「minus headroom」措辭、F-2 seed 測試覆蓋不足、F-5 widening cast 重複；5 minor：F-3 docs、F-4 非 scalar shipped 鍵被略過、F-6 註解位置、F-7 Spec 枚舉少 headroom、F-8 README「rejects」誤述）全部 fixed，0 unresolved，fix-induced ratio 0
- **Verify**: Grade S（兩次，最終於 2026-09-18）；machine 1/5 task-completion PASS、4/5 knowledge-health PASS、5/5 test-provenance PASS；judgment 2/5 delta-spec-compliance PASS、3/5 constitution PASS（8/8 rules）、6 design not-applicable，皆 fresh-subagent；`pnpm test` 5,566 passed／4 skipped
- **Quality Log**: prospec-plan WARN（verifier 六則 advisory 全數回寫 proposal／plan）；prospec-tasks WARN（verifier 六則 advisory 全數回寫 tasks）；prospec-implement WARN（T17 偏差：knowledge-size 基線唯一差異為 types README 因 Pitfall 改寫淨增 13 tokens）；prospec-review round 1 WARN（3 major 提議）→ round 2 PASS；第一次 verify 後 grader 抓到 `counts:check` 因新增測試過期，`pnpm counts` 重跑後 Constitution 重評 PASS

## Knowledge Update

- `prospec/ai-knowledge/modules/types/README.md`、`lib/README.md`、`lib/drift-engine.md`、`templates/README.md` 已同步；`prospec knowledge verify types lib templates tests` 已戳於 feature commit `106e85b`
