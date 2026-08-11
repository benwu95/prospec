# Implementation Plan: add-learn-staleness-sweep

## Overview

治理層的兩份版控檔案（`_lessons-ledger.md`、`_playbook.md`）只有累積入口、沒有退場判準：Govern 站僅處理 TTL 與規則衝突，於是「根因已被機制消滅」「主體已不存在」「與現況矛盾」三類過期條目會無限期停留，並以現行指令的形態被下一個變更讀到。

策略是把稽核放在 **Collect 之前**而非 Govern 之後——因為順序本身就是規則的一部分：先知道哪些列已死，這一輪的新復發才不會被記到死規則上（`frequency` 是晉升決策的唯一輸入）。判準寫進 `promotion-format` 作為單一定義（skill 只敘述站點與流程），退役語意刻意分層不對稱：ledger 列就地標記、計數與 `source_changes` 不動（它們是「這個模式真的發生過」的唯一證據）；playbook 條目保留永不重用的 id、拿掉 TTL 與 Guidance 本體（一條讀起來像指令的死規則就是 PB-003 的 claim⊄impl 出現在治理檔案自己身上）。機械半只補一處：`expiredPlaybookEntries` 改為逐條目區塊解析並跳過退役標記，否則已裁決的條目會在 TTL 到期後永久回到 needs-review list。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| templates | Shipped Handlebars 模板與 references | `skills/prospec-learn.hbs`、`skills/references/promotion-format.hbs` | 由 `lib/template.ts` 渲染，經 `pnpm bundle` 進 `bundled-templates.ts` |
| lib | 基礎工具與 station engines | `lessons-ledger.ts`：`parseLedger`/`upsertLesson`/`scoreLessons`/`expiredPlaybookEntries` | `types`、`markdown-table.ts` |
| tests | 4-layer Vitest 套件 | `contract/skill-format.test.ts`、`unit/lib/lessons-ledger.test.ts`、`fixtures/startup-loading-baseline.json` | 讀 bundled templates，非磁碟 `.hbs` |

### Existing Patterns (from _conventions.md / module knowledge)

- Station engine 只決定、不重新推導政策：`lessons-ledger` 數 DISTINCT source changes，格式真相在 `promotion-format` 而非程式
- Contract 測試須 section-scoped ＋ 結構斷言 ＋ mutation-verify（PB-001）；受測物是 bundled 副本，mutation 前必先 `pnpm bundle`（ledger key `test/mutation-verify-must-hit-the-deployed-copy`）
- 表格類文件一律走 `markdown-table.ts`，不自刻 splitter（PB-006）

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`：本變更只動 lib 葉層函式，不新增跨層 import
- Language Policy：`.prospec/changes/**` 繁中；`prospec/ai-knowledge/**` 英文，唯 ledger `description` 欄與 playbook 的 correction evidence 為具名例外
- TDD：斷言先於／同輪落地，且每條新斷言須以 mutation 實證會轉紅

## Call Chain

```
prospec learn upsert --lesson <file>
  → learn.service.execute(options)                         [orchestration]
  → lib/lessons-ledger.parseLedger(content)                 → LedgerEntry[]
  → lib/lessons-ledger.upsertLesson(entries, lesson)        [keyed idempotent upsert]
  → lib/lessons-ledger.scoreLessons(entries, thresholds)    [freq≥3 ∧ modules≥2]
  → lib/lessons-ledger.expiredPlaybookEntries(playbook, today)
        ├ split by `^### ` into entry blocks                [本變更：作用域由「行」改為「條目」]
        ├ skip block matching `- **RETIRED`                 [本變更：已裁決者不回到清單]
        └ first `**TTL**: <date>` per block, `< today`
  → cli/formatters/learn-output → 'Playbook entries past TTL (needs-review):'
```

`/prospec-learn` 的 Sweep 站是 agent 側流程（讀兩份檔案、判三判準、提 needs-review list、等核可），沒有新的 CLI 入口：唯一的機械半就是上面這條既有鏈的作用域修正。

## Implementation Steps

1. **Sweep 站落地（templates）**
   - `prospec-learn.hbs` Core Workflow 首站插入 `### Sweep`：三判準、證據須含執行者、needs-review ＋ 顯式核可
   - Startup Loading 新增完整讀取 `_playbook.md`（其他讀者仍只載相關條目，兩句敘述須彼此不矛盾）
   - Govern 補退役形態並指回 Sweep；Success Criteria／Failure Conditions／NEVER ×2／Error Handling ×2

2. **判準與退役語意的單一定義（templates）**
   - `references/promotion-format.hbs` 新增 `## Staleness Sweep (pre-Collect)`：三判準表、逐層退役語意、mechanized≠retired、單層擁有規則散文、`personal` 列永不壓縮、失效交叉引用亦屬過期內容
   - `## Governance — TTL & Conflict` 的 needs-review 條款接上三判準

3. **TTL 回報作用域修正（lib）**
   - `expiredPlaybookEntries` 改為逐 `### ` 條目區塊 flush；帶 `- **RETIRED` 標記者跳過

4. **斷言與 mutation 實證（tests）**
   - contract：五站順序（陣列相等，非僅存在性）、Sweep 內容、ledger 保護條款、playbook 完整載入、reference 的 sweep 語意
   - unit：退役跳過／無標記對照／同檔條目作用域三條
   - `startup-loading-baseline.json` 更新（版控基準，刻意需顯式更新）
   - 五個 mutation 逐一 `pnpm bundle` 後實測轉紅

5. **首輪套用（dogfood）**
   - playbook：PB-005 進 `## Retired Entries`；PB-004／006／008／009 的失效敘述與交叉引用訂正；Maintenance Rules 補三條
   - ledger：24 列壓縮 ＋ 1 列退役 ＋ 1 列補理由，以機械不變式腳本證明五欄逐列不變

6. **使用者可見面與計數同步**
   - `README.md` ＋ `README.zh-TW.md` 的 Feedback promotion 段落；`pnpm bundle`、`agent sync`、`pnpm counts`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 壓縮 ledger 敘述誤刪稽核證據 | High | 只壓縮 `promoted`／`retired`（正典規則已在 playbook），`personal` 一字不動；以 parse→比對腳本鎖死五欄，任何計數變動即拋錯；原文留在 git 歷史 |
| 退役標記偵測寫成全檔比對 | High | 逐條目區塊解析 ＋ 一條「同檔 live sibling 仍須回報」的斷言，全檔比對版本會轉紅（已實測） |
| 新斷言假綠（受測物是 bundled 副本） | Medium | 每個 mutation 先 `pnpm bundle` 再跑，並確認替換確實命中 |
| Sweep 被當成可自行清理的授權 | Medium | NEVER ＋ Failure Condition ＋ reference 三處明寫退役是 shared-tier write，需與晉升同級的顯式核可 |
| 無證據的退役 = 靜默刪規則 | Medium | Error Handling 明訂：機制找不到或找到但無執行者 → 條目維持現行、列為未決並寫出已查內容 |
