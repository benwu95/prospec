# Plan: enforce-knowledge-size-budget

## Overview

`prospec/index.md` 的 token budget 宣告長期無機制查核、實測全面超標，且 `knowledge.token_budget` config 是從未被程式碼讀取的 dead code（issue #63 / 稽核 F2）。本變更新增第 11 個確定性 drift check `knowledge-size`（warn 級），沿用既有 collector（I/O）+ pure evaluator + check-id 三層 exemplar（mcp-readme-counts / metadata-completeness）。

關鍵設計決策：(1) **單一來源** = 新增 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 常數，check 讀 `knowledge.token_budget` 覆蓋預設；(2) **誠實重命名** config 欄位使名實相符（`l0_max`→`l1_per_file`、`l1_per_module`→`l2_per_module`，該欄位從未被讀取，行為零風險）；(3) **L1 改 per-file 語意**——現行「≤1500 total」光 index.md 就破表、不可能守，改為「index.md 與每個 core convention 各 ≤ `l1_per_file`」才是打算守且可達成的目標（誠實邊界）；(4) L0（agent config，auto-injected）不在 check 範圍。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| types | drift-report schema + config schema | `DRIFT_CHECK_IDS`, `TokenBudgetSchema` | — |
| lib | token 計算 + drift 引擎（collectors + pure evaluators） | `estimateTokens`, `runChecks`, `drift-sources`/`drift-checker` | types |
| services | check 薄編排 | `check.service.execute` | types, lib |
| templates | init scaffold 的 `.prospec.yaml` seed | `init/prospec.yaml.hbs` | — |

### Existing Patterns (from _conventions.md)
- **Collector/Evaluator 分離**：所有 fs/git I/O 在 `drift-sources.ts`（`{available, reason?, ...}` 封套）；evaluator 純函式，`!available → skipped(reason)`、`outcome(id, findings)` 派生狀態。
- **`Record<DriftCheckId, CheckOutcome>` 窮盡護欄**：新增 check id 未在 `runChecks` dispatch 對應 evaluator 即編譯失敗。
- **findings codepoint 排序**、**skipped 永不偽 PASS**。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`：新 collector/evaluator 落在 lib，被 services 呼叫（不逆向）。
- TDD：evaluator（純函式）與 collector（temp-dir fixture）皆先寫測試。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | `DRIFT_CHECK_IDS` append `knowledge-size`；`TokenBudgetSchema` 欄位重命名 + `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 常數 |
| lib | High | `KnowledgeSizeSource` + `collectKnowledgeSize`（drift-sources）；`evaluateKnowledgeSize` + `DriftCheckInputs`/`runChecks` 佈線（drift-checker） |
| services | Low | `check.service` 注入 `collectKnowledgeSize`（傳入 config budget + baseDir/knowledgePath） |
| templates | Low | `init/prospec.yaml.hbs` seed 改用重命名後欄位 |
| tests | Medium | collector/evaluator/schema-count/single-source 測試 |
| (AI Knowledge) | — | `index.md` Progressive Loading 表校正為誠實 per-file 宣告（implement 階段，非 REQ） |

## Call Chain

```
prospec check [--json]
  → check.service.execute(options)                              [services: 薄編排]
    → collectKnowledgeSize(baseDir, knowledgePath, budget)      [lib/drift-sources: I/O — 讀 index.md + CORE_CONVENTIONS + modules/*/README.md，estimateTokens]
    → runChecks({ ...sources, knowledgeSize })                  [lib/drift-checker: 組裝]
      → evaluateKnowledgeSize(src)                              [lib/drift-checker: pure — >budget → warn finding；!available → skipped]
      → outcome('knowledge-size', findings)                     [warn if findings else pass]
  → (--json) atomicWrite(prospec-report.json)                   [services: flag-gated 副作用]
```

- 跨層資料型別 `KnowledgeSizeSource`（named type，非匿名 bag），與 `McpReadmeCountSource` 同封套。
- 唯讀路徑；副作用僅在 `--json` 時的報告寫入（沿用既有模式）。

## Implementation Steps

1. **types：drift schema + config**
   - `DRIFT_CHECK_IDS` append `'knowledge-size'`（warn-class，第 11 個；含註解說明範圍）。
   - `TokenBudgetSchema` 欄位重命名 `l0_max`→`l1_per_file`、`l1_per_module`→`l2_per_module`（`readme_max_lines` 不變）；新增 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET = { l1_per_file: 1500, l2_per_module: 400, readme_max_lines: 100 }`。

2. **lib：collector**（先寫測試）
   - `KnowledgeSizeSource` + `KnowledgeSizeItem`（`path`, `kind: l1|l2`, `tokens`, `lines?`, `budget`, `over_by`）。
   - `collectKnowledgeSize`：讀 index.md（`baseDir/index.md`）+ 每個 `CORE_CONVENTIONS`（L1）+ `modules/*/README.md`（L2），`estimateTokens` 計 token、L2 併計行數；`knowledgePath` 不存在 → `{available:false, reason}`。

3. **lib：evaluator + 佈線**（先寫測試）
   - `evaluateKnowledgeSize`：`!available → skipped`；L1 檔 tokens > `l1_per_file`、L2 README tokens > `l2_per_module` 或 lines > `readme_max_lines` → warn finding（detail 含 actual/budget/`TOKEN_ESTIMATOR_LABEL`）。
   - `DriftCheckInputs` 加 `knowledgeSize`；`runChecks` outcomes 加 `'knowledge-size': evaluateKnowledgeSize(...)`；`drift-checker.test.ts` `emptyInputs` 補欄位。

4. **services：注入**
   - `check.service.execute` 在 `runChecks({...})` 加 `knowledgeSize: collectKnowledgeSize(paths.baseDir, paths.knowledgePath, mergeBudget(config))`（`mergeBudget` = DEFAULT 覆蓋 config）。

5. **templates + AI Knowledge：誠實宣告**
   - `init/prospec.yaml.hbs` seed 改重命名欄位。
   - `prospec/index.md` 表：L1「≤1500 per file」、L2「≤400 per module（且 ≤100 行）」、L0 標為 agent-injected 且註明不受 knowledge-size enforce；數字與 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 一致。

6. **tests：schema-count + single-source**
   - `drift-report.test.ts` frozen 數 10→11、清單加 id。
   - single-source 測試：讀 repo `prospec/index.md` 抽 L1/L2 預算數，斷言 == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| config 欄位重命名破壞下游 `.prospec.yaml` | Low | 該欄位從未被任何程式碼讀取（grep 確認），Zod 預設 strip 未知鍵；行為零變化，只是舊鍵不再被 seed |
| 對現況大量 warn（~8 個）噪音 | Low | warn 級不阻擋 build/verify grade S/A（≤2 WARN 為 grade 門檻，但 knowledge-size 的多 finding 匯總為單一 check 的 1 個 warn 狀態）；這是誠實邊界的預期訊號 |
| L1「total→per-file」語意改動被誤解為降低標準 | Medium | plan/delta-spec 明載理由（total 不可達→per-file 可達且可定位）；index.md 同步校正並註明 enforced-by knowledge-size |
| 依賴方向違規 | Low | Call Chain 檢視通過：collector/evaluator 在 lib、被 services 呼叫，無逆向或跨層；符合 Constitution `cli→services→lib→types`（Phase 6 PASS） |
