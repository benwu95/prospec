# Proposal: compile-standalone-binary

## Background

目前 prospec 是一套 Node.js / TypeScript 工具，使用者需要安裝 Node.js (>=22.13.0) 與 pnpm 才能編譯與執行本工具，這對非 Node.js 開發者或是在乾淨的 CI/CD 環境下使用極不方便。本變更旨在利用 Bun 的編譯機制，在發布 Release 時自動建置各作業系統平台的 Standalone Binary 二進位執行檔並上傳，免除使用者的環境安裝障礙。

---

## User Stories

### US-1: 下載並執行 Standalone Binary [P1]

As a 下游專案的開發者，
I want 直接下載適用於我作業系統平台的 prospec 獨立執行檔並在終端機中執行，
So that 我不需要在機器上另外安裝 Node.js 就能直接使用 prospec 進行 Spec-Driven Development。

**Acceptance Scenarios:**

- WHEN 在乾淨無 Node.js 環境的 Linux/macOS/Windows 下執行下載的 `prospec --version`，THEN 成功印出當前版本。
- WHEN 在下游專案目錄下執行 `prospec check`，THEN 可以正常進行漂移稽核並輸出稽核結果。

**Independent Test:**
在未安裝 Node.js 的乾淨 Docker 容器（例如 ubuntu:latest）或環境下，下載對應平台的二進位檔，執行 `prospec --version` 與 `prospec check`，驗證輸出與執行狀態。

---

## Edge Cases

- **範本找不到的錯誤**：在 Standalone Binary 中執行涉及檔案生成的指令（如 `prospec init`）時，Handlebars 範本讀取機制若預期存取外部 `src/templates` 目錄會崩潰。預期行為：範本內容在打包時需被內嵌於二進位檔中，確保不需外部實體範本檔案即可正常讀取。
- **版本號讀取失敗**：二進位檔沒有 `package.json` 可供 require。預期行為：`PROSPEC_VERSION` 能自靜態環境變數或打包參數中讀取，而不致發生找不到 `package.json` 的錯誤。

---

## Functional Requirements

- **FR-001**：在發布 GitHub Release 時，自動觸發建置 GitHub Actions 並編譯出 Linux x64、macOS arm64/x64、Windows x64 的二進位檔。
- **FR-002**：必須使用 Bun 的建置編譯機制將 CLI 程式碼、相依套件以及所有 `.hbs` 範本封裝入 Standalone 二進位檔中。
- **FR-003**：產出的 binary 必須支援現行所有的 `prospec` 指令與參數。
- **FR-004**：必須對 macOS 的二進位檔進行程式碼簽章（codesign），以避免作業系統封鎖。
- **FR-005**：`PROSPEC_VERSION` 的讀取須向下相容，在非打包環境（本地開發/測試）中仍可正確讀取 `package.json` 的版本。
- **FR-006**：調整安裝與執行說明，包含 `README.md`、`README.zh-TW.md` 及 `docs/` 目錄下的網站安裝文件。

---

## Success Criteria

- **SC-001**：GitHub Release 的 assets 中包含 `prospec-linux-x64`、`prospec-macos-arm64`、`prospec-macos-x64`、`prospec-windows-x64.exe` 等獨立執行檔。
- **SC-002**：所有二進位檔無須安裝 any 外部 Node.js 執行期環境即可正常運作。
- **SC-003**：二進位檔支援呼叫包括 `prospec init`、`prospec check`、`prospec serve` 等現有完整指令，且範本載入運作正常。
- **SC-004**：所有的測試套件（vitest）在本地與 CI 均能 100% 通過，本地開發與 E2E 測試不受編譯架換調整之影響。
- **SC-005**：`README.md`、`README.zh-TW.md` 與 `docs/` 內的安裝與執行說明均更新完成，與二進位檔使用方式一致。

---

## Related Modules

- **cli**：CLI 指令與進入點（[src/cli](file:///Users/ben.hy.wu/workspace/prospec/src/cli)）需要調整其封裝與 bundle 指令，以利 Bun 編譯。
- **lib**：範本讀取模組（[src/lib/template.ts](file:///Users/ben.hy.wu/workspace/prospec/src/lib/template.ts)）需要設計記憶體範本對照表，以內嵌 Handlebars 範本。
- **types**：版本號宣告（[src/types/version.ts](file:///Users/ben.hy.wu/workspace/prospec/src/types/version.ts)）需要調整 `PROSPEC_VERSION` 的載入來源，使其在打包期靜態化。

---

## Open Questions

- [ ] **NEEDS CLARIFICATION**：Bun 的 `bun build --compile` 會將 Bun 自身執行期封裝進去，產生的執行檔檔案大小（約 40-90MB）是否可以被接受？
- [ ] **NEEDS CLARIFICATION**：macOS codesign 的簽章證書在 GitHub runner 上是否使用 ad-hoc codesign（`codesign --sign -`）即可滿足下游專案開發者的信任需求？

---

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified / Violations noted: 過程中新增與更新的 `proposal.md`、`plan.md` 等均符合繁體中文語系政策，而修改的程式碼與 commit message 維持英文。

---

## UI Scope

**Scope:** none
