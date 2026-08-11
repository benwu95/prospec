# Implementation Plan: filter-nonsource-modules

## Overview

`detectModules()` 目前把 `generateRawScan()` 交來的完整 git-tracked 檔案清單直接餵給三個偵測策略。清單裡的 `.md`／`.pdf`／`.png`／`.json` 與程式碼同權，於是任何含 ≥2 個檔案的頂層目錄都能成為 module——頂層平鋪型 brownfield 因此產出大量純文件 module。

策略是在 `detectModules()` 入口加一道**非原始碼副檔名過濾**：偵測前把輸入清單收斂成原始碼子集，再以該子集執行 package／domain／architecture 三策略、architecture pattern 辨識與 relationship 掃描。判定採拒絕清單（列出非原始碼副檔名）而非白名單——審查 F-1 實測證明白名單極性會在語言未列出時抹除全部程式碼目錄，拒絕清單讓未知副檔名算原始碼，失誤方向只會是多一個 module。既有「≥2 檔」門檻套在子集上，即等價於 issue #92 要的 source-file 密度門檻，不必新增第二個數字。過濾器刻意住在 `module-detector.ts` 而非 `scanner.ts`：raw-scan.md 的 directory tree 必須看見文件目錄，把過濾放進掃描層會讓後續有人誤用而破壞 raw-scan 產出。以子集偵測若得到零個 module 就退回完整清單重跑，讓「偵測不精準」不會被升級成「完全偵測不到」——判準刻意是「找不到 module」而非「子集為空」（審查 NEW-1）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| lib | Stateless 共用工具；`module-detector.ts` 持有四種偵測策略 | `detectModules`, `buildModuleMap` | types |
| services | 每指令一個 `execute()`；`knowledge-init.service.ts` 是唯一呼叫端 | `execute(KnowledgeInitOptions)` | types, lib |
| tests | 4 層測試金字塔；`tests/unit/lib/module-detector.test.ts` 承接斷言 | — | 全模組 |

### Existing Patterns (from _conventions.md)

- 常數 UPPER_SNAKE_CASE、函式 camelCase；避免 magic number，改用具名常數。
- lib 內為純無狀態函式；`type` import 用 `import type`；ESM import 帶 `.js`。
- 測試鏡射原始檔路徑，AAA 排列；既有 module-detector 測試不需 memfs（純函式，僅 relationship 掃描讀檔）。

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`：本變更只動 lib 內部，不新增任何 import。
- TDD [MUST]：fixture 測試先寫（RED），再改實作。
- Language Policy：程式碼與註解英文；本工件繁中。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | `module-detector.ts` 新增非原始碼拒絕清單與過濾入口；四策略改吃子集 |
| tests | Medium | 新增頂層平鋪型 fixture、空子集退回、大小寫、src-集中型回歸案例 |
| services | None | `knowledge-init.service.ts` 呼叫簽章不變 |

## Call Chain

```
prospec knowledge init
  → registerKnowledgeInitCommand → knowledgeInit.execute({cwd, depth, dryRun})   [cli → services]
  → generateRawScan({cwd, depth, dryRun}) → files[]        [services; 完整清單，供 raw-scan.md]
  → detectModules(files, cwd, strategy, knowledgeBasePath)  [lib]
      → loadExistingModuleMap(cwd, knowledgeBasePath) → 命中則 early return（過濾器不介入）
      → scope = filterSourceFiles(files); dirModules = detectByStrategy(scope, …)   [NEW]
         （isSourceFile = 有副檔名 且 副檔名不在 NON_SOURCE_FILE_EXTENSIONS）
      → if (dirModules.length === 0) { scope = files; 重跑 detectByStrategy }   [NEW — 判準是找不到 module，非子集為空]
      → detectByStrategy(scope, cwd, strategy) → package → domain → architecture
      → detectArchitecturePattern(scope) / detectRelationships(modules, scope, cwd)
      → detectEntryPoints(files)                            [維持完整清單——entry point 非 module 邊界]
  → buildModuleMap(detection) → atomicWrite(module-map.yaml)  [services]
