# Change Specification

## ADDED

無

## MODIFIED

### REQ-KNOW-018: Knowledge Index 支援按 Category 分組渲染

**Feature:** ai-knowledge
**Story:** US-1

**Before:**
分組渲染原本透過 `knowledge-generate/update` 由 skill 手動生成。當渲染收攏進 CLI 的 `buildIndexTable` 時，並未移植分組邏輯，導致功能失效，但相關 skill 指令及部分測試並未移除。

**After:**
將分組渲染邏輯移至 `buildIndexTable`。
- `IndexRowModule` 需包含 `category`。
- `buildIndexTable` 當所有模組皆有 category 且相異 primary category ≥ 2 時，產出帶有 `### {Category}` 的分組表格（依 module-map 順序）。
- 否則產出單一平表。
- 移除 skill 模板 (`prospec-knowledge-generate.hbs`, `prospec-knowledge-update.hbs`, `_index-auto-block.hbs`) 裡過時的 AI 生成指引。

**Reason:**
修復回歸錯誤 (regression)，讓分組渲染功能在 CLI 生成時代能夠如預期運作，並消弭 codebase 裡的矛盾指令。

## REMOVED

無
