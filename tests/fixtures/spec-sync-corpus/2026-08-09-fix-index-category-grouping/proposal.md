## Background

REQ-KNOW-018 的分組索引功能在將生成宿主從 skill 轉移至 CLI（`buildIndexTable`）時，被靜默移除了分組行為，導致目前的 `prospec:auto` block 只會產生平表，而多份 skill 與測試仍矛盾地依賴著分組邏輯的存在。這是一個漏失行為的 bug，需要將分組渲染邏輯補回 `buildIndexTable`。

## User Stories

### US-1: 修復 index.md 的自動分組渲染 [P1]

身為系統維護者，
我希望 `buildIndexTable` 能根據模組的 `category` 屬性正確產出分組子表，
以便恢復 US-340 帶來的主要價值主張，並消除 skill/測試與實際行為間的矛盾。

**Acceptance Scenarios:**

- WHEN 有 2 個以上相異的 primary category 且所有模組都有 category，THEN 輸出 `### {Category}` 子表，且分類依 `module-map` 宣告順序排列。
- WHEN 小於 2 個相異 category 或有任一模組缺 category (fail-flat)，THEN 輸出單一平表。
- WHEN `IndexRowModule` 帶入 category，THEN `collectAllModules` 正確從 `module-map` 搬運該欄位。
- WHEN 將分組表格的輸入丟給 `parseIndexModules`，THEN 能夠正確跨子表解析出全部模組。

**Independent Test:**
執行包含 `buildIndexTable` 分組行為的 round-trip 測試，確保給定分組輸入能被 `parseIndexModules` 完整讀回。

## Edge Cases

- 部分模組有 category、部分沒有時：回退為單一平表（fail-flat），避免漏填造成悄悄掉出分類。
- 原有的 skill-authored 分組標題：不在 `backfillCuratedFromIndex` 中進行回填，保持不回填的先例。

## Functional Requirements

- **FR-001**: `IndexRowModule` 必須增加 `category?: string[]` 欄位。
- **FR-002**: `collectAllModules` 必須將 `module-map` 的 category 搬運至 `IndexRowModule`。
- **FR-003**: `buildIndexTable` 必須實作基於 category 的分組邏輯（依 module-map 宣告序）。
- **FR-004**: 修改 `prospec-knowledge-generate.hbs`，移除讓 AI 產生子表的指令。
- **FR-005**: 移除或修改 `prospec-knowledge-update.hbs` 中無效的分組檢查項。
- **FR-006**: 修改 `_index-auto-block.hbs` 的註腳描述。

## Success Criteria

- **SC-001**: `buildIndexTable` 在符合條件時能產出帶 `### {Category}` 的子表結構。
- **SC-002**: round-trip 測試通過，且能取代舊有的手寫 fixture。
- **SC-003**: `prospec check knowledge-size` 通過，確認增加 heading 後 `index.md` 仍在 L1 預算內。

## Related Modules

- **types**: 定義 `IndexRowModule` 及相關分類結構。
- **lib**: 實作 `buildIndexTable` 與 `collectAllModules` 核心邏輯。
- **templates**: 包含需修正矛盾指令的 hbs 檔案 (`prospec-knowledge-generate`, `prospec-knowledge-update`, `_index-auto-block`)。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified / Violations noted: 符合 INVEST 規範。

## UI Scope

**Scope:** none
