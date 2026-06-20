# 問題記錄：feature-prefixed REQ 在 archive 的 Knowledge-sync 落空 + phantom module 風險

> 狀態：**問題分析**（於 archive `mcp-spec-entry-resources` / BL-042 期間發現；該 change 的 archive 暫停於 Entry Gate 待決）
> 日期：2026-06-20
> 嚴重度：中（不壞 runtime；但留 stale knowledge、可能污染 Knowledge、事實計數漂移進永久 spec）

## 一句話

`standard`/`full` scale 的變更若 delta-spec 用 **feature-prefixed REQ**（如 `REQ-MCP-…`），`/prospec-archive` 的 REQ-prefix-driven auto knowledge-update **對應不到實際被改的模組**，導致：(a) 對應 module README 不同步（stale 不清）、(b) 有 mint 出 **phantom `modules/<feature-prefix>/`** 的風險、(c) 事實計數漂移（如 `6 resources`→`8`）無人攔截。

## 觸發情境（BL-042）

- scale: `standard`；delta-spec REQ = `REQ-MCP-002`/`REQ-MCP-003`（皆 **MODIFIED**）。
- 程式改動：`types/mcp.ts`、`lib/knowledge-reader.ts`、`services/mcp.service.ts`（+ tests、README ×2）。
- commit（`ca7c5d6`）後 `prospec check`：`knowledge-health` **WARN — 4 個 module stale**（lib / services / types / tests，source commit 比 README commit 新）。

## 根因

1. archive 的 auto knowledge-update 以 **REQ-prefix → module name** 對應：`parseDeltaSpec` 取 `REQ-{MODULE}-{NNN}` 的中段並 `toLowerCase()`（`knowledge-update.service.ts:68,94`）。`REQ-MCP-002` → module `"mcp"`。
2. `MCP` 是 **feature prefix**（mcp-server feature 的 `req_prefix`，宣告於 `feature-map.yaml`），**不是 module 名**；`"mcp"` 在 `module-map.yaml` 不存在。
3. auto-update 只對 `scale: backfill` skip（`archive.service.ts:554`，理由見 `:545-549` 註解——feature-slug REQ id 會被誤判為 module 名並 mint phantom）。**`standard`/`full` 沒有等價防護**。
4. 後果三連：
   - **(a) stale 不清**：lib/services/types/tests 的 README 不會被這條 auto-update 觸及 → 4 個 stale WARN 留著，會被下一個變更的 `/prospec-verify` V4 當 pre-existing 繼承（PB-005 家族）。
   - **(b) phantom module 風險**：`updateModuleReadme` 對未知模組**無存在性／known-module 檢查**，直接 `ensureDir`（`knowledge-update.service.ts:133`）+ `atomicWrite`（`:174`）建出目錄與 README.md（JSDoc `:117-118` 即註明「creates directory and README.md」）→ 可能 mint `prospec/ai-knowledge/modules/mcp/README.md` + module-map entry。正是 backfill skip 註解描述的**同型 misfire**，只是 standard 沒擋。
   - **(c) 事實計數漂移**：`mcp.service.ts` 的「registers **6 resources** + 2 tools」（`services/README.md:26`、`_index.md:14`）實際已是 **8**；drift 不檢查計數正確性（PB-004 靠人工），無人攔截。

## 連帶發現：feature-map 的 `mcp-server.modules` 本身不完整

