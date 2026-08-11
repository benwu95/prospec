# Implementation Plan: delegate-module-adjudication

## Overview

`module-detector.ts` 的四張硬編碼表把「什麼算 code」與「什麼算 module」的裁決權留在 CLI 的 lib 層，但那一層沒有專案語境，任何全域清單對某些專案必然是錯的。規格（US-301 / REQ-KNOW-003）本來就把這個裁決指派給 LLM 層，缺的是**證據**與**授權**：`raw-scan.md` 沒有揭露閘門排除了什麼，而 `/prospec-knowledge-generate` 從未授權它增刪 `module-map.yaml` 的條目。

實作策略是不動分類演算法、只補這兩件事，並順手移除兩個站不住腳的啟發法。`raw-scan.md` 新增一個決定論區塊，據實列出「不含任何原始碼檔案的最上層目錄」與其檔案組成；判準重用 `module-detector` 匯出的 `isSourceFile`（PB-006 單一真相），計算放在 `lib`、渲染放在 `services`，所以 `--raw-scan-only` 與 `prospec upgrade` 兩條既有路徑自動涵蓋，且完全不依賴 module 偵測是否執行。skill 端在 Step 3 加入「偵測輸出是便宜初稿 → 讀該區塊 → 提案 → 使用者確認 → 回寫 module-map.yaml」的授權紀律，沿用既有 category 回寫的同一慣例，不動 Startup Loading（保住 stable prefix 與 `startup-loading-baseline.json`）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | 無狀態工具；`module-detector.ts` 是 module 邊界偵測與原始碼分類的唯一擁有者 | `detectModules`、`buildModuleMap`（新增 `isSourceFile`、`collectNonSourceDirectories`） | types |
| services | 一命令一 `execute()`；`raw-scan.service.ts` 是 raw-scan.md 的唯一產生核心 | `generateRawScan(options)` → `RawScanResult` | lib, types |
| templates | 純 `.hbs` 資源，經 `renderTemplate()` 消費 | `knowledge/raw-scan.md.hbs`、`skills/prospec-knowledge-generate.hbs` | — |
| tests | 4 層 Vitest 套件 | `knowledge-format.test.ts`、`skill-format.test.ts`、`unit/lib/module-detector.test.ts` | 全部 |

### Existing Patterns (from module READMEs / _conventions.md)

- **閘門位置**：原始碼分類住在 `module-detector.ts` 而非 `scanner.ts` — `raw-scan.md` 的目錄樹必須繼續顯示文件／資源目錄。本變更維持此界線。
- **拒絕清單極性**：`NON_SOURCE_FILE_EXTENSIONS` 是拒絕清單，未列出者算原始碼；白名單會抹除任何未列語言的程式碼目錄。
- **模板雙步部署**：改 shipped `.hbs` 要先 `pnpm bundle`，再 `npx tsx src/cli/index.ts agent sync`；`pnpm exec prospec` 會解析到全域安裝的舊執行檔。
- **契約測試三要件（PB-001）**：section-scoped、structure-aware、mutation-verified。
- **決定論排序**：drift／raw-scan 輸出一律 codepoint 序（`localeCompare` 破壞位元一致性）。

### Architecture Constraints (from Constitution)

- **One-way Dependency [SHOULD]**：`cli → services → lib → types`。`raw-scan.service`（services）匯入 `module-detector`（lib）方向合規；lib 不得反向匯入。
- **Test-Driven Development [MUST]**：每個新公開函式先寫失敗測試。
- **Language Policy [MUST]**：change artifact 繁中；`raw-scan.md` 模板文案、skill 文案、REQ body 皆英文。
- **User-Facing Documentation [SHOULD]**：`raw-scan.md` 的區段結構是使用者可見面，需檢查根 `README.md` 與 `README.zh-TW.md`。

### External Library Usage

