# Implementation Plan: add-knowledge-refresh-command

## Overview

`raw-scan.md` 目前只在 `prospec knowledge init` 產生，程式碼演進後會 drift。本變更新增一個 deterministic（不使用 LLM）的 `prospec knowledge refresh` 指令，只重新掃描並覆寫 `raw-scan.md`，不碰 curated 檔案（`module-map.yaml` / `_index.md` / `_conventions.md`）。

策略：把 `knowledge-init.service.ts` 內聯的「掃描 → 組 context → render raw-scan → 寫檔」邏輯抽成共用函式 `generateRawScan()`，放進新檔 `services/raw-scan.service.ts`。`init` 改呼叫它（行為不變，仍續做 module-map / skeleton 建立），`refresh` 指令與 `archive.service` 安全網皆共用同一函式（DRY）。`refresh` 只做 raw-scan，故 by construction 不會動到 skeletons。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| services | `execute()` 業務邏輯 | `generateRawScan()`(new), `rawScan.execute()`(new), `knowledgeInit.execute()`, `archive.execute()` | lib, types |
| cli | parse → execute → format | `registerKnowledgeRefreshCommand()`(new) | services, types |
| templates | Handlebars 資源 | `skills/prospec-archive.hbs`, `knowledge/raw-scan.md.hbs` | — |

### Existing Patterns (from _conventions.md)
- 一指令一 service `execute(options) → Promise<Result>`；service→service import 已有先例（archive → knowledge-update）。
- 一律 `atomicWrite()`；`--depth` 走共用 `cli/parse-options.parseDepth`。
- raw-scan 產生為純函式、無時間戳，輸入相同則輸出相同（deterministic）。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`，不可逆向。
- TDD（測試先行）；commit 為英文、atomic、bullet body。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | 新增 `raw-scan.service.ts`（`generateRawScan` + `execute`）；`knowledge-init.service.ts` 改用共用函式；`archive.service.ts` 尾端非致命觸發 refresh + `ArchiveResult.rawScanRefreshed` |
| cli | Medium | 新增 `commands/knowledge-refresh.ts` 與 `formatters/knowledge-refresh-output.ts`；`index.ts` 註冊；archive 無 CLI（見風險） |
| templates | Medium | `prospec-archive.hbs` / `prospec-knowledge-generate.hbs` 加 refresh + 開發者 persona fallback ladder；`prospec-quickstart.hbs` CLI 不可用改「提醒安裝」（採用者 persona）；`raw-scan.md.hbs` 標頭補 `knowledge refresh` |
| tests | Medium | refresh service unit + e2e；knowledge-init / archive 回歸 |

## Call Chain

```
prospec knowledge refresh [--depth n] [--dry-run]
  → registerKnowledgeRefreshCommand.action(options)              [cli]
  → rawScan.execute({ depth, dryRun, cwd })                      [services/raw-scan.service]
  → generateRawScan(options)                                     [services] (shared core)
      → readConfig / resolveBasePaths                            [lib/config]
      → scanDir('**', {cwd, depth, exclude})                     [lib/scanner]
      → detectTechStack / detectEntryPoints / collectDependencies
        / collectConfigFiles / buildDirectoryTree
      → renderTemplate('knowledge/raw-scan.md.hbs', ctx)         [lib/template]
      → atomicWrite(raw-scan.md)   (skipped when dryRun)         [lib/fs-utils]
  → formatKnowledgeRefreshOutput(result, logLevel)               [cli/formatters]

archive.execute()                                                [services]
  → … move / spec-sync / product …
  → executeKnowledgeUpdate(...)     (existing, non-fatal)
  → generateRawScan({ cwd })        (NEW, non-fatal) → rawScanRefreshed
```

## Implementation Steps

1. **抽出共用 `generateRawScan()`（services）**
   - 新增 `raw-scan.service.ts`：`RawScanResult`（含 `files` 供 caller 做 module 偵測）、`generateRawScan(options)`、`execute = refresh 入口`。
   - 把 `detectEntryPoints / collectDependencies / collectConfigFiles / buildDirectoryTree` 從 init 搬入；dryRun 時掃描但不寫檔。

2. **`knowledge-init.service.ts` 改用共用函式**
   - 以 `generateRawScan()` 取代內聯掃描/render/write；用回傳的 `files` 做 `detectModules`；維持既有 `KnowledgeInitResult` 與 dry-run 語意（行為不變）。

3. **CLI `knowledge refresh` 指令 + formatter（cli）**
   - `commands/knowledge-refresh.ts`（`--dry-run` / `--depth`，鏡像 init）；`formatters/knowledge-refresh-output.ts`；於 `index.ts` 註冊到 knowledge group。

4. **archive 安全網（services）**
   - knowledge-update 迴圈後非致命呼叫 `generateRawScan({cwd})`；`ArchiveResult` 加 `rawScanRefreshed: boolean`。

5. **skill 模板 + raw-scan 標頭（templates）**
   - `prospec-archive.hbs` 在 Phase 4 後補「執行 `prospec knowledge refresh` 刷新結構快照」步驟。
   - `prospec-knowledge-generate.hbs` Startup Loading 第 4 項就地重構：先 `prospec knowledge refresh`（不存在則建立）再讀 raw-scan，並改寫前置條件；**保留 `{{knowledge_base_path}}/raw-scan.md` 為該 item 第一個 backtick token、不新增編號項、不加 `**MANDATORY**`**，使 baseline item-set 不變、無需重生 fixture。
   - `prospec-quickstart.hbs`（採用者 persona）：CLI 不可用改為「停止並提醒安裝 prospec」，並條件化建議 Node.js 專案列 devDependency；不採 npx 暫解。
   - `raw-scan.md.hbs` 標頭文字補 refresh；`prospec agent sync` 重新部署。

6. **文件（docs）**
   - 根目錄 `README.md` 與 `README.zh-TW.md` 指令清單加入 `knowledge refresh`；devDependency 段落補「下游開發者免全域安裝即可 refresh」（條件化 Node.js 專案）。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `archive.service.execute` 目前無 CLI caller（僅單元測試使用），skill 為 LLM 驅動 | Medium | archive.service 串接維持服務自洽且可測（鏡像既有 knowledge-update 安全網）；**真正驅動實際流程的是 skill 模板指示**——兩者互補，皆納入 FR-005 |
| init 重構造成行為回歸 | High | 先跑既有 `knowledge-init.service.test` 為 baseline，重構後須全綠（SC-003） |
| e2e 需先 build | Low | tasks 標記 `[M]` build 步驟；e2e spawn `dist/cli/index.js` |
| 誤動 curated 檔案 | High | refresh 只呼叫 `generateRawScan`（只寫 raw-scan）；測試斷言三檔 byte-identical |
| 改 generate Startup Loading 觸發 skill-format contract 失敗 | Medium | 就地改第 4 項，維持 raw-scan.md 為第一 backtick token + 不新增編號項 → `itemKey` 不變、baseline 免重生；另加正向斷言「Startup Loading 含 `prospec knowledge refresh`」 |
