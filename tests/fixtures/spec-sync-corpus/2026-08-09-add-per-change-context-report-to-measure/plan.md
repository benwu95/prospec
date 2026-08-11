## Overview

這個 Story 為 `prospec measure` 指令新增了「一輪變更投影（per-change context budget report）」模式。目前系統僅透過 `knowledge-size` 檢查 L1/L2，忽略了 `SKILL.md`、references 與 feature specs 的龐大載入成本，導致變更流程的 context floor 隱形。

為了解決這個問題，我們將在 `measure` 中新增一個參數（例如 `--project-workflow <scale>`），藉由指定變更的 scale，在 `services` 層加總對應站點的 skill/references、固定的 L1、以及受影響的 L2 與 feature specs，讓開發者能清楚看見完整的 token 預算與 `quick` vs `standard` 的差異。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| cli | Thin CLI entry parsing args to service | `commands/measure.ts`, `formatters/measure-output.ts` | services, types, lib |
| services | Business logic | `measure.service.ts` | types, lib |
| types | Zod schemas, errors | `measurement.ts` | - |

### Existing Patterns (from _conventions.md)
- Dependency Direction: `cli → services → lib → types`
- Command Pattern: `registerXxxCommand(program)` in CLI
- Service Pattern: `execute(options)` returning typed Result
- Schema extension: use `.optional()` / `.default()` to avoid breaking existing configurations

### Architecture Constraints (from Constitution)
- Dependency direction: CLI depends on services, services on lib, lib on types.
- Atomic Commits by Feature: One feature per commit.

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| cli | Medium | 於 `measure` 指令新增 `--project-workflow <scale>` 參數，並在 formatter 中渲染投影報告 |
| services | High | 實作投影模式的 token 加總邏輯，依照不同 scale 計算所需的 SKILL、references、L1、L2 及 feature specs |
| types | Medium | 於 `measurement.ts` 新增 `ProjectionReportSchema` 以規範報告輸出結構 |

## Call Chain

`prospec measure --project-workflow standard`
  → `registerMeasureCommand(program)` in `cli/commands/measure.ts`
  → `MeasureService.execute({ projectWorkflow: 'standard', ... })`
  → 呼叫 `lib/token-accounting.ts` 的 `estimateTokens()` 分類計算 tokens [orchestration]
  → 回傳 `ProjectionReport` 給 CLI
  → `formatMeasureOutput(result, logLevel)` in `cli/formatters/measure-output.ts`
  → 輸出格式化報告至終端機 [side effect]

## Implementation Steps

1. **擴充 Measurement 介面 (`types/measurement.ts`)**
   - 建立 `ProjectWorkflowScale` enum/type，包含 `quick`, `standard`, `full`。
   - 新增 `ProjectionReportSchema` 以包含 `skills`, `references`, `l1`, `l2`, `specs` 的分類預算與總和 (`total`)。

2. **新增 CLI 參數 (`cli/commands/measure.ts`)**
   - 為 `measure` 指令新增 `--project-workflow <scale>` 參數，解析使用者指定的 scale。

3. **實作投影邏輯 (`services/measure.service.ts`)**
   - 若 options 包含 `projectWorkflow`，則進入投影模式分支。
   - 根據指定 scale 定義需要跑的 station skills，利用 `estimateTokens` 加總 `SKILL.md` 與對應的 references。
   - 加上固定的 L1 (`index.md`, `_conventions.md` 等)。
   - 透過 `resolveChange()` 解析當前變更，從 `metadata.yaml` 的 `related_modules` 獲取要計算的 L2 README。
   - 解析該變更的 `delta-spec.md` 提取 `Feature:`，來決定要加總哪些 feature spec。
   - 將結果組合成 `ProjectionReport` 回傳。

4. **格式化輸出 (`cli/formatters/measure-output.ts`)**
   - 在 formatter 內判斷是否為 `ProjectionReport`，如果是，則輸出對應的排版與總和。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Layering violation (CLI 內建業務邏輯) | Medium | 確保所有的 token 估算與加總邏輯都完全封裝在 `services/measure.service.ts` 中，CLI 只負責傳遞參數與純渲染 |
| 由於依賴檔案系統導致計算落差 | Low | 重用 `lib/token-accounting.ts` 的 `estimateTokens` 確保與 `knowledge-size` 的計算標準完全一致 |
