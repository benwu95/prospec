# Plan: archive-cli-entry

## Overview

archive.service.ts 的決定論邏輯（搬檔、summary scaffold、Feature Spec sync、product.md、feature-map.yaml）已完整存在且有測試覆蓋，但 CLI 從未註冊 `archive` 命令，導致 skill 指揮 agent 手動代跑這些最不需要判斷的 mutation。本變更接上 CLI 入口並補 `--dry-run`，把決定論工作交還決定論程式碼。

實作策略：CLI 端新增 thin command（parse → `archive.service.execute()` → format），service 端以 `dryRun` 旗標貫穿既有 `execute()` 流程、在各寫入點短路並回報預定 mutation——不重寫任何既有語義（no-clobber、non-fatal、bootstrap-once 逐字保留）。skill 模板收斂：決定論步驟改為「執行 `prospec archive`」，保留 Entry Gate、REQ 語意畢業（措辭收斂）與 summary 繁中敘事／`## Review & Verify` 節等判斷面工作。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| cli | Thin I/O — Commander commands + formatters | `createProgram()`, `registerXxxCommand`, `formatXxxOutput` | services, types, lib |
| services | 一 service 一 `execute()` | `archive.service.execute(options) → ArchiveResult` | lib, types |
| templates | Handlebars 資源 — skills/references | `skills/prospec-archive.hbs` | —（純資源） |
| tests | 4 層 Vitest | unit（memfs）/ contract / e2e | 全部 |

### Existing Patterns (from _conventions.md / module READMEs)
- Add a command: `commands/{name}.ts` + `formatters/{name}-output.ts`，registrar 註冊進 `index.ts`（＋E2E）
- service 寫入一律 `atomicWrite()`；archive.service 刻意不做 schema 驗證（terminal station 吸收 pre-schema 記錄）
- 改 shipped `.hbs` 兩步：`pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（bundled-templates-sync contract）

### Architecture Constraints (from Constitution)
- One-way Dependency：`cli → services → lib → types`，command 不含業務邏輯
- TDD：tests 先行或同 commit；coverage ≥ 80%
- README-documented surface 變更（新命令）須同步 root README.md

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | `archive.service.ts` 加 `dryRun` 旗標與具名目標拒絕回報（`refused`）；既有語義零變更 |
| cli | Medium | 新增 `commands/archive.ts` + `formatters/archive-output.ts`，`index.ts` 註冊（15→16 命令） |
| templates | Medium | `skills/prospec-archive.hbs` 決定論步驟收斂為 CLI 呼叫（含 fallback ladder），判斷面保留 |
| tests | Medium | 命令/formatter 單元測試、dry-run≡real-run 等價測試、E2E case、skill-format contract 對齊 |

## Call Chain

prospec archive <name...> [--dry-run]
  → registerArchiveCommand → action(names, opts)        [parse + resolveLogLevel]
  → archive.service.execute({ names, dryRun, cwd })     [orchestration]
    → scanChanges(cwd) → filterByStatus('verified')     [discovery（沿用）]
    → moveToArchive / 計算 archivePath（dry-run 短路）   [mutation 1]
    → generateSummary（讀取源：real=archiveDir, dry=change.dir）→ atomicWrite（dry 短路） [mutation 2]
    → syncToFeatureSpecs(…, dryRun)                     [mutation 3，non-fatal]
    → metadata status→archived + archived_at（dry 短路） [mutation 4]
    → generateProductSpec / syncFeatureMap（dry 短路）   [mutation 5/6，non-fatal + no-clobber]
  → formatArchiveOutput(result, logLevel)               [stdout；錯誤走 handleError→stderr]

## Implementation Steps

1. **service：dry-run 貫穿與拒絕回報**
   - `ArchiveOptions` 加 `dryRun?: boolean`；`ArchiveResult` 加 `dryRun` 標記與 `planned` 明細（搬檔目的地、summary、spec-sync 目標、product.md/feature-map 動作、metadata 更新），加 `refused: {name, status, reason}[]`（具名目標存在但非 verified）與 `notFound: string[]`
   - 寫入點短路：`moveToArchive` 拆出路徑計算；`syncToFeatureSpecs`/`generateProductSpec`/`syncFeatureMap` 增 `dryRun` 參數守住 `atomicWrite`/`ensureDir`
   - dry-run 讀取源為 `change.dir`（檔案尚未搬移）；日期沿用執行當日（重放比對時對日期正規化）

2. **cli：thin command + formatter**
   - `commands/archive.ts`：`prospec archive <name...>`＋`--dry-run`；名稱必填（skill 的「NEVER archive without user confirmation」由呼叫端顯式給名承接）
   - `formatters/archive-output.ts`：dry-run 列出全部預定 mutation；real run 列 archived/skipped/spec files/refused；自由字串過 `sanitizeTerminal()`
   - `index.ts` 註冊；命令計數相關生成物跑 `pnpm counts`

3. **templates：skill 收斂**
   - `prospec-archive.hbs`：Phase 3（搬檔）/3.5 機械 sync/product.md/feature-map 步驟改為「執行 `prospec archive <name>`（先 `--dry-run` 預覽）」＋CLI fallback ladder（比照 raw-scan refresh 慣例）
   - 保留：Entry Gate 全部條目（語義逐字不變）、REQ 語意畢業（畢業後檢視 merged spec 措辭收斂為英文）、summary 繁中敘事＋`## Review & Verify` 節寫入、lessons harvest、`_archived-history` 複本、raw-scan refresh
   - `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`；對齊 `skill-format.test.ts` 既有 pin（Phase 2 write step/Gate/NEVER 不動）

4. **tests：等價性與回歸**
   - unit：dry-run 零寫入（memfs 快照前後相等）＋ dry-run 預測 ≡ 隨後 real run 實際 mutation（同 fixture 等價測試，覆蓋 FR-006/SC-001）
   - unit：refused/notFound 回報；既有 archive.service 測試全綠（語義回歸網）
   - e2e：`archive --dry-run` happy path（tmpdir、compiled CLI）
   - contract：skill-format 對新 phase 文案的 pin 調整（section-scoped、mutation-verified）

5. **文件同步**
   - root README.md 命令清單加 `archive`（Constitution SHOULD）；cli/services README 計數與敘述留待 verify commit prompt 的 knowledge sync

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| spec-sync/feature-map 語義回歸（specs/features/ 唯一寫入者） | High | 不改寫既有函式邏輯，只加 dryRun 守門；既有測試全綠＋等價測試 |
| dry-run 與 real run 輸出漂移（雙路徑各自演化） | Medium | 同一 `execute()` 流程單旗標短路（不建平行實作）；等價測試釘住 |
| skill 收斂誤刪 contract test 釘住的段落 | Medium | 先讀 `skill-format.test.ts` 對 archive 的 pin，再動模板；bundle+sync 後跑 contract |
| 歷史重放的日期不可再現（archive dir 帶執行日） | Low | 測試對日期正規化，比對結構（目的地模式、spec 目標、REQ 路由） |
