# Plan：curated index 欄位收斂為 module-map 單一真相

## Overview

`knowledge-update.service.ts` 的 `updateIndex` 重建 `prospec:auto` 表格時只填 Module/Status/Description、其餘欄位固定填 `—`，就地取代整個 auto block → 清空 LLM curated 的 Keywords/Aliases/Rationale/Depends On。採方案 A：curated 欄位以 `module-map.yaml` 為單一真相，`updateIndex` 從 module-map 讀全部欄位生成表格；並在生成前做 **no-clobber 回填**（既有 index.md curated 值 → module-map 缺值處），讓既有下游專案跑一次即零遺失遷移。curated 策展面自 index.md 轉為 module-map.yaml（與使用者「兩檔皆供 LLM agent 編輯」定位一致）。

本 repo 的 module-map.yaml keywords/description 與 curated index **已分歧**、且缺 aliases/rationale——本變更一次性將 module-map 校準為 curated index 的值（單一真相持有 curated 真值），以「重生 index.md 與現況 byte-identical」為驗證。

## Technical Summary

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| types | 模組宣告 schema | `ModuleEntrySchema` | — |
| lib | index 解析/渲染工具、module-map 讀寫 | `parseIndexModules`、（新）row-builder、backfill helper | types |
| services | knowledge-update updateIndex | `updateIndex`/`collectAllModules` | types, lib |
| templates | scaffold + skill 指引 | `module-map.yaml.hbs`、knowledge-generate/update skill | — |

### Existing Patterns
- index 欄位 schema 單一來源在 `types/knowledge.ts`（`INDEX_TABLE_COLUMNS`/`INDEX_COLUMN`）——row-builder 依它索引，加欄一行改。
- no-clobber + bootstrap-once 遷移模式已見於 feature-map（`syncFeatureMap`）與 upgrade `_index.md` migration——沿用同語意。
- `parseIndexModules`（lib）依表頭 label 解析欄位——擴充涵蓋 rationale/depends_on。

### Architecture Constraints
- 依賴方向 `services → lib → types`：row-builder / backfill helper 置於 lib，updateIndex（services）呼叫；不新增反向依賴。
- 信任區：module-map.yaml 為 curated——回填 no-clobber（絕不覆寫既有值），本 repo 一次性校準另計。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Low | `ModuleEntrySchema` 加 `aliases`/`rationale`（optional） |
| lib | High | 擴充 index 表解析（rationale/depends_on）+ 共用 row-builder（全欄自 module 資料）+ no-clobber 回填 helper |
| services | High | `collectAllModules` 帶全欄位；`updateIndex` 生成前回填、表格自 module-map 全欄生成 |
| templates | Medium | `module-map.yaml.hbs` 加 aliases/rationale；knowledge-generate/update skill 指引 curated 欄改編 module-map |
| tests | Medium | 保真 + 回填 idempotent/no-clobber contract/unit（mutation-verified）；本 repo module-map 校準以 index 重生 byte-identical 佐證 |

## Call Chain

`/prospec-knowledge-update` → knowledgeUpdate.execute()  [services]
  → collectAllModules(result, moduleMapPath)      [讀 module-map，帶 name/status/description/keywords/aliases/rationale/dependsOn]
  → updateIndex(modules, opts)                     [services]
    → backfillCuratedFromIndex(existingIndex, moduleMapPath)  [lib：no-clobber、bootstrap-once、persist module-map.yaml]
    → buildIndexRow(module)                         [lib：全欄自 module 資料，依 INDEX_COLUMN]
    → replaceAutoBlock(existing, autoBlock)         [lib：就地取代，$-safe]

無跨層違規：新 helper 在 lib，services 呼叫；不反向。

## Implementation Steps

1. **schema（types）**：`ModuleEntrySchema` 加 `aliases?: string[]`、`rationale?: string`。

2. **lib row-builder**：新 `buildIndexRow(module)` 依 `INDEX_COLUMN` 由 module 資料（name/status/description/keywords/aliases/rationale/depends_on）產出列；updateIndex 表格改用它（不再填 `—`，缺值才 `—`）。

3. **lib index 解析擴充**：`parseIndexModules`（或新 `parseIndexCuratedColumns`）涵蓋 rationale + depends_on，供回填讀既有 curated。

4. **lib no-clobber 回填**：`backfillCuratedFromIndex(indexContent, moduleMap)` → 對每模組，module-map 缺（空/未定義）而 index 有值者填入；回傳是否有變更（供 persist）。bootstrap-once、idempotent。

5. **services 接線**：`collectAllModules` 帶全欄位（自 module-map entry）；`updateIndex` 生成前呼叫回填、若有變更 persist `module-map.yaml`（comment-preserving 或 stringifyYaml），再以 module-map 全欄生成表格。

6. **templates + skill 指引**：`module-map.yaml.hbs` 加 aliases/rationale；knowledge-generate/update skill 註明 curated 欄（Keywords/Aliases/Rationale/Depends On）於 module-map.yaml 策展、index.md auto block 由其生成。

7. **本 repo 資料校準**：`module-map.yaml` 各模組 keywords/description/aliases/rationale/depends_on 校準為 curated index 值；跑 updateIndex 驗證 index.md 重生 byte-identical。

8. **測試 + 驗證**：保真、回填 no-clobber/idempotent、mutation-verify；`pnpm test`/`typecheck`/`lint`/`counts:check`、`prospec check` 全綠。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 本 repo module-map 校準有誤 → index 重生變樣 | High | 以「重生 index.md 與 main byte-identical（除刻意欄位遷移）」為硬驗證；diff 檢視 |
| 回填語意錯（覆寫既有 module-map curated） | High | no-clobber：只填空/缺欄；idempotent 測試（跑兩次無二次寫入） |
| downstream keywords/description 分歧 → 遷移後採 module-map 值 | Medium | 文件/skill 指引 curated 改編 module-map；no-clobber 僅補缺欄不覆寫（下游分歧屬其 curated 資料，工具不臆測） |
| 多路徑 index 渲染分歧（generate vs update） | Medium | row-builder 收斂於 lib 單一 helper；generate 路徑（mergeContent 保留）不在本次改動，僅 update 路徑改 render-from-map |
| 依賴 #57 未合併 | Low | stack 於 #57 branch；#57 merge 後 PR retarget main |

## Knowledge Check

PASS — Brownfield；已讀 types/module-map、lib/knowledge-reader（parseIndexModules）、services/knowledge-update（updateIndex/collectAllModules）+ knowledge.service render 路徑、_index-auto-block.hbs、實際 module-map.yaml↔index.md 分歧；Technical Summary 已綜整；受影響 Feature Spec（ai-knowledge）已比對。
