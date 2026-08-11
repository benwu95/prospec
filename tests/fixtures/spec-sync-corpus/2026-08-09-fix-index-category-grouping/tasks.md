# Implementation Tasks

## 1. Domain Types (types)
- [x] `src/types/index.ts` (或其他包含 `IndexRowModule` 的檔案): 在 `IndexRowModule` 介面中加入 `category?: string[]` 屬性。

## 2. Shared Utilities (lib)
- [x] `src/services/knowledge-update.service.ts`: 修改 `collectAllModules` 函式，確保將 module-map 裡的 `entry.category ?? []` 賦值給 `IndexRowModule`。
- [x] `src/lib/index-table.ts`: 修改 `buildIndexTable` 實作條件分組邏輯（所有模組皆有 category 且相異 primary category ≥ 2 時依序產出子表，否則產出平表）。

## 3. Tests (tests)
- [x] `tests/unit/lib/knowledge-reader.test.ts`: 將現有依賴手寫分組表格的 AC3 fixture 替換為實際調用 `buildIndexTable` 的產出，以進行 round-trip 測試。
- [x] `tests/unit/lib/index-table.test.ts` (若存在): 增加 `buildIndexTable` 的單元測試，驗證 fail-flat (退回平表) 和分組渲染邏輯。

## 4. Templates (templates)
- [x] `src/templates/skills/prospec-knowledge-generate.hbs`: 刪除提示 AI 去產生 `### {Category}` 的文字。
- [x] `src/templates/skills/prospec-knowledge-update.hbs`: 刪除或修正關於 grouped sub-tables 的恆真檢查項目。
- [x] `src/templates/knowledge/_index-auto-block.hbs`: 將註腳從「請手動分組」的意涵改為描述 CLI 的分組條件。
