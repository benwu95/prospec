# reclassify-status-lifecycle-demand — Archive Summary

- **Archived**: 2026-09-02
- **Original Created**: 2026-09-02
- **Quality Grade**: S
- **Issue**: #249

## User Story

As a prospec 維護者(以及繼承出貨分類的下遊專案作者),
I want `_status-lifecycle.md` 由 demand-knowledge 預算而非 L1 預算治理,
So that 它 3024 tokens 的體積不再違反 prospec 自身出貨的 L1 default,消除下遊繼承的 spurious L1 over-budget WARN,且不放寬任何預設 budget。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `CORE_CONVENTIONS`(`conventions.ts`)移除 `_status-lifecycle.md` + doc comment 說明理由 |
| lib | None | `filterConventions`/`collectKnowledgeSize` 讀登記表,行為隨資料改變,零程式碼編輯 |
| tests | Low | `scanner.test.ts` 新增 demand 分類 pin(比照 `_playbook.md`) |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-035 | MODIFIED | `_status-lifecycle.md` 自 core 清單移除,歸 Load-on-Demand,以 `demand_knowledge_per_file` 評分;`additional_core_conventions` 仍可加回 core |

## Completion

- **Tasks**: 5/5 code tasks (100%);另 5 個 `[V]` 驗證任務完成
- **Acceptance Criteria**: 7/7(AC-1 ~ AC-7)

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean(六 lens:correctness、security、spec-architecture、parallel-site-completeness、docs-claims、test-quality,fresh-context reviewer)
- **Verify**: Grade S — machine 1/5·4/5·5/5 PASS + judgment 2/5·3/5 PASS(fresh-context)、design not-applicable;test suite 4667 passed / 4 skipped, exit 0
- **Quality Log**: prospec-plan WARN(Architecture Verifier PASS 5/5;FR-003 bundle 措辭矛盾已修)、prospec-tasks WARN(Task Verifier 3/4 PASS,sizing advisory)、prospec-review PASS、prospec-verify S

## Knowledge Update

- `prospec/index.md` Conventions auto-block 與 Progressive Loading 表已同步(`_status-lifecycle.md` → Load-on-Demand Conventions);無模組 README 描述需變更(knowledge-health PASS)
- 成效:`prospec check` knowledge-size 由 49→48 warn,`_status-lifecycle.md` 的 L1 over-budget finding 消除;無任何預設或覆寫 budget 值變動