Context7 not consulted — 本變更不觸及任何第三方套件。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | `module-detector.ts`：匯出 `isSourceFile`、新增 `collectNonSourceDirectories()`；刪除 `'min'` 死條目與 `MODULE_INDICATORS` 常數＋其單檔繞過 |
| services | Medium | `raw-scan.service.ts`：計算無原始碼目錄並注入模板 context；`RawScanResult` 新增欄位 |
| templates | Medium | `raw-scan.md.hbs` 新增 `## Directories Without Source Files` 區塊；`prospec-knowledge-generate.hbs` Step 3 新增裁決授權 |
| tests | Medium | 新增 unit（聚合／巢狀收斂／上限／空集）、contract（raw-scan 區塊格式、skill 授權文案）、回歸（門檻一致化） |
| types | Low | 無型別檔變更（新欄位定義在 services 的 `RawScanResult` 介面） |

## Call Chain

**EP-1 — `prospec knowledge init --raw-scan-only`（新區塊主要產生路徑）**

```
cli/commands/knowledge-init.ts (--raw-scan-only)
  → services/knowledge-init.service.execute({ rawScanOnly: true })
    → services/raw-scan.service.generateRawScan({ cwd, depth, dryRun })
      → lib/scanner.scanDir('**', { gitTrackedOnly: true })
      → lib/module-detector.collectNonSourceDirectories(files)   ← 新增
          → lib/module-detector.isSourceFile(file)               ← 匯出（既有邏輯）
      → lib/template.renderTemplate('knowledge/raw-scan.md.hbs', ctx)
      → lib/fs-utils.atomicWrite(raw-scan.md)
```

**EP-2 — `prospec knowledge init`（完整 bootstrap，偵測門檻一致化）**

```
cli/commands/knowledge-init.ts
  → services/knowledge-init.service.execute({})
    → services/raw-scan.service.generateRawScan(...)             ← 同 EP-1，含新區塊
    → lib/module-detector.detectModules(files, cwd, strategy, basePath)
      → detectByStrategy → detectFromDirectories(files)
          門檻改為 dirFiles.length >= 2（移除 MODULE_INDICATORS 繞過）
      → 零結果時以未過濾清單重跑（既有 fallback，不變）
    → atomicWrite(module-map.yaml)                               ← 僅在不存在時
```

**EP-3 — `prospec upgrade`（既有 raw-scan 消費者，自動繼承新區塊）**

```
cli/commands/upgrade.ts → services/upgrade.service.execute()
  → services/raw-scan.service.generateRawScan(...)               ← 同一核心，無需額外改動
```

**EP-4 — `/prospec-knowledge-generate`（LLM 層裁決，非程式呼叫鏈）**

```
Startup Loading step 4: prospec knowledge init --raw-scan-only → 讀 raw-scan.md
  → Step 3 Decide Module Boundaries
      讀 ## Directories Without Source Files
      → 判斷某目錄是否為專案本體
      → 向使用者提案增／刪 module（沿用 Step 5 category 回寫慣例）
      → 使用者確認後寫回 module-map.yaml
  → Step 4 依最終 module 清單產 README
```

## Implementation Steps

1. **[RED] lib 測試先行**
   - `tests/unit/lib/module-detector.test.ts` 新增 `collectNonSourceDirectories()` 失敗測試：純非原始碼目錄入選、混合目錄不入選、巢狀收斂到最上層祖先、codepoint 排序、上限截斷回報、空集
   - 斷言 `isSourceFile` 已從模組匯出

2. **[GREEN] lib 實作**
   - `module-detector.ts` 匯出 `isSourceFile`
   - 新增純函式 `collectNonSourceDirectories(files, cap)` → `{ path, fileCount, extensions[], truncated }`，無 I/O

3. **[RED→GREEN] services 串接**
   - `raw-scan.service.ts` 呼叫該函式，結果注入 `rawScanContext` 與 `RawScanResult`
   - `tests/unit/services/raw-scan.service.test.ts` 斷言 context 形狀與傳遞

4. **[RED→GREEN] 模板區塊**
   - `knowledge/raw-scan.md.hbs` 新增 `## Directories Without Source Files`：說明句（必須據實涵蓋零結果退回的例外）、清單、空集佔位、截斷揭露
   - `tests/contract/knowledge-format.test.ts` 以 section-scoped + structure-aware 斷言鎖定，並加兩次渲染的位元一致性測試

