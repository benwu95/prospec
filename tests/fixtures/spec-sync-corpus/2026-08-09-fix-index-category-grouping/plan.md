# Implementation Plan

## Overview

修復 `index.md` 渲染時遺失 `### {Category}` 分組功能的問題。目前的渲染由 CLI 的 `buildIndexTable` 接管，但當初轉移時只實作了平表（flat table）的邏輯。本次計畫透過修改 `IndexRowModule` 增加 `category` 屬性，並讓 `collectAllModules` 把 category 從 `module-map` 搬入。接著在 `buildIndexTable` 實作條件分組邏輯（當有 ≥2 個不同 primary category 且每個模組都有 category 時，才依宣告順序分組，否則回退為平表）。最後修訂相關模板及測試，以與新宿主行為對齊。

## Technical Summary

- **模式**: Brownfield
- **架構變動**: 擴充 `IndexRowModule` 介面，並修改 `buildIndexTable` 產生 markdown 結構。
- **模板修正**: 修正 `.hbs` 產出指示中，與 CLI 產出實際行為不符的過時敘述。
- **測試更新**: 用符合 emit 產出的真實分組輸入取代手寫的 fixture。

## Affected Modules

| Module | Expected Changes |
|--------|------------------|
| types | 擴充 `IndexRowModule` 介面，加入 `category?: string[]` 欄位。 |
| lib | `collectAllModules` 搬運 category 屬性；`buildIndexTable` 實作分組邏輯。修正 `knowledge-reader.test.ts` 中的 fixture。 |
| templates | 修改 `prospec-knowledge-generate.hbs`，移除 AI 指使分組。修改 `prospec-knowledge-update.hbs` 恆真檢查。修改 `_index-auto-block.hbs` 的註腳。 |

## Call Chain

1. **knowledge-update.service** (`updateIndex`): 呼叫 `collectAllModules` → 回傳帶有 category 的 `IndexRowModule[]`
2. **index-table** (`buildIndexTable`): 接收 `IndexRowModule[]`，判斷分組條件 → 若符合，按 category 順序生成 `### {Category}` + 子表 → 返回 markdown 字串

## Implementation Steps

1. **更新型別與取值邏輯 (types/lib)**
   - 在 `src/types/index.ts` (或定義處) 的 `IndexRowModule` 加入 `category?: string[]`。
   - 修改 `src/services/knowledge-update.service.ts` 的 `collectAllModules`，確保 `category: entry.category ?? []` 從 module-map 正確載入。

2. **實作分組邏輯 (lib)**
   - 修改 `src/lib/index-table.ts` 中的 `buildIndexTable`：
     - 檢查輸入是否「所有模組皆有 category，且 unique primary category 數量 ≥ 2」。
     - 若為真，根據 `module-map` 裡 primary category 出現的順序，將模組分組，每個分組產出 `### {Category}` 標題與對應子表。
     - 若為假 (fail-flat)，則產出原有平表。
     - 不要更動 `backfillCuratedFromIndex` 的回填邏輯（維持不回填 category）。

3. **修正測試 (tests)**
   - 在 `tests/unit/lib/knowledge-reader.test.ts` 中，將 AC3 測試用的手寫分組 fixture 替換為實際調用 `buildIndexTable` 的產出，以進行 round-trip 測試。

4. **更新模板指令 (templates)**
   - `src/templates/skills/prospec-knowledge-generate.hbs`: 刪除讓 AI 生成 `### {Category}` 分組子表的提示。
   - `src/templates/skills/prospec-knowledge-update.hbs`: 刪除或修正關於 grouped sub-tables 的恆真檢查項目。
   - `src/templates/knowledge/_index-auto-block.hbs`: 修正自動生成的註腳，描述目前的 CLI 分組條件。

## Risk Assessment

- **Risk 1**: 分組邏輯改變現有的平表行為。
  - **Impact**: 若專案未設定 category 或 category 不全，可能無預警變成平表，或錯誤分組。
  - **Mitigation**: 實作 fail-flat 邏輯，當有任何模組缺失 category，或 primary category < 2 時，維持平表，且本專案 (prospec) 因為都不帶 category，保證維持平表不受影響。
- **Risk 2**: `buildIndexTable` 產生錯位的 markdown (如缺少空行導致標題無法正確解析)。
  - **Impact**: 讀取側 `parseIndexModules` 失敗。
  - **Mitigation**: 透過 round-trip 測試保證生成的 markdown 字串可以被 parser 正確解讀。
