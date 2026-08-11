# Plan: raw-scan C/C++/Swift 偵測擴充

## Overview

延續 `raw-scan-multi-language` 的確定性偵測架構，把 C/C++/Swift 補進四區塊。沿用既有手刻 + 集中解析的模式：新增 `vcpkg.json`/`conanfile.txt` 兩個宣告式 parser 至 `lib/manifest-parsers`，`detector` 擴充 Swift 與 C/C++（副檔名啟發式）語言偵測，`raw-scan.service` 擴充 dispatch / entry / config pattern。

命令式 manifest（`CMakeLists.txt`/`Package.swift`/`conanfile.py`）不靜態解析（同 Gradle DSL 的理由），其依賴留白交下游 LLM。raw-scan 維持 `atomicWrite`、byte-identical、無使用者編輯區塊。不需新增 runtime 依賴（JSON 用內建、conanfile.txt 為行掃描）。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| lib | 偵測／解析（stateless） | `detectTechStack`、(new) `parseVcpkgDependencies`/`parseConanfileTxtDependencies` | types |
| services | raw-scan 四區塊組裝 | `generateRawScan`、`collectDependencies`、`detectEntryPoints`、`collectConfigFiles` | types, lib |

### Existing Patterns (from _conventions.md)

- lib stateless function；ESM `.js` import；type-only import；解析失敗 try/catch 回空
- 測試 memfs + `vol.fromJSON` + AAA；測試檔鏡像原始檔
- 既有 `findManifestPath`（tree-wide、最淺路徑、codepoint 排序）、`detectTechStack(cwd, config, files)` 已收 files

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`
- TDD（RED-GREEN-REFACTOR）；coverage ≥ 80%
- scan 確定性、無 LLM、無網路；不導入 mergeContent

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | `manifest-parsers` +2 parser；`detector` swift/c-c++ 偵測 |
| services | Medium | `collectDependencies` 加 swift 短路 + vcpkg/conan 分派；`detectEntryPoints`/`collectConfigFiles` pattern |
| tests | High | 各語言 fixture |

## Call Chain

```
generateRawScan(options)                              [services/raw-scan.service]
  → detectTechStack(cwd, config.tech_stack, files)    [lib/detector]   +swift +c/c++(ext 啟發式)
  → detectEntryPoints(files, cwd)                     [services]       +main.c/.cpp/.swift patterns
  → collectDependencies(cwd, files)                   [services] → swift→[] / vcpkg / conan
                                                        [lib/manifest-parsers]
  → collectConfigFiles(files)                         [services]       +cmake/swift/conan/vcpkg patterns
  → renderTemplate('knowledge/raw-scan.md.hbs', ctx)  [lib/template]   (模板不變)
```

## Implementation Steps

1. **`manifest-parsers.ts`** — `parseVcpkgDependencies`（JSON `dependencies`，字串或 `{name, "version>="}`）、`parseConanfileTxtDependencies`（`[requires]` 區段，`name/version`）
2. **`detector.ts`** — `autoDetectTechStack`：`Package.swift`→swift/spm；C/C++ build 檔（CMakeLists/*.cmake/conanfile/vcpkg.json/meson.build）+ 副檔名啟發式→c/c++ + pm；排序 swift 在 c/c++ 前
3. **`raw-scan.service` collectDependencies** — composer 後加 `Package.swift`→`[]` 短路，再加 `vcpkg.json`/`conanfile.txt` 分派
4. **`detectEntryPoints`** — 補 `main.c`/`main.cpp(.cc/.cxx)`/`main.swift`/`Sources/**/main.swift`（含 `src/` 變體）
5. **`collectConfigFiles`** — 補 CMakeLists.txt/*.cmake/Package.swift/Package.resolved/*.podspec/Podfile/conanfile.txt/conanfile.py/vcpkg.json/meson.build
6. **測試（TDD）** + README 矩陣補列

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| C vs C++ 啟發式誤判（單 .cpp 輔助的 C 專案） | Low | 文件註明限制；`.prospec.yaml tech_stack` 可覆寫 |
| Swift+vcpkg 並存順序歧異（重演 Ruby+PHP） | Low | detectTechStack 與 collectDependencies 都讓 swift 排前、deps 短路 `[]` |
| 裸 Makefile 過度觸發 C/C++ | Low | C/C++ 語言偵測不採裸 Makefile，僅 C/C++ 特定 build 檔 |
| conanfile.txt 格式變體 | Low | 限 `[requires]` 區段、行掃描容錯回空，接受 partial |