```

無跨層違規：新邏輯全在 lib 內的純函式，不新增對 services／cli 的 import。

> 不繪 User Story Flow 圖：US-1 是「過濾→門檻」線性流程，US-2 只有一個 fallback 分支，皆不觸及 Section 5 的結構複雜度訊號。

## Implementation Steps

1. **寫失敗測試（RED）**
   - 頂層平鋪型 fixture：`docs/*.md`、`samples/*.json`、`spec/*.pdf`、`cache/*.json` + `src/pkg/*.py`、`tests/*.py`、`scripts/*.sh`；斷言 module 名稱集合恰為含原始碼者。
   - 大小寫案例：`native/a.H`／`native/b.c` 仍成為 module，而 `handbook/*.MD`／`*.PNG` 仍被拒絕。
   - 極性案例：`.f90`（拒絕清單未涵蓋）專案的程式碼目錄必須存活（審查 F-1 的回歸守衛）。
   - 零結果退回案例：純 `.md`／`.txt` 清單、以及「子集非空但太薄」的 k8s manifest 形狀（`manifests/*.yaml` + 一支 `hack/verify.sh`），兩者結果都須等於過濾前。
   - src-集中型回歸案例：`src/{cli,lib,services,types}/*.ts` + `tests/**` 結果不變。

2. **定義非原始碼副檔名拒絕清單**
   - `module-detector.ts` 內新增 `NON_SOURCE_FILE_EXTENSIONS`（`Set<string>`，全小寫鍵），按族群分組：文稿／文件檔／影像／影音／封存／資料設定／字型／建置產物。
   - `isSourceFile()` 判定為「有副檔名 且 不在拒絕清單」，`path.extname()` 轉小寫比對；未知副檔名算原始碼、無副檔名者一律非原始碼。

3. **在 `detectModules()` 入口套用過濾與零結果退回**
   - 於 `loadExistingModuleMap` early return **之後**、`detectByStrategy` 之前計算 `scope`。
   - 以子集偵測後若 `dirModules.length === 0` → 把 `scope` 換成完整 `files` 重跑；註解寫明為何判準是「找不到 module」而非「子集為空」（審查 NEW-1：一支落單 script 就會讓 YAML／docs 專案得到零 module，且空 map 會永久黏著）。

4. **把 `scope` 貫穿 module 邊界相關的三處**
   - `detectByStrategy`、`detectArchitecturePattern`、`detectRelationships` 改吃 `scope`。
   - `detectEntryPoints` 維持完整 `files`，註解說明 entry point 不是 module 邊界決策、且兩份清單今日恰好一致是巧合而非依賴（審查 F-3 的訂正——原註解誤稱有無副檔名 entry point，實際 `entryPatterns` 每條都帶副檔名）。

5. **實測驗收（GREEN）**
   - `pnpm test` 全綠、`pnpm typecheck` 無錯。
   - 對真實 `../olfparser` 清單重跑偵測，確認 16 → 9 且移除的 7 個全為零原始碼目錄（SC-002）。

6. **同步知識與計數**
   - 依 PB-005 更新 `prospec/ai-knowledge/modules/lib/README.md`（`module-detector.ts` 一列補上 source-file gating）。
   - 新增測試後跑 `pnpm counts` 重導 test 數字；`prospec check` 確認無新增 FAIL。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 過濾誤判導致某語言專案偵測不到 module | High | 兩道防線：極性反轉為拒絕清單（審查 F-1）讓未知副檔名算原始碼；零結果退回（審查 NEW-1）讓窄化永不回傳比不窄化更少的 module。兩者各有 fixture 測試釘住（Fortran／k8s manifest）|
| 誤把 `.hbs`／`.css` 列入拒絕清單，讓 prospec 自身 `src/templates/**` 與前端專案樣式目錄消失 | Medium | 兩者不在拒絕清單；測試 fixture 混入純文件目錄，讓「整組 template／樣式被拒絕」必然轉紅（審查 F-2 的修正） |
| 既有下游專案重跑 `knowledge init` 後 module 邊界改變 | Low | `module-map.yaml` 存在時不覆寫（REQ-SERVICES-025），偵測結果不落地；且 `loadExistingModuleMap` 命中即 early return |
| domain 策略 `infra` catch-all 仍列大量字面路徑 | Low | 既有獨立缺陷，本變更不處理；以 fixture 斷言過濾後不會誤觸發 domain 策略 |
| 新增測試後 index/README 計數漂移 | Low | 步驟 6 的 `pnpm counts` + `prospec check` 收斂 |

> Knowledge 檢查：Brownfield 模式（`modules/` 有 6 份 README）；已載入 lib README + `_conventions.md` + `_playbook.md` 相關條目（PB-005/006/007）+ Feature Spec `ai-knowledge.md`（US-301／REQ-KNOW-003/014、REQ-SERVICES-025）→ PASS。
