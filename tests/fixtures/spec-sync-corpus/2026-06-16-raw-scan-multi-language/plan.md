# Plan: raw-scan 後端多語言支援強化

## Overview

本變更讓 raw-scan 的四區塊確定性支援主流後端語言，解決非-JS/TS 專案（含 dogfood olfparser）知識生成輸入失準的問題。

策略：將多生態 manifest 解析抽為新 lib 模組 `manifest-parsers.ts`，由 `raw-scan.service` 的 `collectDependencies`/`detectEntryPoints` 分派呼叫；`detector.ts` 擴充語言偵測表。僅引入 `smol-toml`（TOML）與 `fast-xml-parser`（XML）兩個 permissive、ESM、確定性套件，其餘格式（go.mod / requirements / composer / JSON）手刻。維持 `cli → services → lib → types` 依賴方向與 LLM-free、無網路的 scan 核心。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|--------------------|---------|--------------|
| lib | 共用偵測／解析（stateless） | `detectTechStack`、(new) `parseToml/parseGoMod/parseRequirements/parseXmlDeps/parseComposer` | types |
| services | raw-scan 四區塊組裝 | `generateRawScan`、`collectDependencies`、`detectEntryPoints`、`collectConfigFiles` | types, lib |
| templates | 輸出模板 | `raw-scan.md.hbs` | — |

### Existing Patterns (from _conventions.md)

- lib 為 stateless function；ESM `.js` import；type-only import；早返回降巢狀
- 解析失敗 try/catch 容錯回空（沿用 `collectDependencies` 既有）
- 測試 memfs + `vol.fromJSON` + AAA；測試檔鏡像原始檔路徑

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services → lib → types`，不可逆向
- TDD（RED-GREEN-REFACTOR）；coverage ≥ 80%
- scan 核心確定性、無 LLM、無網路

### External Library Usage (on-demand, informational)

- **smol-toml**: `parse(doc) -> object`；呼叫端自行走 `[tool.poetry.dependencies]`／`[project.dependencies]`／`[dependencies]`
- **fast-xml-parser**: `new XMLParser().parse(xml)`；pom.xml → `project.dependencies.dependency[]`，csproj → `Project.ItemGroup.PackageReference[]`
- Context7 not consulted — skipped

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| lib | High | 新增 `manifest-parsers.ts`；`detector` 語言表擴充 |
| services | High | `collectDependencies` 分派、`detectEntryPoints` 後端、`collectConfigFiles` pattern |
| templates | Low | 區塊重排（已完成） |
| tests | High | 各語言 fixture 單元測試 |

## Call Chain

```
generateRawScan(options)                              [services/raw-scan.service]
  → detectTechStack(cwd, config.tech_stack)           [lib/detector]   語言/pm 表（含後端）
  → detectEntryPoints(files, cwd)                     [services] → parse* [lib/manifest-parsers]
  → collectDependencies(cwd)                          [services] → 依生態分派 parseToml/parseGoMod/
                                                        parseRequirements/parseXmlDeps/parseComposer [lib/manifest-parsers]
  → collectConfigFiles(files)                         [services]       pattern（含後端 build 檔）
  → renderTemplate('knowledge/raw-scan.md.hbs', ctx)  [lib/template]
```

## Implementation Steps

1. **新增 runtime deps** — `smol-toml`、`fast-xml-parser`
2. **建立 `lib/manifest-parsers.ts`** — TOML / go.mod / requirements / XML / composer 解析，純函式、容錯回空
3. **`detector.ts` 擴充** — `autoDetectTechStack` 後端語言 + package_manager
4. **`collectDependencies` 改寫** — 依生態分派；修 docstring（go.mod 成真）
5. **`detectEntryPoints` 擴充** — 後端慣例（best-effort）
6. **`collectConfigFiles` 擴充** — 後端 build 檔 pattern
7. **各層測試（TDD：先 RED）**；README 視 user-facing surface 更新
8. **重跑 `prospec/ai-knowledge/raw-scan.md`** — 產出檔對齊新行為

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| `requirements.txt` 邊界多 | Medium | 明確 scope、測已知陷阱、接受 partial、不誤列 |
| `go.mod` 無現成 embeddable parser | Medium | 手刻 require block + 單行；測 replace/exclude/retract 不誤收 |
| `fast-xml-parser` v5 帶數個 transitive deps | Low | 確認 footprint；僅用於 XML manifest，可後撤 |
| 多語言混合 repo 行為歧義 | Low | 明定優先序並於 edge case 記錄 |
