# Plan: inject-resolved-knowledge-budgets

## Overview

生成的 `SKILL.md` 與下游 `index.md` 引用內部常數 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`,下游無從解析,且模板寫死的預算數字不反映該專案 `.prospec.yaml` 覆寫值。根因:`agent-sync` 建 `templateContext` 時未注入預算值,符號名與數字皆以字面文字留在 `.hbs`。

策略:把預算值變成 `agent-sync` 注入的 `{{}}` 變數,並將 `resolveKnowledgeTokenBudget` 提升為 `lib` 的 canonical config-resolution helper(與 `resolveBasePaths` 同類),供 `check.service` 與 `agent-sync` 共用(PB-006/007:走 canonical resolver、不重抄、不製造 service→service 耦合)。模板文案改指向下游可見/可執行的 `.prospec.yaml knowledge.token_budget` 與 `prospec check knowledge-size`,移除內部符號。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | 預算契約來源 | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`、`TokenBudget`、(移入)`KnowledgeSizeBudget` | — |
| lib | config 解析 + 模板渲染 | (移入)`resolveKnowledgeTokenBudget`、`renderTemplate` | types |
| services | agent-sync / check 業務邏輯 | `agentSync`、`check.execute` | lib, types |
| templates | skill `.hbs` 資源 | `_knowledge-loading-rules.hbs`、`prospec-knowledge-generate.hbs` | — |

### Existing Patterns (from _conventions.md / playbook)
- **PB-007**:新的共享 config 消費者必先定位 canonical resolver 並走它,不得 re-derive `??` 合併。
- **PB-006**:重複邏輯抽單一來源 helper 放中立 leaf module(lib/types)並 import。
- 模板變數 `{{snake_case}}` 對齊 service context keys;變數無編譯檢查(typo → 靜默空輸出)。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`;無反向/循環。
- TDD:公開函式與行為變更皆附測試;coverage ≥ 80%。
- Language Policy:程式碼與 AI Knowledge base(含 index.md)維持 English;change 文件繁中。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | `resolveKnowledgeTokenBudget` 移入 `config.ts`;`drift-sources.ts` 改 import `KnowledgeSizeBudget` |
| types | Medium | `KnowledgeSizeBudget` 移入 `config.ts`(與預算契約同居) |
| services | Medium | `agent-sync` 注入預算至 templateContext;`check.service` 改 import resolver |
| templates | Medium | 2 個 `.hbs` 以變數渲染、移除符號、改指向 `.prospec.yaml` + `prospec check` |
| tests | Medium | 新增 no-symbol + 注入值 == resolver 斷言;既有 single-source 測試須續綠 |

## Call Chain

```
prospec agent sync
  → agentSync(options)                              [services/agent-sync]
  → readConfig(cwd) + resolveKnowledgeTokenBudget(config)   [lib/config → types]
  → templateContext{ l1_per_file, l2_per_module, readme_max_lines, … }
  → renderTemplate('skills/*.hbs', ctx)             [lib/template]
  → atomicWrite(<skillPath>/<name>/SKILL.md)        [lib/fs-utils]

prospec check                                        (行為不變,僅 resolver 位置改變)
  → check.execute(options)                          [services/check]
  → resolveKnowledgeTokenBudget(config)             [lib/config → types]
  → collectKnowledgeSize(cwd, baseDir, knowledgePath, budget) → runChecks   [lib/drift-*]
```

## Implementation Steps

1. **types:移入 `KnowledgeSizeBudget`**
   - 將 interface 從 `lib/drift-sources.ts` 移至 `types/config.ts`(緊鄰 `TokenBudget`/`DEFAULT_KNOWLEDGE_TOKEN_BUDGET`)並 export。
2. **lib:提升 resolver + 修 import**
   - `resolveKnowledgeTokenBudget(config): KnowledgeSizeBudget` 移入 `lib/config.ts`(import `DEFAULT_...`/`KnowledgeSizeBudget`/`ProspecConfig` from types)。
   - `lib/drift-sources.ts`、`lib/drift-checker.ts`(若引用)改從 `types/config` import 型別。
3. **services:改 import + 注入**
   - `check.service.ts` 刪本地 resolver 定義,改 import from `lib/config`;型別 import 同步。
   - `agent-sync.service.ts` 於現有 `lib/config` import 加入 resolver;`templateContext` 注入 `l1_per_file`/`l2_per_module`/`readme_max_lines`。
4. **templates:變數化 + 去符號**
   - `_knowledge-loading-rules.hbs`:表格數字改 `{{l1_per_file}}`/`{{l2_per_module}}`;budget 註解移除 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`,改指向 `.prospec.yaml knowledge.token_budget` + `prospec check knowledge-size`。
   - `prospec-knowledge-generate.hbs`:同上,數字改 `{{...}}`、含 `{{readme_max_lines}}`,並修「寫 index.md budget 註解」指示指向 `.prospec.yaml`。
5. **regenerate + dogfood 對齊**
   - `pnpm build` 後 `prospec agent sync` 重生 6 份 SKILL.md(`.claude` + `.agents`)。
   - 對齊 `prospec/index.md`、`README.md`、`README.zh-TW.md` 移除符號(數字表不動)。
6. **tests**
   - 新增/調整 skill-format 斷言:rendered 輸出不含符號、注入值 == `resolveKnowledgeTokenBudget`(default + override fixture),mutation-verified;確認 `config.test.ts` single-source 仍綠。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| 移動 `KnowledgeSizeBudget` 漏改 import 點 | Medium | grep 全消費者(drift-sources/drift-checker/check.service)逐一改;`pnpm typecheck` 把關 |
| 模板變數 typo → 靜默空輸出 | Medium | skill-format 測試斷言注入數字實際出現;mutation-verify |
| 遺漏平行消費者(PB-007) | Medium | 先定位 canonical `resolveKnowledgeTokenBudget`,agent-sync 走它,不 re-derive |
| dogfood index.md 改動觸發 single-source 測試 | Low | 僅改註解文案、保留 L1/L2 數字表;測試抽的是數字非符號 |
| 依賴方向違規 | Low | Call Chain 均 `services→lib→types`;無 service→service、無反向 import |

## Constitution Check (dependency/layering)
- Call Chain 全數 `cli → services → lib → types`,無跨層/反向;`agent-sync` 不 import `check.service`(resolver 已提升至 lib)。PASS。

## Knowledge Quality Gate
Brownfield;已讀 services/lib/templates README 與 playbook(PB-006/007);Technical Summary 已綜整;既有 Feature Specs(drift-detection/ai-knowledge)已核對。PASS。
