---
feature: standalone-binary
status: active
last_updated: 2026-07-07
story_count: 1
req_count: 4
---

# Standalone Binary Compilation

## Who & Why

**Target users**: Users who want to run Prospec CLI without Node.js or pnpm installation.

**Problem solved**: Eliminates the requirement of having Node.js / TypeScript environment in target project machines or CI/CD pipelines.

**Why it matters**: Simplifies CLI installation and execution, making Prospec accessible to non-Node.js project ecosystems.

## User Stories & Behavior Specifications

### US-1: 下載並執行 Standalone Binary [P1]

As a 下游專案的開發者,
I want 直接下載適用於我作業系統平台的 prospec 獨立執行檔並在終端機中執行,
So that 我不需要在機器上另外安裝 Node.js 就能直接使用 prospec 進行 Spec-Driven Development.

**Acceptance Scenarios:**
- WHEN 在乾淨無 Node.js 環境的 Linux/macOS/Windows 下執行下載的 `prospec --version`，THEN 成功印出當前版本。
- WHEN 在下游專案目錄下執行 `prospec check`，THEN 可以正常進行漂移稽核並輸出稽核結果。

#### REQ-CLI-001: Standalone Binary Compilation for Multi-Platform
在 GitHub 發布 Release 時，自動觸發建置管線編譯出 Linux x64、macOS arm64/x64、Windows x64 的 Standalone Binary 獨立執行檔，並完成 macOS 的 codesign。

**Scenarios:**
- WHEN 發布 Release 後，THEN assets 中包含 prospec-linux-x64、prospec-macos-arm64、prospec-macos-x64、prospec-windows-x64.exe。
- WHEN 執行 macOS 二進位檔，THEN 已完成 codesign ad-hoc 簽署，能在 macOS 系統下執行。
- WHEN 執行任何二進位檔，THEN 無須外部 Node.js 執行期環境即可單獨執行。

#### REQ-LIB-001: Template Embedded Compilation
為了解決獨立執行檔無法存取外部檔案系統中範本的問題，必須在打包編譯前，將所有 `.hbs` 範本內容聚合成一個記憶體對照字典，並於執行期優先自該字典中讀取。

**Scenarios:**
- WHEN 執行 `pnpm run bundle` 時，THEN 會先自動生成 `src/lib/bundled-templates.ts`。
- WHEN 執行期 template.ts 無法在檔案系統定位到 `templates/` 目錄時，THEN 仍能利用 `BUNDLED_TEMPLATES` 成功渲染出初始設定、Change 提案及任務清單。

#### REQ-TYPES-001: Static Version Resolution Fallback
為了解決獨立執行檔無 `package.json` 可供讀取版本號的問題，`PROSPEC_VERSION` 的讀取須支援透過打包時注入的環境變數進行靜態解析。

**Scenarios:**
- WHEN `process.env.PROSPEC_VERSION` 存在，THEN `PROSPEC_VERSION` 直接使用該環境變數值。
- WHEN 執行 MCP 服務，THEN 透過 `types/version` 統一讀取 `PROSPEC_VERSION`，不使用 `require('../../package.json')`。
- WHEN 在未打包環境（本地開發）下執行，THEN 仍能透過 fallback 讀取 `package.json` 的版本號。

#### REQ-DOCS-001: Standalone Binary Installation Documentation
調整安裝與執行說明，包含根目錄下的英文 README.md 與中文 README.zh-TW.md，以及 docs/ 目錄下的網站安裝說明網頁，提供使用者清晰的 standalone binary 安裝與啟動指引。

**Scenarios:**
- WHEN 查看 README.md 與 README.zh-TW.md，THEN 新增一鍵安裝腳本、standalone binary 下載、以及 npx/devDependency 選項，且移除了 global npm install。
- WHEN 造訪 docs/ 網站，THEN 相關網頁的安裝說明同步調整為一鍵安裝腳本。

## Edge Cases

- **範本找不到的錯誤**：在 Standalone Binary 中執行涉及檔案生成的指令（如 `prospec init`）時，Handlebars 範本讀取機制若預期存取外部 `src/templates` 目錄會崩潰。預期行為：範本內容在打包時需被內嵌於二進位檔中，確保不需外部實體範本檔案即可正常讀取。
- **版本號讀取失敗**：二進位檔沒有 `package.json` 可供 require。預期行為：`PROSPEC_VERSION` 能自靜態環境變數或打包參數中讀取，而不致發生找不到 `package.json` 的錯誤。

## Success Criteria

- **SC-1**: GitHub Release 的 assets 中包含 `prospec-linux-x64`、`prospec-macos-arm64`、`prospec-macos-x64`、`prospec-windows-x64.exe` 等獨立執行檔。
- **SC-2**: 所有二進位檔無須安裝 any 外部 Node.js 執行期環境即可正常運作。
- **SC-3**: 二進位檔支援呼叫包括 `prospec init`、`prospec check`、`prospec serve` 等現有完整指令，且範本載入運作正常。

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-07 | compile-standalone-binary | Implement standalone binary compilation and publish pipeline | US-1, REQ-CLI-001, REQ-LIB-001, REQ-TYPES-001, REQ-DOCS-001 |
