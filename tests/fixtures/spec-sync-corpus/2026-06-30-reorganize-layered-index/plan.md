# Plan: Reorganize Layered Index

## Overview

本變更重整了 `CLAUDE.md`、`AGENTS.md` 與 `_index.md` 的分層索引結構，明確界定 L0 到 L3 的劃分與載入時機。這能指導 AI 助理（如 Antigravity）在各階段精準載入合適的脈絡。

為了提升系統的自動化維護度，我們將 Project Info、How to Use、Loading Rules 與 Conventions 整體納入 `prospec:auto` 區塊中，並利用 `src/lib/knowledge-reader.ts` 動態掃描規範檔案（以 `_` 開頭且以 `.md` 結尾的檔案），從中動態解析描述資訊並渲染於 `_index.md`，從而使新增規範與專案升級能夠無縫自動同步。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | Handlebars templates library | Rendered templates | None |
| lib | Foundational utilities | `listConventions`, `formatConventionsList`, `mergeManagedDoc` | types |
| services | Business logic orchestrators | `init.execute()`, `agentSync.execute()`, `knowledgeUpdate.execute()` | types, lib |
| tests | Vitest test suite | Test execution | all |

### Existing Patterns (from _conventions.md)
- `execute()` service pattern: Services implement `execute(options)` returning a typed Result.
- Template rendering: Renders HBS templates under `src/templates/` via `renderTemplate()`.
- Atomic writes: Writes files via temp-then-rename using `atomicWrite()`.
- Content merging: Uses `mergeContent()` or `mergeManagedDoc()` to preserve user edits.

### Architecture Constraints (from Constitution)
- One-way dependency: `cli → services → lib → types` (no upward or circular imports).
- Language Policy: AI-generated documents are written in Traditional Chinese (Taiwan). Code stays in English.

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | Modify `agent-configs/entry.md.hbs`, `knowledge/index.md.hbs`, `init/index.md.hbs`, and skills templates (adding dynamic conventions loading). |
| lib | Medium | Implement dynamic conventions scanning (`listConventions`, `formatConventionsList`) in `src/lib/knowledge-reader.ts`. |
| services | High | Update `init`, `agent-sync`, `knowledge`, `knowledge-update` services to query conventions and render them into auto-blocks. |
| tests | Medium | Update test assertions and loading baselines to match the new formats. |

## Call Chain

1. **prospec init** (Initial setup writing `_index.md` & `AGENTS.md`)
   → `cli/commands/init.ts`
   → `services/init.execute(options)`
   → pre-compute canonical `conventions_list`
   → `renderTemplate('init/index.md.hbs', ctx)` & `renderTemplate('init/agents.md.hbs', ctx)`
   → `mergeManagedDoc()` (for AGENTS.md)
   → `atomicWrite()`

2. **prospec agent sync** (Syncing skills and `CLAUDE.md`/`AGENTS.md`)
   → `cli/commands/agent-sync.ts`
   → `services/agent-sync.execute(options)`
   → `generateEntryConfig()`
   → `renderTemplate('agent-configs/entry.md.hbs', ctx)` (contains L0-L3 description)
   → `mergeManagedDoc()` (replaces only auto-block of CLAUDE.md/AGENTS.md)
   → `atomicWrite()`

3. **prospec knowledge generate** (Generating/rebuilding knowledge base READMEs & `_index.md`)
   → `cli/commands/knowledge.ts`
   → `services/knowledge.execute(options)`
   → `updateIndex()`
   → `listConventions(knowledgePath)`
   → `formatConventionsList(conventions)`
   → `renderTemplate('knowledge/index.md.hbs', ctx)` (with `conventions_list`)
   → `mergeContent()` (merges auto section)
   → `atomicWrite()`

