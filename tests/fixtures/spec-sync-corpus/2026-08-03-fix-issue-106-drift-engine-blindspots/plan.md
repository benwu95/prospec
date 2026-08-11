# Implementation Plan: fix-issue-106-drift-engine-blindspots

## Overview

此變更旨在修復 Issue #106 提出的 6 項 `prospec check` 漂移引擎 (drift engine) 漏洞與盲點，確保防護網能正確涵蓋這些邊角案例。主要的修補策略為修正資料蒐集層 (collectors) 與驗證層 (evaluators) 之間的條件，並補齊正則表達式的盲區，所有修改皆須保持引擎為 pure function 的特性。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Low | 無直接改動，僅受契約修改影響 |
| lib | High | 修改 `drift-sources.ts` (test provenance, gitLastCommit, computeChangeDigest) 與 `drift-checker.ts` (test provenance)，以及 `markdown-fences.ts` |
| templates | Low | 無改動 |
| tests | Medium | 修改 `skill-format.test.ts` 以驗證更廣泛的 WARN 限制改寫字眼 |

## Call Chain

1. `check.service.ts` -> `collectTestProvenance` (in `drift-sources.ts`)
2. `check.service.ts` -> `evaluateTestProvenance` (in `drift-checker.ts`)
3. `drift-sources.ts` -> `gitLastCommit` / `computeChangeDigest`
4. `markdown-fences.ts` -> `withoutFencedBlocks`

## Implementation Steps

1. **修正 `markdown-fences.ts`**
   - 放寬縮排判斷：移除 `^ {0,3}` 的嚴格限制，改為支援 List 內的 4 空格延續縮排，確保不再將合法 fence 誤判為 indented code。
   
2. **修正 `drift-sources.ts` 與 `drift-checker.ts` 中的 test provenance 邏輯**
   - 在 `collectTestProvenance`：移除 `current_digest === null` 的早退；當 digest 無法計算時，仍列舉 `.prospec/changes/`，使得 `recorded_exit_code` 能正確被收集。
   - 在 `evaluateTestProvenance`：將檢查條件修改，避免 `recorded_digest !== null` 攔截，應直接判斷 `recorded_exit_code !== 0` 且不為 null。

3. **修正 `gitLastCommit` 的折疊問題 (`drift-sources.ts`)**
   - 區分 capture failure 與無 commit。可在 `gitLastCommit` 當 `gitCapture` 發生不明確錯誤時拋出例外或以特定方式標記，以防止將 capture failure 錯誤地折疊為 fresh。

4. **補齊 `computeChangeDigest` 註解/防護 (`drift-sources.ts`)**
   - 加入 `if (head === null) return null;` 以釘死不變式，避免未來重排程式碼導致靜默開洞。

5. **擴展 `skill-format.test.ts` Regex**
   - 擴充正則表達式，不僅匹配 `≤ 2 WARN`，亦涵蓋 `at most two WARNs` 或其他同義改寫字眼，避免對改寫措辭盲視。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 破壞現有 `prospec check` 通過狀態 | High | 執行套件內測試與自我檢查 `prospec check` 來保證變更不會導致誤判。 |
| Regex 改寫涵蓋過廣 | Low | 專注於合約測試檔中具體的行數與用詞，增加邊界斷言。 |
