# Review: preserve-agent-config-edits

**Rounds:** 1 / cap 3   **Status:** review-clean
**Engine:** Mode A — 4 parallel lenses (correctness / security / spec-architecture / maintainability) + independent per-critical verification

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/knowledge-update.service.ts:284-291 | major | maintainability / DRY | proposed → verify WARN（範圍外，不自動修） |
| src/services/knowledge.service.ts:209-214,257-262 | major | maintainability / DRY | proposed → verify WARN（範圍外，不自動修） |

## Findings 詳述

### 0 critical
四個 lens（correctness/security/spec-architecture/maintainability）皆未提出 critical；驗證階段無待確認 critical。重點檢查結論：
- `mergeManagedDoc` 的 `AUTO_BLOCK_RE`/`USER_BLOCK_RE` 為非全域正則，`.test()` 後 `.replace()` 無 `lastIndex` 殘留問題；非貪婪 `[\s\S]*?` 對 user 區塊內 marker-like 字串不誤判（已有專測）。
- function replacer 確保 `$&`/`` $` ``/`$$` 逐字插入（generated 與遷移內容皆然）。
- 依賴方向 `cli → services → lib → types` 未違反（merge 為純 lib，services 呼叫）。
- init trust-zone 維持 skip-if-exists、byte 不變；`mergeContent` 未被修改（knowledge 流程語意保留）。
- entry.md.hbs 加 marker 後仍 < 100 行、無 @import（REQ-AGNT-003 不退化）。

### major #1 — auto-block 正則重複（DRY）
`mergeManagedDoc`（`content-merger.ts`）以 marker 常數推導 `AUTO_BLOCK_RE` 做就地取代；`knowledge-update.service.ts:284-291` 另有一份硬寫字面正則做同一操作。兩處定義並存，常數變更無法同步字面版。**處置**：屬範圍外既有檔（knowledge-update 非本變更行為範圍）；依 surgical-change 原則不在本變更重構。可收斂作法：由 `content-merger` export `AUTO_BLOCK_RE` 或 `replaceAutoBlock()`，knowledge-update 改用之 → 列為後續 `/prospec-learn` 候選。

### major #2 — `readFileIfExists` 未被既有三處 inline read-or-empty 採用
新 `fs-utils.readFileIfExists`（ENOENT→''、其餘上拋）較安全，但 `knowledge.service.ts:209-214/257-262` 與 `knowledge-update.service.ts:277-282` 仍用 bare `catch {}`（吞掉所有錯誤含 EACCES）。**處置**：同屬範圍外既有檔；本變更只在 agent-sync/init 採用新 helper。遷移既有三處可統一慣例 → 後續候選。

## Loop / Test 狀態
- 未套用任何 fix（0 critical）→ working tree 未變動，全測試維持 1781 綠。
