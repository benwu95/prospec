# Proposal: raw-scan 後端多語言支援強化

## Background

`raw-scan.service.ts` 與 `detector.ts` 的偵測高度偏 JS/TS：Entry Points 只認 `[tj]sx?`、Dependencies 只讀 `package.json` 與 `requirements.txt`（純 Poetry `pyproject.toml` 會得到空依賴）、Tech Stack 無法辨識 Go/Rust/Java/C#/Ruby/PHP，且 `collectDependencies` docstring 宣稱支援 `go.mod` 卻無實作。`raw-scan.md` 是 `/prospec-knowledge-generate` 的輸入，偏 JS/TS 會讓非-JS 專案（含 dogfood 目標 olfparser）的知識生成失準。

## User Stories

### US-1: Dependencies 支援後端生態 [P1]

As a 在後端專案跑 prospec 的開發者,
I want raw-scan 從各語言的依賴宣告檔正確列出依賴,
So that 知識生成能看到真實依賴而非空白。

**Acceptance Scenarios:**

- WHEN 專案為 pyproject-only（Poetry 或 PEP 621），THEN Dependencies 列出宣告依賴（非空）
- WHEN 專案含 `go.mod`，THEN Dependencies 列出 require 區塊依賴
- WHEN 專案含 `Cargo.toml` / `composer.json` / `pom.xml` / `*.csproj`，THEN 依各自格式列出依賴

**Independent Test:** 對各語言 fixture 跑 `generateRawScan`，斷言 `dependencies` 內容。

### US-2: Tech Stack 與 Entry Points 辨識後端語言 [P1]

As a 在後端專案跑 prospec 的開發者,
I want raw-scan 正確標示後端專案的語言／套件管理器與進入點,
So that 技術剖面與真實一致。

**Acceptance Scenarios:**

- WHEN `go.mod` / `Cargo.toml` / `pom.xml` / `build.gradle` / `*.csproj` / `Gemfile` / `composer.json` 存在，THEN Tech Stack 的 language 與 package_manager 正確
- WHEN 後端進入點存在（`main.go`、`src/main.rs`、`__main__.py`、`[project.scripts]`…），THEN Entry Points 列出

**Independent Test:** 各語言 fixture 斷言 `techStack` 與 `entryPoints`。

### US-3: 排版重排與 Config Files 擴充 [P2]

As a 閱讀 raw-scan.md 的人,
I want 輸出依「技術剖面／專案結構」分組，且後端 build 檔被列為 config,
So that 文件更易讀且涵蓋後端工具鏈。

**Acceptance Scenarios:**

- WHEN 產生 raw-scan.md，THEN section 順序為 Tech Stack → Entry Points → Dependencies → Config Files → Directory Tree → File Stats
- WHEN 專案含 `pom.xml` / `build.gradle` / `*.csproj` / `Gemfile` / `composer.json`，THEN 列入 Config Files

**Independent Test:** 斷言模板輸出順序與 config 清單。

## Edge Cases

- 多語言混合 repo（同時有 `package.json` 與 `pyproject.toml`）：依既有優先序，明確化行為並標示
- `requirements.txt` 含 `-r`/`-e`/markers/extras/`--hash`：盡力解析、接受 partial coverage、不誤列
- 損壞或非預期格式 manifest：解析失敗回空、不拋（沿用既有 try/catch 容錯）
- 無依賴宣告：Dependencies 顯示 `_No dependencies detected_`

## Functional Requirements

- **FR-001**: Dependencies 依生態分派解析（pyproject/Cargo/go.mod/composer/pom/csproj + requirements 強化）
- **FR-002**: Tech Stack 偵測表擴充至主流後端語言與其 package_manager
- **FR-003**: Entry Points 偵測後端慣例（best-effort）
- **FR-004**: Config Files pattern 擴充後端 build 檔
- **FR-005**: raw-scan.md section 重排為技術剖面／專案結構兩組
- **FR-006**: 新增解析 helper 集中於 lib，維持依賴方向；全程確定性、無網路、ESM
- **FR-007**: `collectDependencies` docstring 與實作一致（`go.mod` 真正支援）

## Success Criteria

- **SC-001**: pyproject-only / go.mod / Cargo / composer / pom / csproj fixture 各自 `dependencies` 非空且正確
- **SC-002**: 後端語言 fixture 的 `techStack.language` 與 `package_manager` 正確
- **SC-003**: 後端進入點 fixture 的 `entryPoints` 命中
- **SC-004**: raw-scan.md 區塊順序符合 FR-005；後端 build 檔列入 Config Files
- **SC-005**: 僅新增 `smol-toml` + `fast-xml-parser`；皆 permissive license；scan 無網路呼叫
- **SC-006**: 既有 raw-scan/detector 測試全綠；新測試覆蓋各語言路徑

## Related Modules

- **lib**: `detector`（Tech Stack）、新 `manifest-parsers`（依賴／進入點解析）
- **services**: `raw-scan.service`（四區塊組裝）
- **templates**: `raw-scan.md.hbs`（區塊重排，已完成）
- **tests**: 各語言 fixture 單元測試

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- INVEST：三個 story 獨立可測；TDD：測試先行；依賴方向 cli→services→lib→types 不變；文件繁中；README 視 user-facing surface 於實作中更新（[SHOULD]）

## UI Scope

**Scope:** none
