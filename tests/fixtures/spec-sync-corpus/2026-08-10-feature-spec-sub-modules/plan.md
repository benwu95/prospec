## Overview

本故事將實作為 feature specs 建立 sub-module（子模組）的機制。目前 feature specs（例如 `sdd-workflow.md`）會隨著每次封存的變更單向增長，導致其 token 數量容易超出 context 預算。

我們將導入一種 slice 機制，允許主要 feature spec 連結到子 slices（例如 `{feature}/{slice}.md`）。我們將更新 `lib/spec-reading` 中的 REQ 剖析器以及 `services/spec-sync` 中的封存同步邏輯，使其能無縫解析這些 slices。這將確保現有的 REQ IDs 保持不變，且在驗證與封存階段，只會載入受影響的 slice 至 context 中。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | Parsing and reading specs, drift engine | `knowledge-reader.ts`, `spec-headings.ts`, `spec-slices.ts` | types |
| services | Business logic for commands (archive, spec-sync) | `archive.service.ts` | types, lib |
| cli | CLI formatting and reading | `commands/spec-show.ts` | types, lib, services |
| types | Zod schemas, errors, contracts | `config.ts` | - |

### Existing Patterns (from _conventions.md)
- 模組 README 使用 `## Sub-Modules` 連結到子模組檔案，以避開 1800-token 的限制。我們將把此模式應用到 feature specs 上。

### Architecture Constraints (from Constitution)
- 依賴方向：cli -> services -> lib -> types
- 事實計數完整性：確保當 spec 被拆分到 slices 時，spec frontmatter 中的 `story_count` 和 `req_count` 仍保持準確。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | 更新 `spec-headings.ts` / `spec-slices.ts` 以偵測並載入 `{slice}.md` 參照。確保 `indexSpec` 能正確劃分隸屬於 slice 的 REQs 邊界。 |
| services | High | 更新 `archive.service.ts`，將 delta-specs 合併到正確的 `{slice}.md`，而非總是合併至主檔。且在 Phase 3.5 期間僅載入受影響的 slice。 |
| cli | Low | 更新 `spec show` 以無縫處理 slice 中的 REQs。 |

## Call Chain

`archive.service.ts` 執行流程 (Spec Sync)：
  → execute()
  → syncToFeatureSpecs(changeName)
  → lib: loadFeatureMap / readSpecCounters
  → lib: selectSpecSlices(reqId) [解析為 `{slice}.md` 或 main spec]
  → 將 delta-spec REQ 合併到已解析的 slice 中
  → atomicWrite() 寫入 slice

## Implementation Steps

1. **擴充 Feature Spec 解析功能 (`lib/spec-reading`)**
   - 修改 `spec-headings.ts` 與 `spec-slices.ts`，以識別指向 slice 檔案的語法（例如帶有 `./{feature}/{slice}.md` 連結的 `## Slices`）。
   - 更新 `indexSpec` 與 `selectSpecSlices`，無縫跟隨這些連結，並將 slice 中的 REQ 視為隸屬於主要 feature 的一部分進行索引。

2. **更新 `archive.service.ts` 以支援 Slice-Aware 載入與合併**
   - 調整 `syncToFeatureSpecs`，在取代 `**Spec:**` 區塊前，先將 REQ 解析到其特定的 slice 檔案。
   - 針對未指定目標 slice 的 `ADDED` REQs，預設附加到主檔或定義預設的 slice 路由。
   - 更新畢業階段讀取邏輯 (Phase 3.5)，只讀取包含受影響 REQ 的 slices。

3. **更新 Frontmatter 計數器**
   - 修改 `readSpecCounters`，加總主檔及其連結 slices 的計數，以確保 `recountFeatureSpecCounters` 維持事實準確性。

4. **新增測試 (`tests/contract`, `tests/unit`)**
   - 為被切割的 feature spec 新增 fixture。
   - 驗證 `selectSpecSlices` 只回傳目標 slice。
   - 驗證 `archive` 成功修改 slice 內的 REQ，且不會載入/損壞主檔。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 破壞既有的 `req-references` 檢查 | High | 確保 REQ ID 保持不變，且無論位在哪個 slice 都能被完整索引。 |
| 算錯 `story_count`/`req_count` | Medium | 從主檔及其 slices 遞迴加總總數。 |
| `archive --dry-run` 在 slices 中遺漏 dropped behavior | High | 確保 dry-run 剖析器也會載入正確的 slice，以評估 Before/After 狀態。 |
