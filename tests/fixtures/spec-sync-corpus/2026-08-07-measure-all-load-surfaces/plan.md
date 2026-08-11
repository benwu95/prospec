# Implementation Plan: measure-all-load-surfaces

## Overview

`knowledge-size` 目前只認得兩個 kind（`l1`／`l2`），每個 kind 的門檻由 `evaluateKnowledgeSize` 內的 if/else 直接比對。要納入四個新載入面，逐 kind 加分支會讓評估器變成六段 if/else，且「哪個 kind 用哪個門檻、超標時該做什麼」散落在程式碼裡，無法在單一處被檢查。

策略：把 kind → 門檻鍵／層級標籤／收斂指引抽成 `types/config.ts` 的 `KNOWLEDGE_SIZE_RULES` 登記表，以 `satisfies Record<KnowledgeSizeKind, KnowledgeSizeRule>` 強制窮盡；`evaluateKnowledgeSize` 退化成單一迴圈的登記表查找。蒐集端在 `collectKnowledgeSize` 內新增三個列舉器（spec／demand-knowledge／authoring-mode skill），全部走既有的 contained reader 與 `estimateTokens`，函式簽章不變。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | 門檻常數與 frozen registry | `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`, `KnowledgeSizeBudget` | zod only |
| lib | drift 蒐集器（全 I/O）＋純評估器 | `collectKnowledgeSize`, `evaluateKnowledgeSize`, `resolveKnowledgeTokenBudget` | types |
| services | check 編排，注入蒐集器 | `check.service.execute` | lib, types |
| templates | init 種子與 config 範例的預算鍵 | `init/prospec.yaml.hbs`, `references/config-example.yaml.hbs` | — |

### Existing Patterns (from _conventions.md / module knowledge)

