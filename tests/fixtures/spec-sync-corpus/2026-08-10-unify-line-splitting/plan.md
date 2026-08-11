# unify-line-splitting — Implementation Plan

## Overview

`$` 錨定的 per-line regex 配 `split('\n')` 的行來源，在 CRLF checkout 下整條 pattern 不命中。issue #138 與 PR #143 各修一站，家族掃描沒做。本變更把掃描做完，並修掉實測仍活的兩處：`parseTaskLine`（CRLF 下對整份 tasks.md 回答「沒有任務」，四個消費者一致地錯）與 `expiredPlaybookEntries`（playbook TTL 需審清單恆為空）。

**關鍵設計決定：修復落在「比對端」，不落在「split 端」。** 天真解（把 `split('\n')` 換成剝 `\r` 的 `splitLines()`）會踩到既有 REQ：`change-progress.service.ts:95` 讀 tasks.md 後以 `lines.join('\n')` 回寫，剝了 `\r` 就會在勾選一個 checkbox 時把整份 CRLF 檔洗成 LF；`archive.service` 的 product.md splice 更有明文保證「每行保留自己的行尾位元組」（`sdd-workflow.md:977`）。因此採本 repo 既有的 idiom（`sdd-workflow.md:991`）：**比對一個 `\r`-stripped 的視圖，回傳的原行不變**，並把這條規則抽成單一具名 primitive，讓 `markdown-fences.ts:100` 現有的行內剝除也收斂進去。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | 無狀態共用工具；frozen task grammar 的唯一副本、ledger 引擎、markdown 文字機制 | `parseTaskLine`、`expiredPlaybookEntries`、`withoutFencedBlocks` | types |
| services | 每個指令一個 `execute()` | `status.service`、`change-progress.service`、`archive.service`、`learn.service` | types, lib |
| tests | 4 層測試套件 | `vitest run` | 全部 |

### Existing Patterns

- 行尾容忍的「比對前剝 `\r`」在 `src/` 原有 6 份剝除表達式散在 4 個檔案、共 11 個呼叫點（`markdown-fences.ts` 行內 1、`spec-headings.ts` 私有函式 1 用於 2 處、`delegated-evidence.ts` 私有函式 1 用於 5 處、`archive.service.ts` 內嵌 3）—— 本變更把它們全部收斂到單一 primitive
- 另一種手法（在 pattern 尾端補 `\r?`）**刻意不收斂**：`archive.service.ts:2648` 的 `\r?` 在擷取群組裡，用於回寫時保留 CR（收斂它會產生混合行尾檔案）；`spec-headings.ts:439-440` 是 `m` 旗標下的多行 pattern，`$` 本就匹配於 `\r` 前，該 `\r?` 冗餘但無害。這兩者是不同的工作，不在 primitive 的範圍內
- frozen grammar 單一副本：task kind 文法只住在 `lib/task-markers.ts`（lib README Pitfalls 明載），修在那裡即四個消費者全繼承

### Architecture Constraints

- 依賴方向 `cli → services → lib → types`：primitive 落在 `lib`，無上引
- TDD：CRLF 差分測試先 RED
- 位元組保真：既有 REQ 禁止改寫作者未觸碰的行尾

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | 新增 `text-lines.ts`（primitive）；`task-markers.ts`、`lessons-ledger.ts` 比對端改走它（缺陷本體）；`markdown-fences.ts`、`spec-headings.ts`、`delegated-evidence.ts` 的既有手抄本收斂（行為不變） |
| services | Low | `archive.service.ts:912/958/984` 三處內嵌手抄本改走 primitive（行為不變）；四個 tasks.md 消費者由 `parseTaskLine` 繼承修復，無需改動 |
| tests | Medium | 差分測試（unit）＋ CRLF 端到端（e2e/integration）＋ mutation 驗證 |

## Call Chain

```
prospec status
  → status.service.execute()
  → readFileIfExists(tasks.md) → split('\n')          [行來源：原行，不動]
  → parseTaskLine(line)                                [比對端：stripTrailingCr(line) 後比對]  ← 修這裡
  → routeChange(facts)                                 [純評估器]

prospec learn upsert --lesson f.json
  → learn.service.execute()
  → expiredPlaybookEntries(playbookContent, today)
  → split('\n') → /^###\s+(.+)$/                       [比對端：stripTrailingCr(line) 後比對]  ← 修這裡
```

## Line-Source 裁決（`src/` 全部 45 處 `split('\n')`）

比對端修復 —— 收斂後共 13 個呼叫點指向 1 份實作（既有 11 ＋ 缺陷本體 2；缺陷本體收斂前一份剝除都沒有，那正是缺陷），皆非 split 站點：`task-markers.ts:26`、`lessons-ledger.ts:269` 是缺陷本體；`markdown-fences.ts:102`、`spec-headings.ts:179/219`、`delegated-evidence.ts:64/65/184/204/214`、`archive.service.ts:912/958/984` 是既有手抄本收斂（行為不變）。

