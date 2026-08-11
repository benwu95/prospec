# Tasks: compile-standalone-binary

## Types

- [x] 重構 `src/types/version.ts` 以支援 `process.env.PROSPEC_VERSION` 優先讀取 ~20 lines

## Lib

- [x] 新增空的 `src/lib/bundled-templates.ts` 作為打包佔位檔 ~10 lines
- [x] 實作 `scripts/bundle-templates.ts` 腳本，遞迴掃描 `src/templates` 並產出 `src/lib/bundled-templates.ts` ~40 lines
- [x] 修改 `src/lib/template.ts` 中的 `readTemplateSource`，優先讀取 `BUNDLED_TEMPLATES` ~20 lines

## Services

- [x] 重構 `src/services/mcp.service.ts` 中的版本號載入，改為自 `types/version.ts` 匯入 `PROSPEC_VERSION` ~15 lines

## CLI

- [x] 修改 `package.json`，將 `esbuild` 新增至 `devDependencies` ~5 lines
- [x] [M] 執行 `pnpm install` 安裝 `esbuild` 相依 ~5 lines
- [x] 於 `package.json` 的 `scripts` 配置 `bundle:templates`（跑預編譯腳本）與 `bundle:cli`（跑 esbuild 打包 cli 程式碼與相依） ~10 lines
- [x] 於 `.github/workflows/release.yml` 實作自動打包建置管線，包括安裝 Bun、套件安裝、執行 `pnpm run bundle`、在各平台上跑 `bun build --compile` ~60 lines
- [x] 在 `release.yml` 的 macOS job 中新增 codesign 步驟（使用 `codesign --sign -`） ~15 lines
- [x] 在 `release.yml` 中新增 GitHub Release 上傳步驟，將產出的 4 個獨立執行檔上傳至 Release assets ~30 lines
- [x] 更新根目錄的 `README.md`，調整 CLI 安裝指南，說明如何下載與執行 Standalone Binary ~20 lines
- [x] 更新根目錄的 `README.zh-TW.md`，同步更新繁體中文安裝指南 ~20 lines
- [x] 更新 `docs/` 目錄下的網站說明文件，確保線上文件中的安裝說明與實際發布的二進位檔同步 ~25 lines

## Tests

- [x] 撰寫 `tests/unit/lib/template.test.ts` 單元測試，驗證內嵌範本優先讀取機制與 fallback 的正確性 ~50 lines
- [x] 撰寫 `tests/unit/types/version.test.ts` 單元測試，驗證當 `process.env.PROSPEC_VERSION` 存在時的優先讀取表現 ~30 lines
- [x] [V] 執行本地測試 `pnpm test`，驗證本變更未影響現有 CLI 邏輯 ~10 lines
- [x] [V] 本地執行 `pnpm run bundle` 與 `bun build --compile` 等指令，手動在終端機中測試產出的二進位檔功能 ~15 lines

## Summary

- **Total Tasks:** 18
- **Parallelizable Tasks:** 0
- **Total Estimated Lines:** ~410 lines
