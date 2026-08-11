# Delta Spec: compile-standalone-binary

## ADDED

### REQ-CLI-001: Standalone Binary Compilation for Multi-Platform

**Feature:** standalone-binary
**Story:** US-1

**Description:**
在 GitHub 發布 Release 時，自動觸發建置管線編譯出 Linux x64、macOS arm64/x64、Windows x64 的 Standalone Binary 獨立執行檔，並完成 macOS 的 codesign。

**Acceptance Criteria:**
1. 發布 Release 後，assets 中包含 prospec-linux-x64、prospec-macos-arm64、prospec-macos-x64、prospec-windows-x64.exe。
2. macOS 二進位檔已完成 codesign ad-hoc 簽署，能在 macOS 系統下執行。
3. 二進位檔無須外部 Node.js 執行期環境即可單獨執行。

**Priority:** High

---

### REQ-LIB-001: Template Embedded Compilation

**Feature:** standalone-binary
**Story:** US-1

**Description:**
為了解決獨立執行檔無法存取外部檔案系統中範本的問題，必須在打包編譯前，將所有 `.hbs` 範本內容聚合成一個記憶體對照字典，並於執行期優先自該字典中讀取。

**Acceptance Criteria:**
1. 執行 `pnpm run bundle` 時，會先自動生成 `src/lib/bundled-templates.ts`。
2. 當執行期 template.ts 無法在檔案系統定位到 `templates/` 目錄時，仍能利用 `BUNDLED_TEMPLATES` 成功渲染出初始設定、Change 提案及任務清單。

**Priority:** High

---

### REQ-TYPES-001: Static Version Resolution Fallback

**Feature:** standalone-binary
**Story:** US-1

**Description:**
為了解決獨立執行檔無 `package.json` 可供讀取版本號的問題，`PROSPEC_VERSION` 的讀取須支援透過打包時注入的環境變數進行靜態解析。

**Acceptance Criteria:**
1. 若 `process.env.PROSPEC_VERSION` 存在，`PROSPEC_VERSION` 直接使用該環境變數值。
2. 移除 `mcp.service.ts` 中的 `require('../../package.json')`，改為自 `types/version` 統一讀取 `PROSPEC_VERSION`。
3. 未打包環境（本地開發）下，仍能透過 fallback 讀取 `package.json` 的版本號。

**Priority:** High

---

### REQ-DOCS-001: Standalone Binary Installation Documentation

**Feature:** standalone-binary
**Story:** US-1

**Description:**
調整安裝與執行說明，包含根目錄下的英文 README.md 與中文 README.zh-TW.md，以及 docs/ 目錄下的網站安裝說明網頁，提供使用者清晰的 standalone binary 安裝與啟動指引。

**Acceptance Criteria:**
1. README.md 與 README.zh-TW.md 中的 CLI 部分已新增 standalone binary 的下載、加執行權限與使用說明。
2. docs/ 內相關安裝網頁的安裝說明同步調整為二進位執行檔的執行流程，保持網頁內容最新。

**Priority:** Medium

---

