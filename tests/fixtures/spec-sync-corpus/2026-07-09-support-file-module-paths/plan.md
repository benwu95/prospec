# Plan: support-file-module-paths

## Overview

`module-map.yaml` 的 `paths` 目前被各 caller 不一致解讀：drift 的 import-edge 蒐集把每個 literal 展開成 `<prefix>/**/*.ext`（檔案條目失效），knowledge 的 `scanDir(paths)` 對裸資料夾掃 0 檔（需 `/**`），而歸屬 matcher 又已能精確匹配單一檔案。結果同一份 `paths` 行為分歧，也無法把單一檔案歸到與其資料夾不同的模組。

策略：在 lib 建**單一** stat-based 路徑分類器，作為「一個 `paths` 條目該如何被掃描」的唯一事實來源；drift 與 knowledge 的掃描端各自套用自己的副檔名／glob tail，但共用同一分類語義。分類四態：**glob**（含 `*`，原封不動——保留既有 glob 寫法）、**file**（磁碟上為檔案→只掃該檔）、**dir**（磁碟上為目錄→掃子樹）、**missing/repo 外**（退回現有 literal-prefix fallback，不擲錯、不改規則集）。歸屬 matcher（`makePathMatcher`/`fileMatchesModulePath`）的 `p===literal` 分支已正確涵蓋檔案與資料夾，**不改動**，維持 surgical。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| lib | 掃描 + drift 蒐集器 | `scanDir`/`scanDirSync`（scanner）、`collectImportEdges`/`importScanPattern`（drift-sources） | types |
| services | knowledge README 產生 | `getModuleInfos`（knowledge）、`updateModuleReadme`（knowledge-update） | lib, types |
| types | module-map schema | `ModuleMapSchema.paths` | — |

### Existing Patterns (from _conventions.md)
- lib 為 stateless 純工具；drift-sources 已 `import { scanDirSync } from './scanner.js'`（lib→lib 同向，無循環）。
- 掃描一律走 `scanDir`/`scanDirSync`（fast-glob，`onlyFiles:true`，安全 excludes）。
- 早返回、`const`、`.js` ESM import、type-only import。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`；本變更僅新增 lib→lib（scanner）與 services→lib 邊，皆同向。
- TDD：新函式先寫失敗測試。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | scanner.ts 新增 `classifyModulePath` + `moduleScanPatterns`；drift-sources.ts `importScanPattern` 改用分類器 |
| services | Medium | knowledge.service `getModuleInfos`、knowledge-update.service `updateModuleReadme` 掃描改走 `moduleScanPatterns` |
| types | Low | module-map.ts `paths` 欄位 doc comment 說明 file/dir/glob 語義（schema shape 不變） |
| tests | Medium | scanner/drift/knowledge fixture 測試 |

## Call Chain

prospec check (drift import-direction)
  → CheckCommand → check.service.execute()
  → collectImportEdges(cwd, moduleMap)                 [lib/drift-sources, I/O]
  → importScanPattern(prefix, cwd)
  → classifyModulePath(prefix, cwd)                    [lib/scanner, stat]
  → scanDirSync(pattern, { cwd })                      [lib/scanner]

prospec knowledge generate / update
  → KnowledgeCommand → knowledge(-update).service.execute()
  → getModuleInfos(moduleMap, exclude, cwd) / updateModuleReadme(name, paths, opts)  [services]
  → moduleScanPatterns(entry.paths, cwd)               [lib/scanner, stat]
  → scanDir(patterns, { cwd, exclude })                [lib/scanner]

## Implementation Steps

1. **lib/scanner.ts — 分類器（TDD RED 先行）**
   - `classifyModulePath(rawPath, cwd): 'glob'|'file'|'dir'|'missing'`：含 `*`→glob；否則 `path.resolve(cwd,p)` 逃 repo→missing；`statSync` isFile→file、isDirectory→dir、擲錯→missing。
   - `moduleScanPatterns(paths, cwd): string[]`：dir→`${p}/**`、file→`${p}`、glob→verbatim、missing→verbatim（供 knowledge 掃描共用，去除兩處重複）。

2. **lib/drift-sources.ts — `importScanPattern` 改用分類器**
   - 簽章加 `cwd`；file→回傳 `prefix`（只掃該檔）、glob→維持 `endsWith('/**') ? ${p}/${EXT} : ${p}/**/${EXT}`、dir/missing→`${p}/**/${EXT}`。
   - `collectImportEdges` 現有 `existsSync` gate 對 file 為 true→正常進掃描；longest-prefix owner 仍保單一歸屬（file 條目 weight 高於其 dir）。

3. **services — knowledge 掃描改走 `moduleScanPatterns`**
   - `getModuleInfos`：`patterns = moduleScanPatterns(entry.paths, cwd)`（保留 `paths.length===0` 的 `${name}/**` fallback）。
   - `updateModuleReadme`：同上，`moduleScanPatterns(modulePaths, cwd)`。

4. **types/module-map.ts — `paths` doc comment**
   - 註明條目可為單一檔案／資料夾／glob；語義由 `classifyModulePath` 決定（schema 仍 `z.array(z.string())`）。

5. **tests（RED→GREEN）**
   - scanner 單元：classify 四態 + `moduleScanPatterns` 映射（含 repo 外→missing）。
   - drift 單元：僅檔案條目之模組 → `collectImportEdges` `available` 且掃到該檔 import；glob 條目行為不變。
   - knowledge 單元：dir 條目 → 非空 keyFiles（修 0 檔缺陷）；file 條目 → 只該檔。

6. **回歸驗證**
   - `pnpm typecheck` + 全測試綠 + `prospec check` 自檢（無新 drift）。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| glob 舊寫法回歸（使用者明確要求保留） | Medium | glob 由含 `*` 偵測、verbatim 通過；針對 `**/x/**`、`dir/**` 加專測 |
| 裸資料夾語義改變影響既有 map | Medium | dir→子樹恢復掃描（修 0 檔 latent bug）；SC-003 + 全測試回歸把關 |
| `statSync` 成為 repo 外存在性 oracle | Low | 分類器先做 repo-escape 收斂→missing；drift 上游已 `clampModulePaths` |
| 路徑不存在時擲錯／默默改規則集 | Low | missing→literal fallback；沿用 `collectImportEdges` 既有 `existsSync` gate |
| 每路徑 `statSync` 效能 | Low | 模組數量級小（數十），O(#paths)，可忽略 |

**Layering check (Phase 6 / dependency-direction):** 新增邊 drift-sources→scanner（lib→lib，既存）與 services→lib，皆同向、無循環，無層級跨越。PASS。

**Knowledge Gate (Phase 7):** Brownfield；已讀 lib/services README + _conventions.md，Technical Summary 已綜整，drift-detection.md / ai-knowledge.md 既有 REQ 已比對。PASS。
