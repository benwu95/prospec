# Tasks: support-file-module-paths

> 依賴方向由低到高實作：Types → Lib → Services → Tests。遵循 TDD（對應測試先寫失敗版本再實作）。

## Types

- [x] 更新 `src/types/module-map.ts` `paths` 欄位 doc comment：說明條目可為單一檔案／資料夾／glob，語義由 `classifyModulePath` 決定（schema 仍 `z.array(z.string())`，shape 不變）~8 lines

## Lib

- [x] `src/lib/scanner.ts` 新增 `classifyModulePath(rawPath, cwd): 'glob'|'file'|'dir'|'missing'`：含 `*`→glob；`path.resolve(cwd,p)` 逃出 repo→missing；否則 `statSync` isFile→file、isDirectory→dir、擲錯→missing（REQ-LIB-029）~25 lines
- [x] `src/lib/scanner.ts` 新增 `moduleScanPatterns(paths, cwd): string[]`：dir→`${p}/**`、file→`${p}`、glob/missing→verbatim（REQ-LIB-029）~15 lines
- [x] `src/lib/drift-sources.ts` `importScanPattern` 加 `cwd` 參數並改用 `classifyModulePath`：file→回傳 `prefix`、glob→維持 `endsWith('/**') ? ${p}/${EXT} : ${p}/**/${EXT}`、dir/missing→`${p}/**/${EXT}`（REQ-LIB-014）~15 lines
- [x] `src/lib/drift-sources.ts` `collectImportEdges` 將 `cwd` 傳入 `importScanPattern`，確認 file 條目通過既有 `existsSync` gate、longest-prefix owner 不重複發邊（REQ-LIB-014）~10 lines

## Services

- [x] `src/services/knowledge.service.ts` `getModuleInfos` 掃描改走 `moduleScanPatterns(entry.paths, cwd)`，保留 `paths.length===0` 的 `${name}/**` fallback（REQ-KNOW-004）~8 lines
- [x] `src/services/knowledge-update.service.ts` `updateModuleReadme` 掃描改走 `moduleScanPatterns(modulePaths, cwd)`，保留 length===0 fallback（REQ-KNOW-004）~8 lines

## Tests

- [x] `tests/unit/lib/scanner.test.ts` — `classifyModulePath` 四態：glob（`**/x/**`、`dir/**`）、file、dir、missing（含 repo 外路徑）（REQ-TESTS-050）~60 lines
- [x] `tests/unit/lib/scanner.test.ts` — `moduleScanPatterns` 映射：dir→子樹、file→該檔、glob verbatim、file+dir+glob 混合陣列（REQ-TESTS-050）~40 lines
- [x] `tests/unit/lib/drift-sources.test.ts` — 僅含檔案條目之模組：`collectImportEdges` 回報 `available` 且掃到該檔的跨模組 import 邊（REQ-TESTS-050 / SC-002）~50 lines
- [x] `tests/unit/lib/drift-sources.test.ts` — glob 條目（`**/x/**`、`packages/*/**`）import-edge 行為回歸不變（保留舊寫法）（REQ-TESTS-050）~30 lines
- [x] `tests/unit/services/knowledge.service.test.ts` — 資料夾條目 → `getModuleInfos` 回傳非空 keyFiles；檔案條目 → 僅該檔（REQ-TESTS-050 / SC-003）~50 lines
- [x] `tests/unit/services/knowledge-update.service.test.ts` — 資料夾條目 → `updateModuleReadme` keyFiles 非空（回歸 0 檔缺陷）（REQ-TESTS-050）~40 lines
- [x] [V] 回歸：`pnpm typecheck` + `pnpm test` 全綠，coverage ≥ 80%（SC-004）~5 lines
- [x] [M] 自檢：build 後跑 `prospec check`，確認本 repo 現有 module-map（bare `src/lib` 等）無新增 drift ~5 lines

## Summary

- **Total Tasks:** 15（code 13、`[V]` 1、`[M]` 1）