- `feature-map.yaml` 宣告 `mcp-server` → `modules: [lib, types]`、`req_prefixes: [MCP]`。
- 但 mcp-server 程式實際橫跨 **cli**（`cli/commands/mcp.ts`、`cli/formatters/mcp-output.ts`）、**services**（`mcp.service.ts`）、**lib**（`knowledge-reader`）、**types**（`mcp.ts`）+ **tests**。
- 即使改用「feature → `feature-map.modules`」推導（backfill 的法子），對 mcp-server 仍會**漏 cli / services / tests**。
- 原因：`syncFeatureMap` 從「module-prefix REQ headings」seed `modules`。mcp-server.md **有** `REQ-TYPES-029`、`REQ-LIB-017` 兩條 module-prefix REQ → 現有 `[lib, types]` 正是由它們正確 seed 出（feature-map 於 `3fffb94` 建立、晚於兩條 REQ 落地，現行而非 stale curation）。但 cli / services / tests 只透過 `REQ-MCP`（feature-prefix）+ 實作參與、**沒有自己的 module-prefix REQ heading** → seed 不到，故缺漏。
- 推論：**feature-prefixed feature 的 `feature-map.modules` 天生易不完整**；最可靠的 affected-modules 來源是 `metadata.related_modules`（人工設定；本案已正確設為 types/lib/services/tests）。

## 為何 backfill / quick 免疫、standard/full 不免疫（不對稱）

| scale | affected-modules 來源 | feature-prefixed REQ 是否落空 |
|-------|----------------------|------------------------------|
| `quick` | 無 delta-spec → Entry Gate 用 diff 路徑 × module-map 推導；auto-update skip | 否（不靠 REQ prefix） |
| `backfill` | Entry Gate 用 `related_modules` + `Feature→feature-map`；auto-update **skip** | 否（明確繞開） |
| `standard` / `full` | auto-update + Entry Gate 皆假設 **REQ prefix == module name** | **是**（feature prefix 對不到 module） |

非 module 的 REQ prefix 共 11 個（`MCP`/`AGNT`/`SKILL`/`KNOW`/`DSGN`/`CHNG`/`SPEC`…），任何 standard/full 變更碰到都會中。

## 修正選項（待評估，可開成 BL）

1. **standard/full 也支援 feature-prefix → 模組推導**：當 REQ prefix 在 `module-map` 找不到、但在 `feature-map.req_prefixes` 找得到時，改由 `metadata.related_modules`（最可靠）或 `Feature→feature-map.modules` 推導 affected modules（Entry Gate + auto-update 一致）。
2. **knowledge-update 對未知模組永不 mint**（獨立 hardening，惠及所有 scale）：`updateModuleReadme` 遇到不在 `module-map`/既有 `modules/` 的 module 名時 **skip + warn，永不 create** → 消除 phantom 風險。
3. **修 `feature-map` 的 `mcp-server.modules`**：補 cli/services/tests；並檢討 `syncFeatureMap` 對 feature-prefixed feature 的 module seeding（從 `product.md`/程式歸屬推導，而非只靠 module-prefix REQ）。
4. **（選用）drift 增「README 事實計數」檢查**：把 PB-004 的人工檢查部分機械化。

> 建議優先序：**(2)** 最小且高價值（直接消 phantom 風險）→ **(1)** 補正確同步 → **(3)** 修資料正確性 → **(4)** 選用。

## BL-042 當前狀態與暫定 workaround

- `status: verified`（Grade S）、已 commit `ca7c5d6`；**archive 暫停於 Entry Gate**。
- 暫定 workaround（待使用者確認，**不跑** auto knowledge-update 以避開 phantom misfire）：
  1. 手動 surgical 同步 4 個 module README + `_index.md`（`6→8 resources`、新 readers、test count `1696→1705`）。
  2. graduate `REQ-MCP-002/003` 進 `specs/features/mcp-server.md`（MODIFIED replace-in-place + Change History + `last_updated`）。
  3. 寫 `summary.md` + 移檔到 `.prospec/archive/2026-06-20-mcp-spec-entry-resources/` + status `archived` + copy 到 `specs/_archived-history/`。
  4. product.md / feature-map 無需動（mcp-server 已存在、REQ 是 MODIFIED 非新 feature）。
  5. commit 委託產物（READMEs、`_index.md`、feature spec、`_archived-history` summary）後 `prospec check` 須 **0 stale、0 fail**。