5. **[RED→GREEN] 移除兩個啟發法**
   - 刪 `NON_SOURCE_FILE_EXTENSIONS` 的 `'min'`；刪 `MODULE_INDICATORS` 常數與 `detectFromDirectories` 的 `|| MODULE_INDICATORS.includes(name)`
   - 更新 `isSourceFile` 與 `detectFromDirectories` 的 JSDoc
   - 新增「移除繞過後零結果 → fallback 觸發」的釘住測試；修正因門檻一致化而失效的既有測試

6. **[RED→GREEN] skill 授權**
   - `templates/skills/prospec-knowledge-generate.hbs` Step 3 新增裁決段落（初稿定性＋提案→確認→回寫）
   - `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`
   - `tests/contract/skill-format.test.ts` 新增 section-scoped 斷言

7. **零回歸實測**
   - 腳本比對移除繞過前後，prospec 自身與 `../olfparser` 的 module 名稱集合
   - `prospec knowledge init --raw-scan-only` 連跑兩次驗證 `diff` 無輸出
   - 結果記入 `.tasks/feat/delegate-module-adjudication/`

8. **知識與文件同步**
   - 更新 lib／services／templates／tests 四個 module README（PB-011：逼近預算時先壓縮既有敘述）
   - 檢查根 `README.md` 與 `README.zh-TW.md` 是否描述 raw-scan.md 區段結構
   - `pnpm counts`、`pnpm typecheck`、完整測試套件、`prospec check`

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| **R1** 新區塊放大 raw-scan.md（LLM 每次 generate 都讀） | Medium | 目錄上限 50、每目錄副檔名上限 5、巢狀收斂到最上層祖先、空集只佔一行。取捨：選「可截斷但據實揭露省略數量」而非無上限完整清單 — 完整清單在 docs-heavy 專案會淹沒真正的訊號 |
| **R2** 移除 `MODULE_INDICATORS` 改變既有專案偵測結果 | Medium | issue #114 已量測 prospec 自身與 1199 檔 Python brownfield 專案「因繞過而存在的 module 數皆為 0」；步驟 7 重跑實測。取捨：失誤方向不對稱 — 漏列只是少一個單檔 module（輕微），誤列會讓單檔 `utils/` 變成噪音 module |
| **R3** 非單調性：移除繞過可能讓某專案 module 數掉到 0，反而觸發 fallback 得到更多 module | Low | fallback 是既有且經測試的路徑；步驟 5 新增專門釘住此路徑的測試，讓行為成為規格而非意外 |
| **R4** 忘記 `pnpm bundle`，shipped 模板與 `src/templates` 漂移 | High | `tests/contract/bundled-templates-sync.test.ts` 已釘住 bundle ≡ src；步驟 6 明列兩步部署 |
| **R5** 區塊文案宣稱這些目錄「絕不會成為 module」（PB-003 documented-claim 漂移） | Medium | 文案必須明寫零結果退回的例外；契約測試對該例外句做 mutation 驗證 |
| **R6** lib README 逼近 L2 預算（PB-011） | Low | 先壓縮既有敘述再加新句；不為省 token 稀釋知識密度 |
| **R7** `isSourceFile` 被複製而非匯入（PB-006／PB-007） | Medium | 只在 `module-detector.ts` 保留一份實作，services 匯入；review 時 grep `NON_SOURCE_FILE_EXTENSIONS` 確認無第二份 |

**Layering check（Phase 6）**：四條 Call Chain 皆為 `cli → services → lib`，無跨層直呼、無 lib→services 反向匯入、無業務邏輯下沉到 CLI 層。EP-4 是 skill 層流程而非程式呼叫，不涉及模組相依。**無違規**。

**Knowledge gate（Phase 7）**：PASS — Brownfield 模式；已讀 lib／services／templates／tests 四份 README 與 `_playbook.md` 相關條目（PB-001/003/006/007/011/016）；Feature Spec `ai-knowledge.md` 已檢查既有 REQ 重疊（REQ-LIB-038、REQ-KNOW-003/014/022/023/025）。

**前站 WARN 承接**：new-story 的 INVEST Independent WARN（US-2 依賴 US-1 的區塊）在此緩解 — 實作步驟把 US-1（步驟 1-4）排在 US-2（步驟 6）之前，且 skill 文案以區塊標題軟指向，不硬編碼其內部格式。
