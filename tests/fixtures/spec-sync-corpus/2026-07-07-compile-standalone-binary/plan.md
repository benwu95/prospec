# Plan: compile-standalone-binary

## Overview

本計劃旨在為 `prospec` 專案提供一個 Standalone Binary（獨立執行檔）建置管線，讓下游專案的使用者無須安裝 Node.js 執行期環境即可直接下載執行 `prospec <command>`。

我們將使用 Bun 作為 Bundler 與 Compiler。核心的設計決策包括：(1) 在打包前跑 pre-build 腳本，將 `src/templates` 下的所有 Handlebars 範本讀取並匯入成記憶體字典，解決二進位檔無法讀取外部範本檔案的問題；(2) 在 `src/types/version.ts` 引入靜態環境變數讀取 fallback，避免 require 檔案系統上的 `package.json`；(3) 透過 GitHub Actions 建置管線針對不同目標平台（Linux x64、macOS arm64/x64、Windows x64）執行 `bun build --compile`，並進行必要的 codesign 後上傳至 Release assets。

---

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| cli | 終端 Command 註冊與 I/O 格式化 | `index.ts`, `commands/`, `formatters/` | services, types, lib |
| lib | 系統基礎工具（包含範本載入） | `template.ts`, `fs-utils.ts`, `config.ts` | types |
| types | Zod 結構描述、自訂錯誤與版本資訊 | `version.ts`, `errors.ts`, `change.ts` | zod |

### Existing Patterns (from _conventions.md)
- **ESM Modules**：所有匯入必須包含 `.js` 副檔名。
- **模板載入**：原使用 `import.meta.url` 搭配 `fs.readFileSync` 進行定位與讀取。
- **錯誤模式**：所有錯誤繼承自 `ProspecError` 並帶有 code 與 suggestion。

### Architecture Constraints (from Constitution)
- **單向依賴**：`cli → services → lib → types`。
- **文件與測試**：變更必須同步更新測試套件並確保 README 更新。

---

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Low | 修改 `src/types/version.ts` 以支援 `process.env.PROSPEC_VERSION` 打包時的靜態變數注入，並使 `mcp.service.ts` 的版本呼叫統一路由至此。 |
| lib | Medium | 於 `src/lib/template.ts` 引入自動產生的 `src/lib/bundled-templates.ts` 對照字典，解決二進位檔範本讀取問題；新增 `scripts/bundle-templates.ts` 預建置腳本。 |
| cli | Low | 修改 `package.json` 新增 `dev` / `bundle` 及 `esbuild` / `bun` 打包用 script，並在 `src/cli/index.ts` 相關進入點進行適配。 |

---

## Call Chain

```
pnpm run bundle (Build-time)
  → scripts/bundle-templates.ts (Aggregates src/templates/ -> src/lib/bundled-templates.ts)
  → bun build ./src/cli/index.ts --bundle --platform=node --outfile=dist/cli-bundle.js

bun build --compile (CI/CD Release compile-time)
  → bun build --compile --minify --target=bun-linux-x64 --outfile=dist/prospec-linux-x64
  → bun build --compile --minify --target=bun-darwin-arm64 --outfile=dist/prospec-macos-arm64
  → codesign --sign - dist/prospec-macos-arm64 (macOS only)

prospec init (User execution-time)
  → CLI Entry (dist/cli-bundle.js in binary)
  → initCommand.action() -> initService.execute()
  → renderTemplate("init/prospec.yaml.hbs")
  → readTemplateSource() -> returns BUNDLED_TEMPLATES["init/prospec.yaml.hbs"] (in-memory, no filesystem call)
```

---

## Implementation Steps

1. **實作範本預編譯腳本**
   - 撰寫 `scripts/bundle-templates.ts`，掃描 `src/templates` 並將內容匯出至 `src/lib/bundled-templates.ts`。
   - 新增並提交一個空的 `bundled-templates.ts` 佔位檔案，確保本地 tsc 編譯不報錯。

2. **改造範本讀取機制**
   - 修改 [template.ts](file:///Users/ben.hy.wu/workspace/prospec/src/lib/template.ts)，優先從 `BUNDLED_TEMPLATES` 讀取，讀取失敗時 fallback 到舊有 filesystem 讀取模式。

3. **版本號讀取重構**
   - 修改 [version.ts](file:///Users/ben.hy.wu/workspace/prospec/src/types/version.ts) 優先讀取 `process.env.PROSPEC_VERSION`。
   - 重構 [mcp.service.ts](file:///Users/ben.hy.wu/workspace/prospec/src/services/mcp.service.ts) 將 `require('../../package.json')` 的版號引用替換為匯入 `PROSPEC_VERSION`。

4. **設定打包與建置指令**
   - 於 `package.json` 中配置 `esbuild` 或 `bun` 的打包腳本，支援將程式碼及內嵌範本合流打包為單一 JS 檔案。

5. **配置 GitHub Release Workflow**
   - 建立 `.github/workflows/release.yml`，在 GitHub release 事件時，以 Docker/Runner 啟動 Bun 與 codesign，編譯出各平台二進位檔並上傳。

6. **更新使用者安裝與執行說明文件**
   - 修改 `README.md` 與 `README.zh-TW.md` 中關於 CLI 的安裝步驟，新增下載各平台獨立二進位執行檔的說明。
   - 修改 `docs/` 底下的網站安裝文件說明（網頁內容的安裝指引），保持一致性。

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 範本檔案修改後忘記重新 bundle 導致 binary 使用過期範本 | Medium | 在 `release.yml` 與本地 `pnpm run build` 前置指令中，強制先執行 `bundle-templates.ts` 生成對照表。 |
| Bun 與原生 Node.js 的相容性落差導致指令行為異常 | High | 在 `release.yml` 建置完成後，於 Runner 本地對產出的二進位檔直接執行 `prospec check --help` 等核心指令進行冒煙測試。 |
| macOS 因 codesign 簽章問題在使用者機器上遭 Gatekeeper 阻擋 | High | 使用 `codesign --sign -` 進行 ad-hoc 簽章，並在根目錄 `README.md` 中說明若遇到系統安全性阻擋時的排除步驟。 |