4. **prospec knowledge update** (Incremental update of `_index.md`)
   → `cli/commands/knowledge-update.ts`
   → `services/knowledge-update.execute(options)`
   → `updateIndex()`
   → `listConventions(knowledgePath)`
   → `formatConventionsList(conventions)`
   → Reconstruct full `autoBlock` with Modules, Project Info, How to Use, Conventions, Loading Rules
   → `replaceAutoBlock()` (replaces only auto-block of _index.md)
   → `atomicWrite()`

## Implementation Steps

1. **實作 Conventions 動態掃描工具 (lib)**
   - 在 `src/lib/knowledge-reader.ts` 中新增 `listConventions` 函數，使用 `fs.readdirSync` 讀取 `ai-knowledge/` 下所有 `_*.md` (排除 `_index.md`)。
   - 實作第一個 blockquote `>` 描述字串提取邏輯，並對無 blockquote 或檔案空白的情形設定回退預設值 `custom convention file`。
   - 實作 `formatConventionsList(conventions)` 函數，將檔案清單格式化為 `- `_file.md` — description` 的 markdown 字串。

2. **調整範本檔案 (templates)**
   - 修改 `src/templates/agent-configs/entry.md.hbs`，移除舊的 `Core Resources`，新增 `Layered Index (分層索引)` 區塊描述 L0 至 L3 與加載時機。
   - 修改 `src/templates/knowledge/index.md.hbs`，將所有靜態章節移入 `prospec:auto` 區塊，將 Conventions 的靜態清單替換為 `{{conventions_list}}`，並更新 Loading Rules。
   - 修改 `src/templates/init/index.md.hbs`，調整結構使與 `knowledge/index.md.hbs` 對齊。
   - 修改 `src/templates/skills/*.hbs`（主要有 `Startup Loading` 與 Progressive Loading 描述的檔案），加入動態檢索與載入 Conventions 清單中相關檔案的說明。

3. **整合至 Services 邏輯 (services)**
   - 修改 `src/services/init.service.ts`：計算包含 canonical 規範檔案在內的初始 `conventions_list` 字串並寫入範本渲染內容。
   - 修改 `src/services/knowledge.service.ts`：在呼叫 `updateIndex` 前調用 `listConventions` 與 `formatConventionsList`，並傳入 `conventions_list` 到範本變數。
   - 修改 `src/services/knowledge-update.service.ts`：在 `updateIndex` 中調用 `listConventions`，並重構其手寫 `autoBlock` 的字串結構，納入 `Modules`, `Project Info`, `How to Use`, `Conventions`, `Loading Rules` 等章節。

4. **修復與更新測試 (tests & verification)**
   - 更新 `tests/contract/knowledge-format.test.ts` 中對於 `_index.md` 自動化區塊結構與內容的斷言。
   - 更新 `tests/contract/skill-format.test.ts` 以驗證 Skills `Startup Loading` 的變更。
   - 重新產生或更新 `tests/fixtures/startup-loading-baseline.json`，對齊新規則。
   - 執行 `pnpm test` 並修正測試失敗，確認整體功能及覆蓋率。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 增量更新 `_index.md` 時覆寫了使用者在 `prospec:auto` 以外自訂的段落 | Medium | 嚴格確保 `knowledge-update.service.ts` 使用 `replaceAutoBlock` 只針對 `prospec:auto` 區塊進行局部替換，且對 `existingContent` 無 `prospec:auto` 區塊的罕見情況使用 `mergeContent` 以免覆寫。 |
| 自訂規範檔案無 blockquote 描述或格式不合導致掃描崩潰 | Low | 撰寫嚴謹的 try-catch 防禦性程式碼，在解析異常或找不到引用內容時回退至預設說明 `custom convention file`。 |
| 修改 `Startup Loading` 導致與 `startup-loading-baseline.json` 不符，使測試失敗 | Low | 在完成範本修改後，重新產生或更新基準基準 json 檔案以對齊新規則。 |
| L3 通用描述可能被未來維護者重新加入專案特有副檔名 | Low | 在修改 HBS 範本時以清晰的英文註解或設計說明保留此中立性設計意圖。 |
