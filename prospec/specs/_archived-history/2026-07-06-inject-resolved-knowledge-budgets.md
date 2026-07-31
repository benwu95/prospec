# inject-resolved-knowledge-budgets — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06
- **Quality Grade**: S

## User Story

As a 下游專案的 AI agent（讀 SKILL.md 來決定知識層級的大小），
I want 生成的文件引用 `.prospec.yaml` 的 `knowledge.token_budget` ＋ `prospec check knowledge-size`，並顯示本專案真實的數字，
So that 我永遠不必去解析一個我看不見的內部 TypeScript 符號。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `KnowledgeSizeBudget` interface 遷入此處（預算契約的歸屬地） |
| lib | High | `resolveKnowledgeTokenBudget` 遷入 `config.ts`（canonical resolver） |
| services | Medium | agent-sync 注入解析後的預算；check.service 匯入該 resolver |
| templates | Medium | 3 個 skill `.hbs` 改以 `{{...}}` 渲染預算；移除內部符號 |
| tests | Medium | contract ＋ unit 斷言（無符號洩漏 ＋ 數字來自設定），皆 mutation-verified |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-028 | ADDED | `lib/config` 中 canonical 的 `resolveKnowledgeTokenBudget` |
| REQ-AGNT-035 | ADDED | agent-sync 注入預算；模板不再帶任何內部符號 |
| REQ-TESTS-049 | ADDED | 生成 skill 的預算渲染契約 |
| REQ-TYPES-061 | MODIFIED | 單一來源同時餵給 skill 渲染；`KnowledgeSizeBudget`→types |
| REQ-SERVICES-065 | MODIFIED | resolver 改由 `lib/config` 匯入（check 行為維持不變） |
| REQ-KNOW-013 | MODIFIED | Loading-Strategy 的預算註記指向 `.prospec.yaml` |

## Completion

- **Tasks**: 11/11 code（100%）；1 個 `[M]` ＋ 2 個 `[V]` 完成
- **Acceptance Criteria**: SC-001..005 達成

## Review & Verify

- **Review**: 1 輪、0 critical / 1 major —— major（`drift-sources.test.ts` ＋ `drift-checker.test.ts` 中懸空的 `KnowledgeSizeBudget` type-only import → 潛伏的 TS2459，而 `pnpm typecheck` 因為 `tsconfig` 排除 `tests/` 而漏掉）已於同輪修正；重跑為綠。
- **Verify**: Grade S；維度 1/5–5/5 全 PASS（6/design n/a、`ui_scope: none`）；2086 個測試通過、typecheck ＋ lint 乾淨、`prospec check` 11/11。
- **Quality Log**: 一個 review major，同輪解決；無未解的 WARN/FAIL。

## Knowledge Update

受影響的模組 README 已於 feature commit（`dfdc6a2`）同步：types、lib、services、templates、tests。記下一則候選的 `/prospec-learn` 教訓：`tsconfig` 把 `tests/` 排除在 `pnpm typecheck` 之外，因此測試中 type-only import 的破損會逃過這道 gate。
