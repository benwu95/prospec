## Lib

- [x] [P] 更新 `src/lib/spec-reading/spec-headings.ts` 中的 `matchReqHeading` 或 `indexSpec`，以辨識 slice 連結（例如 `## Slices` 或指向 `{feature}/{slice}.md` 的 Markdown 連結）。 ~30 lines
- [x] [P] 更新 `src/lib/spec-reading/spec-slices.ts` 中的 `selectSpecSlices`，使其能解析 slice 連結並載入 `{slice}.md` 內容。 ~50 lines
- [x] 確保 `indexSpec` 正確索引子 slice 中的 REQ，維持其原始 ID 並追蹤其所屬的 slice。 ~40 lines
- [x] 更新 `readSpecCounters`，遞迴加總主 feature spec 及其 slice 的計數。 ~30 lines

## Services

- [x] 更新 `archive.service.ts` (`syncToFeatureSpecs`)，將 delta-spec REQ 合併到其特定的 slice 檔案，而非總是合併至主檔。 ~50 lines
- [x] 新增 `loadFeatureSpecContent` 輔助函式，以解析並載入 `SpecContent` (主檔 + slices)。 ~20 lines
- [x] 更新 `determineTargetSlice`，根據 `SpecIndex` 路由 ADDED/MODIFIED/REMOVED REQs。 ~20 lines
- [x] `archive.service.test.ts`: 新增測試案例，測試封存涉及切片之 feature spec 的變更。 ~40 lines
- [x] 更新 `recountFeatureSpecCounters`，將更新後的計數寫回主檔，並確保正確加總。 ~20 lines

## CLI

- [x] 確保 `spec show` 指令能順利處理位於 slice 中的 REQ（若 `selectSpecSlices` 已將其抽象化則應已支援，但需驗證）。 ~10 lines

## Tests

- [x] [P] 撰寫 `indexSpec` 與 `selectSpecSlices` 的單元/合約測試，驗證 slice 連結解析與遞迴索引。 ~80 lines
- [x] [P] 撰寫 `readSpecCounters` 加總計數的單元測試。 ~40 lines
- [x] 撰寫 `archive.service.ts` 更新子 slice 內 REQ 的整合/單元測試。 ~100 lines
- [x] 撰寫測試以驗證 `archive.service.ts` 在畢業階段僅讀取受影響的 slices。 ~60 lines
- [x] [V] 針對 `archive.service.ts` 中的新斷言進行突變驗證 (Mutation-verify)。 ~10 lines

## Summary

- **Total Tasks:** 14
- **Parallelizable Tasks:** 4
- **Total Estimated Lines:** ~580 lines