- 蒐集器擁有全部 I/O，評估器為純函式；來源不可用 → `{available:false, reason}` → `skipped`，絕不偽造 PASS
- contained read 一律走 `knowledge-reader`（`readContainedFile`／`readIndex`／`readModuleReadme`）；drift-sources 單向 import 它
- 列舉式讀取用 `readTextOrSkip`：一個讀不到的項目只損失它自己那一行
- findings 以 codepoint 排序；`≤` 邊界不回報

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`：登記表落在 `types`，I/O 落在 `lib`
- TDD：每個新列舉器與登記表查找先有 RED 測試
- Factual Count Integrity：新增測試後必跑 `pnpm counts`；本變更不新增 check id，故 root README 的 check 列舉不動

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | High | `KnowledgeSizeKind` 由 lib 遷入並擴充為 6 值；新增四個門檻欄位與 `KNOWLEDGE_SIZE_RULES` |
| lib | High | `collectKnowledgeSize` 新增三個列舉器；`evaluateKnowledgeSize` 改登記表驅動；`resolveKnowledgeTokenBudget` 解析四個新鍵 |
| tests | High | 評估器逐 kind、蒐集器逐列舉器、authoring-mode 開關的差集斷言 |
| templates | Medium | `prospec.yaml.hbs`／`config-example.yaml.hbs` 補四個鍵 |
| services | Low | 無邏輯改動（預算已由 `resolveKnowledgeTokenBudget` 單一來源供給） |
| cli | Low | 無改動，僅回歸確認 formatter 輸出 |

## Call Chain

```
prospec check
  → check.service.execute(options)
  → collectKnowledgeSize(cwd, baseDir, knowledgePath, budget)     [lib — ALL I/O，簽章不變]
      → readIndex / readContainedFile / readModuleReadme          [既有 L1/L2]
      → collectSpecItems(cwd, baseDir)                            [新：specs/product.md + specs/features/**.md]
      → collectDemandKnowledgeItems(cwd, knowledgeRel)            [新：DEMAND_KNOWLEDGE_FILES 登記表]
      → collectAuthoredSkillItems(cwd)                            [新：authoring mode 才執行]
          → AGENT_CONFIGS 的相異 skillPath → 逐 skill 取最大一份
      → estimateTokens / countLines                               [token-accounting，唯一計量單位]
  → runChecks(inputs) → evaluateKnowledgeSize(src)                 [pure]
      → KNOWLEDGE_SIZE_RULES[item.kind] → {tokenKey, lineKey?, label, remedy}
  → formatCheckReport(report)                                      [cli — 不變]
```

## Implementation Steps

1. **types：kind 遷移與登記表**
   - `KnowledgeSizeKind` 從 `lib/drift-sources` 移入 `types/config.ts`（與已遷入的 `KnowledgeSizeBudget` 同處），擴充為 `'l1' | 'l2' | 'spec' | 'demand-knowledge' | 'skill' | 'reference'`
   - `TokenBudgetSchema` 與 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 新增 `spec_per_file: 5000`／`demand_knowledge_per_file: 10000`／`skill_per_file: 5000`／`reference_per_file: 2500`（全 optional，既有 `.prospec.yaml` 仍通過驗證）
   - 新增 `KNOWLEDGE_SIZE_RULES`，以 `satisfies Record<KnowledgeSizeKind, KnowledgeSizeRule>` 綁定每個 kind 的門檻鍵、層級標籤與收斂指引

2. **lib：預算解析與評估器**
   - `resolveKnowledgeTokenBudget` 逐鍵覆寫新增的四個門檻
   - `evaluateKnowledgeSize` 改為單一迴圈：查登記表 → 比 token 門檻 → 有 `lineKey` 才比行數；detail 附上該 kind 的收斂指引

3. **lib：蒐集面擴大**
   - `collectSpecItems`：`{baseDir}/specs/product.md` ＋ `{baseDir}/specs/features/` 遞迴的所有 `.md`（子目錄同預算，避免後續 slice 抽取把知識移出量測視線）
   - `collectDemandKnowledgeItems`：`DEMAND_KNOWLEDGE_FILES` = `_lessons-ledger.md`／`_playbook.md`／`_module-readme-conventions.md`
   - `collectAuthoredSkillItems`：`src/templates/skills/` 存在才執行；掃 `AGENT_CONFIGS` 的相異 `skillPath`，同名 skill／同名 reference 只留 token 數最大的一份，路徑排序後嚴格大於才替換（確保決定論）

4. **templates 與知識同步**
   - `init/prospec.yaml.hbs`、`references/config-example.yaml.hbs` 補四個鍵與註解
   - `prospec/index.md` 的 Progressive Knowledge Loading Strategy 表補上新的量測面與門檻
   - 兩份根 README 同步（`knowledge-size` 的量測面是使用者可見面）

5. **測試**
   - 評估器：逐 kind 的 over／boundary／override；`skill`／`reference` 無 `lineKey` 故不產生行數 finding
   - 蒐集器（real temp dir，fast-glob/git 不見 memfs）：spec 遞迴、demand-knowledge 三檔、authoring mode 開關的 findings 差集恰為 skill／reference 兩類、跨 skillPath 取最大
   - 單一來源測試：`prospec/index.md` 宣告的 shipped default 數字 == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`（既有斷言擴充到六個鍵）

6. **收尾**
   - `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts` → `pnpm counts:check`
   - 跑 `prospec check` 記錄改動前後的 finding 差異，作為 SC-001／SC-005 的證據

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `knowledge-size` finding 由 2 則增為約 13 則，被誤讀為回歸 | Medium | 全數 WARN 級不擋 build，check 判定本來就已是 warn（基線 `_status-lifecycle.md`／`tests/README.md`）；proposal Notes 與 archive summary 明寫這是刻意訊號，收斂手段是後續的 `slice-feature-specs` |
| 門檻值缺乏客觀依據 | Medium | 每個值在 REQ 內寫明推導（spec／skill = 5×L2 shipped default；reference = skill 的一半；demand-knowledge 取 issue #119 手動壓縮觸發點 ~17.7k 的六成） |
| authoring-mode 偵測綁死 `src/templates/skills/` 路徑 | Low | 常數集中一處並附註推導；偵測不到時只是少兩類項目，不影響其餘判定 |
| 跨 agent 路徑重複計數造成噪音 | Medium | 依 skill 名／reference 檔名去重取最大；測試以「同一 skill 最多一則 finding」斷言 |
| `KnowledgeSizeKind` 遷移破壞既有 import | Low | 僅 `drift-checker` 與測試消費；`pnpm typecheck` 涵蓋 `tests/` 會當場失敗 |