| 類別 | 判準 | 站點 | 處置 |
|---|---|---|---|
| C. 回寫／輸出重組（12） | split → 修改 → `join('\n')` 落盤或成為輸出，故行來源必須餵原行；`delegated-evidence:183` 是其中唯一刻意在該 split 後剝除並把視圖存進 block body 的（見 REQ-LIB-051 的例外），其餘剝 `\r` 就會改寫作者未觸碰的行尾 | `change-progress.service:95`、`content-merger:38`、`markdown-table:128`、`template:63`、`delegated-evidence:183`、`error-output:46`、`archive.service:983/1465/1488/1845/2115/2250` | 不動 |
| D. 不需自己的剝除（27） | 比對前 `.trim()`／pattern 尾端 `\s*$`／非 `$` 錨定／由呼叫端的 probe 或比對端修復繼承（`archive.service:910/950` 屬後者） | `constitution-parser:41`、`language-policy:134`、`manifest-parsers:151/194/392`、`knowledge-reader:230`、`lessons-ledger:84`、`review-merge:97`、`artifact-validators:35`、`change-story.service:162`、`drift-sources:422/454/668/1039/1108`、`status.service:77`、`knowledge-update.service:98`、`validate.service:199`、`archive.service:910/950/1149/1514/1543/1569/1955/2041/2089` | 不動 |
| E. 不做內容比對（5） | 只算行號、雜湊、排序，或僅供比對的取樣（`drift-sources:1996` 的 prose 取樣不落盤） | `drift-sources:545/831/1283/1424/1996` | 不動 |
| A. 缺陷本體（1） | 實測 LF/CRLF 結果不同 | `lessons-ledger:266`（其比對端在上方，`:269`） | 比對端修復 |

D 類的「本就容忍」是**實測**而非讀 regex 推論：`matchReqHeading`、`indexSpec`、`parseConstitutionRules`、`parseLedger`、`findTable`、`splitTableRow`、`isSeparatorRow`、`collectNcMarkers` 在 LF/CRLF 下輸出逐項相等。安全來自上游 `\s*`／`.trim()` 而非規則本身，這正是要抽 primitive 的理由。

## Implementation Steps

1. **RED：先寫差分測試**
   - `tests/unit/lib/task-markers.test.ts`：同一份 tasks.md 兩種行尾，解析結果（數量／`checked`／`kind`／`text`）逐項相等
   - `tests/unit/lib/lessons-ledger.test.ts`：`expiredPlaybookEntries` 的 LF/CRLF 差分，含 RETIRED 與 UN-RETIRED 兩個既有語意
   - 確認兩者在未修前為紅

2. **新增 primitive**
   - `src/lib/text-lines.ts`：`stripTrailingCr(line: string): string`，只剝行尾單一 `\r`，行中間的 `\r` 原樣保留
   - 附單元測試（含 lone `\r` 不視為換行、空字串、無 `\r`）

3. **GREEN：比對端改走 primitive（2 處缺陷本體新增剝除 ＋ 6 份既有剝除表達式收斂）**
   - `task-markers.ts`：`CHECKBOX.exec(stripTrailingCr(line))`；`text` 取自剝除後的視圖
   - `lessons-ledger.ts`：heading 比對改走 primitive（body 行仍原樣收集）
   - 既有手抄本收斂（行為不變，PB-006）：`markdown-fences.ts:100` 行內三元式、`spec-headings.ts` 的私有 `stripCarriageReturn`、`delegated-evidence.ts` 的私有 `withoutCr`、`archive.service.ts:911/957/983` 三處內嵌

4. **消費者端與 D 類差分斷言（不改程式碼）**
   - `status.service`（code task 數）與 `archive.service`（task stats）各一條 CRLF 斷言，證明繼承成立
   - `change-progress.service`：CRLF tasks.md 勾選一項後，除該行外每行行尾位元組不變（SC-005）
   - D 類最脆的兩處各補一條差分斷言，把 plan 的散文結論變成套件持有的事實：`findTable`／`splitTableRow`／`isSeparatorRow`（`\s*$` 吃 `\r`）、`parseConstitutionRules`（`RULE_HEADING` 的 `\s*` 吸掉 `\r` 後才傳給 `SEVERITY_TAGGED`）
   - `documentHeadings` 的「呼叫端必須先剝 `\r`」前置條件有三個呼叫端，既有測試只釘住 `spliceProductSpec` 一個（`archive.service:702` 的 ATX pattern 用 `[ \t]*$`，本身不容忍）；另補兩條釘住兩個決策點：CRLF 的 near-miss 標題仍被拒寫（`inspectProductSpecSync`）、CRLF 且 features 目錄缺失時給的是「restore」而非破壞性的「create」建議（`featureMapRegionHasContent`）

5. **端到端**
   - CRLF 的變更工件（tasks.md ＋ metadata.yaml）跑 `prospec status`／`prospec check`，結論與 LF 版一致

6. **知識與計數同步**
   - `lib` README：Key Files／Pitfalls 記載 primitive 與「比對視圖 vs 位元組保真」的界線；檔案數 39 → 40
   - `pnpm counts` 重導測試計數；`pnpm agents:check`

7. **mutation 驗證**
   - 手動把 `stripTrailingCr` 改為恆等函式，確認步驟 1／4 的斷言轉紅（`pnpm mutate src/lib/task-markers.ts` 實測 9m09s，不在本輪跑全套）

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 誤在回寫路徑剝 `\r`，把使用者的 CRLF 檔洗成 LF | High | 修復只落在比對端；C 類 13 處明文不動；SC-005 以位元組斷言釘住 change-progress |
| `parseTaskLine` 的 `text` 語意改變（原本含 `\r`） | Medium | 現況 CRLF 下根本不命中，無既有行為可破；差分測試以 LF 結果為基準 |
| D 類判定失準（某站點其實不容忍） | Medium | 逐一實測而非推論；判準與證據寫在上表，review 可重跑 |
| 45 處清單隨後續變更漂移 | Low | 表列的是判準與類別，不是永久快照；SC-003 只要求落地當時全覆蓋 |
