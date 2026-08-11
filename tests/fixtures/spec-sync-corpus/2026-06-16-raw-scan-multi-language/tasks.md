# Tasks: raw-scan-multi-language

> 依架構層分組，TDD（先 RED）。`[P]` 可並行；`[M]` 為人工指令；無標記為 code。

## Templates

- [x] T1 重排 `raw-scan.md.hbs` section 順序（已完成、440 測試通過）~6 lines

## Lib

- [x] T2 新增 runtime deps：`pnpm add smol-toml fast-xml-parser` ~3 lines
- [x] T3 `manifest-parsers.ts`：TOML 依賴萃取（pyproject Poetry+PEP621、Cargo）via smol-toml ~55 lines
- [x] T4 `manifest-parsers.ts`：`go.mod` require 解析（block + 單行，排除 replace/retract）~45 lines
- [x] T5 `manifest-parsers.ts`：`requirements.txt` 強化掃描（陷阱處理）~45 lines
- [x] T6 `manifest-parsers.ts`：XML 依賴萃取（pom.xml、*.csproj）via fast-xml-parser ~45 lines
- [x] T7 `manifest-parsers.ts`：composer.json 依賴（JSON.parse）+ 進入點 helper（scripts/[[bin]]/OutputType）~40 lines
- [x] T8 `detector.ts`：`autoDetectTechStack` 後端語言 + package_manager 擴充 ~55 lines

## Services

- [x] T9 `raw-scan.service` `collectDependencies`：依生態分派 + 修 `go.mod` docstring ~70 lines
- [x] T10 `raw-scan.service` `detectEntryPoints`：後端慣例（main.go/src/main.rs/__main__.py/main.py/scripts）~55 lines
- [x] T11 `raw-scan.service` `collectConfigFiles`：補後端 build 檔 pattern ~15 lines

## Tests

- [x] T12 [P] `tests/unit/lib/manifest-parsers.test.ts`（各 parser 路徑與陷阱）~140 lines
- [x] T13 [P] `detector.test.ts`：後端語言／pm cases ~70 lines
- [x] T14 [P] `raw-scan.service.test.ts`：Dependencies 多生態 cases ~110 lines
- [x] T15 [P] `raw-scan.service.test.ts`：Entry Points 後端 + Config Files + section order cases（含 knowledge-format section-order contract）~70 lines

## Docs

- [x] T16 README 同步：於 README.md / README.zh-TW.md 加「專案掃描支援語言」矩陣（應使用者要求補上可發現性；滿足 Constitution 原則 5）
- [x] T17 [M] 重跑 `prospec knowledge refresh` 更新 `prospec/ai-knowledge/raw-scan.md` ~3 lines

## Summary

- **Total Tasks:** 17（code 15、[M] 1、已完成 1）
- **Parallelizable Tasks:** 4
- **Total Estimated Lines:** ~840 lines
