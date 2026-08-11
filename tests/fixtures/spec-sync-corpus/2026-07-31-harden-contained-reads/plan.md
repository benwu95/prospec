# Implementation Plan: harden-contained-reads

## Overview

同一條 realpath-contained read 不變式有兩份實作，只有 `drift-sources.readContainedFile` 包了讀取失敗的
try/catch；`knowledge-reader.readTextIfExists` 沒有，於是一個指向樹內目錄的 README symlink 會讓
EISDIR 逃出 collector、中止整個 `prospec check`。修正是把「存在但讀不到＝缺席」補上，並讓兩份實作收斂
為 leaf 模組匯出的單一 helper——分岔本身就是這個缺陷的成因（PB-006）。

策略上刻意不動 containment 的安全語意：樹外 symlink 仍在讀取前被拒。改的只有「已通過 containment
但讀取失敗」這一格，從 throw 變成 null，與既有那份實作的文字理由一致。

### 設計決定

1. **helper 住在 `knowledge-reader`（leaf 方向）**：`drift-sources` 已經 import 它（README 明載
   「drift-sources imports FROM it, never the reverse」），反向會造 lib→lib 迴圈。
2. **保留兩種根語意**：`knowledge-reader` 以知識樹為根，`drift-sources` 以 cwd 為根——helper 收
   `(filePath, root)`，根由呼叫端決定，不把兩種語意硬併成一種。
3. **不放寬安全性**：containment 仍先於讀取；本變更只把讀取階段的例外轉成缺席，不改變任何
   「樹外→不吐內容」的判定。
4. **`invalid→loud` 不受影響**：schema 無效由 `parseYaml`／zod 在 helper 之外拋出，REQ-MCP-006
   的 loud 分支原樣保留。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| lib | realpath-contained 讀取層 ＋ drift collectors | `readModuleReadme`/`readIndex`/`loadModuleMap`；`readContainedFile` | types |
| tests | contained-read 回歸與委派斷言 | `pnpm test` | 全部原始模組 |

### Existing Patterns (from _conventions.md)

- 讀取一律 realpath-contained；`knowledge-reader` 是內容讀取層，`drift-sources` 為其消費者（單向）
- collector 遇不可得回 `{available:false, reason}`，絕不拋錯殺掉整場 check
- 早期 return 減少嵌套；`type` import 用於純型別

### Architecture Constraints (from Constitution)

- 相依方向 `cli → services → lib → types`；lib→lib 只允許 `drift-sources → knowledge-reader`
- TDD：先讓回歸測試以 EISDIR 變紅
- 變更工件繁中；信任區與 commit message 英文

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | Medium | `knowledge-reader.ts` 匯出單一 contained-read helper（讀取失敗→null）；`drift-sources.ts` 的 `readContainedFile` 改為薄適配器，移除自帶的第二份 containment/try-catch |
| tests | Medium | 三個回歸場景（contained 目錄 symlink、樹外 symlink、可讀檔案不變）＋ 委派後既有 drift-sources 測試須保持全綠 |

## Call Chain

```
prospec check
  → check.service.execute(options)                       [orchestration]
  → collectKnowledgeSize / collectGitTimestamps / …      [I/O collectors]
  → readModuleReadme(knowledgePath, name)                [lib/knowledge-reader]
  → readContainedText(filePath, root)                    [單一 helper：existsSync → realpath → containment → try readFileSync catch null]
  → measure(...)                                          [null → 該筆缺席，collector 繼續]
```

## Implementation Steps

1. **RED — 以 EISDIR 讓測試變紅**
   - `tests/unit/lib/drift-sources.test.ts`：`modules/lib/README.md` → 指向 `ai-knowledge/_shared/`（目錄）的 symlink，斷言 `collectKnowledgeSize` 不拋錯且該模組無 l2 item
2. **GREEN — helper 補上讀取失敗處理**
   - `knowledge-reader.ts`：`readTextIfExists` 的 `readFileSync` 包 try/catch 回 null，註解沿用既有理由；匯出為 `readContainedText`
3. **收斂第二份實作**
   - `drift-sources.ts`：`readContainedFile(cwd, relPath)` 改為 resolve 後委派 helper；移除自帶 try/catch 與重複 containment（`existsContained` 若無其他呼叫端則一併移除）
4. **補足其餘場景測試**
   - 樹外 symlink 仍回 null；可讀檔案內容不變；`loadModuleMap` 對讀不到者 graceful、對 schema 無效者仍 loud
5. **驗證**
   - `pnpm test` / `typecheck` / `lint`、`prospec check` 14/14、`pnpm counts:check`、mutation-verify（移除 try/catch → 轉紅；移除委派→重複實作則以 grep 斷言把關）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 委派改變 `readContainedFile` 對既有呼叫端的語意（讀 abs vs realpath） | Medium | 兩者內容等價；既有 drift-sources 測試（L1 conventions、escaped-defect、artifact-language）全跑確認 |
| 把讀取例外一律轉成缺席，掩蓋真正該吵的錯誤 | Medium | 只在 containment 通過後的讀取階段轉換；`invalid→loud` 由 parser 保留；delta-spec 明文記錄這條界線 |
| `existsContained` 仍有其他呼叫端而誤刪 | Low | 先 grep 全部呼叫端再決定移除或保留 |
| Windows 無權限撤銷語意，fixture 不可建 | Low | 權限類場景以 `process.platform` 閘控並就地說明（既有慣例） |
