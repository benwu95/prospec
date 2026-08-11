# Tasks: raw-scan-c-cpp-swift

> 依架構層分組，TDD（先 RED）。`[P]` 可並行；無標記為 code。

## Lib

- [x] T1 `manifest-parsers.ts`：`parseVcpkgDependencies`（JSON `dependencies`，字串或 `{name, "version>="}` 物件）~35 lines
- [x] T2 `manifest-parsers.ts`：`parseConanfileTxtDependencies`（`[requires]` 區段，`name/version`）~35 lines
- [x] T3 `detector.ts`：`autoDetectTechStack` 加 Swift（`Package.swift`→swift/spm）~10 lines
- [x] T4 `detector.ts`：C/C++ 偵測（C/C++ build 檔 + 副檔名啟發式 c/c++，pm 依 manifest）~45 lines

## Services

- [x] T5 `raw-scan.service` `collectDependencies`：composer 後加 Swift→`[]` 短路 + `vcpkg.json`/`conanfile.txt` 分派 ~25 lines
- [x] T6 `raw-scan.service` `detectEntryPoints`：補 C/C++/Swift 進入點 pattern ~15 lines
- [x] T7 `raw-scan.service` `collectConfigFiles`：補 C/C++/Swift build/manifest pattern ~12 lines

## Tests

- [x] T8 [P] `manifest-parsers.test.ts`：vcpkg / conanfile 解析 + 容錯 ~70 lines
- [x] T9 [P] `detector.test.ts`：Swift、C、C++（含 .cpp 啟發式、裸 Makefile 不觸發、tech_stack 覆寫）~70 lines
- [x] T10 [P] `raw-scan.service.test.ts`：Dependencies（vcpkg/conan/Swift-空/命令式-空）+ Entry Points + Config Files ~110 lines

## Docs

- [x] T11 README（`README.md` / `README.zh-TW.md`）支援語言矩陣補 C / C++ / Swift 列（含啟發式與「命令式 manifest 不解析」註腳）~12 lines

## Summary

- **Total Tasks:** 11（皆 code）
- **Parallelizable Tasks:** 3
- **Total Estimated Lines:** ~439 lines

> 註：prospec 自身為 TypeScript，無 C/C++/Swift，故本變更不改變 `prospec/ai-knowledge/raw-scan.md` 輸出（無需重跑 refresh）。
