# Implementation Plan: name-change-history-rows

## Overview

Change History 的 Change 欄被寫死成 `archive-sync`，因為 `appendToChangeHistory` 的簽章沒帶變更名——
不是資料不存在，唯一的呼叫端手上就有。修法是把它傳進去，並以負向斷言擋住回歸；再把 15 列既有的
`archive-sync` 回填為真實變更名，讓這一欄的追溯價值不是只從今天之後才開始。

回填的歸屬不靠記憶或猜測：每列的日期硬過濾 `_archived-history` 檔名，再要求該摘要的 Requirements
表涵蓋該列全部 REQ。實測 15/15 唯一解、零歧義；先前只按 REQ 重疊數排序時 `project-setup.md:664`
會誤配到 2026-07-25 的變更（那是當初引入這些 REQ 的變更，也提到它們），日期才是判別依據。

### 設計決定

1. **不新增資料來源**：變更名在 `syncToFeatureSpecs` 的呼叫脈絡裡已經是參數，只是沒往下傳；不從
   metadata 再讀一次，也不從路徑反推。
2. **負向斷言比正向重要**：正向斷言只證明「今天寫對了」，負向 `not.toContain('archive-sync')` 才擋得住
   有人日後又把常數塞回去——這正是本次缺陷的形狀。
3. **回填以腳本推導、以人確認、以腳本重驗**：推導與驗證用同一條規則但分兩次執行（改前產生對應表、
   改後重新推導並與檔案內容比對），避免「用寫入結果驗證寫入」的空轉。
4. **不動列序與其他欄位**：回填只改第 2 欄，日期／Impact／REQ Refs 逐位元不變，diff 可逐列人眼核對。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| services | archive ＋ spec-sync 的機械寫入 | `syncToFeatureSpecs` → `appendToChangeHistory` | types, lib |
| tests | archive.service 契約 | `pnpm test` | 全部原始模組 |

### Existing Patterns (from _conventions.md)

- 服務層 `execute(options)`；檔案寫入一律 `atomicWrite()`
- spec sync 永不清空既有 REQ body；只有 `**Spec:**` 區塊取代它
- 契約斷言 section-scoped ＋ 負向 ＋ mutation-verified（PB-001）

### Architecture Constraints (from Constitution)

- 相依方向 `cli → services → lib → types`
- TDD：先讓「列含變更名」的斷言在改前變紅
- 變更工件繁中；信任區（feature spec）與 commit message 英文

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | Low | `appendToChangeHistory` 增一個參數並寫入 Change 欄；呼叫端傳入變更名 |
| tests | Low | 既有斷言由 `\| archive-sync \|` 改為變更名，新增負向斷言 |
| docs（信任區，非模組） | Medium | 7 份 feature spec 共 15 列回填為真實變更名 |

## Call Chain

```
prospec archive <name>
  → archive.service.execute({ changeName, … })            [orchestration]
  → syncToFeatureSpecs(changeName, routes, …)              [mechanical spec write]
  → appendToChangeHistory(content, routes, today, changeName)   [row: | date | changeName | impact | refs |]
  → atomicWrite(featureSpecPath, content)                  [I/O]
```

## Implementation Steps

1. **RED — 斷言列含變更名**
   - `tests/unit/services/archive.service.test.ts`：把既有 `| archive-sync |` 斷言改成期待變更名，並加負向斷言
2. **GREEN — 把變更名傳下去**
   - `appendToChangeHistory` 增 `changeName` 參數，列改為 `| ${today} | ${changeName} | …`；呼叫端 `:398` 傳入
3. **回填對應表（改前）**
   - 以「日期硬過濾 ＋ Requirements 表涵蓋該列全部 REQ」推導 15 列歸屬，輸出對應表供人眼確認
4. **執行回填**
   - 逐列只改第 2 欄；不動日期／Impact／REQ Refs／列序
5. **驗證**
   - 腳本重新推導並與檔案比對（15/15）、`grep` 確認 `archive-sync` 零命中；`pnpm test` / `typecheck` / `lint`、`prospec check` 14/14、mutation-verify

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 回填把某列歸給錯誤的變更 | High | 兩階段驗證（改前推導／改後重驗）＋ 唯一解要求（日期相符且 REQ 全涵蓋），任何非唯一解就保留 `archive-sync` 並說明 |
| 批次改寫誤傷其他欄位或列序 | Medium | 只替換第 2 欄的 `archive-sync` 字面，diff 逐列人眼核對，其餘欄位逐位元不變 |
| 正向斷言過關但常數日後被塞回 | Medium | 負向斷言 ＋ mutation（移除變更名傳遞）確認轉紅 |
| 回填屬信任區寫入，可能與 REQ 畢業時序衝突 | Low | 只動 Change History 的既有列，不觸碰任何 REQ body，畢業時序不受影響 |
