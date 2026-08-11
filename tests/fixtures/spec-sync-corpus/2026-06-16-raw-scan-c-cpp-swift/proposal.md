# Proposal: raw-scan C/C++/Swift 偵測擴充

## Background

`raw-scan-multi-language` 已涵蓋 JS/TS/Python/Go/Rust/Java/C#/Ruby/PHP，但 C/C++/Swift 仍落空：Tech Stack=unknown、Entry Points/Dependencies 空、Config Files 僅 `Makefile` 命中。採方案 A——擴大確定性偵測、語言交由既有 `.prospec.yaml tech_stack` 為權威覆寫；命令式 manifest（`CMakeLists.txt`/`Package.swift`/`conanfile.py`）本質不可靜態解析，留白交 `/prospec-knowledge-generate`（LLM）讀原始碼補足。raw-scan 維持 deterministic、每次重生、不加使用者編輯區塊。

## User Stories

### US-1: C/C++/Swift 結構偵測 [P1]

As a 在 C/C++/Swift 專案跑 prospec 的開發者,
I want raw-scan 列出這些語言的進入點與 build/manifest 檔,
So that 知識生成能掌握專案結構。

**Acceptance Scenarios:**

- WHEN 專案含 `CMakeLists.txt`/`Package.swift`/`vcpkg.json`/`conanfile.txt`/`*.podspec` 等，THEN 列入 Config Files
- WHEN 專案含 `main.c` / `main.cpp` / `main.swift` / `Sources/**/main.swift`，THEN 列入 Entry Points

**Independent Test:** 對 C/C++/Swift fixture 跑 `generateRawScan`，斷言 `configFiles` 與 `entryPoints`。

### US-2: 宣告式 Dependencies 解析 [P2]

As a 使用 vcpkg / Conan 的 C/C++ 開發者,
I want raw-scan 從宣告式 manifest 列出依賴,
So that 依賴不再一片空白。

**Acceptance Scenarios:**

- WHEN 專案含 `vcpkg.json`，THEN 列出其 `dependencies`（字串或 `{name}` 物件）
- WHEN 專案含 `conanfile.txt`，THEN 列出 `[requires]` 區段套件
- WHEN 僅有命令式 manifest（`CMakeLists.txt`/`Package.swift`/`conanfile.py`），THEN Dependencies 留空、不誤列、不拋

**Independent Test:** vcpkg/conan fixture 斷言 `dependencies`；命令式-only fixture 斷言為空。

### US-3: Tech Stack 語言偵測 [P1]

As a 開發者,
I want Swift 與 C/C++ 專案的 Tech Stack 自動標示語言,
So that 技術剖面與真實一致。

**Acceptance Scenarios:**

- WHEN 專案含 `Package.swift`，THEN Tech Stack language=swift、package_manager=spm
- WHEN 含 C/C++ build 檔且掃描檔有 `.cpp/.cc/.cxx/.hpp`，THEN language=c++；僅 `.c/.h`→c；package_manager 依 manifest（vcpkg/conan/meson/cmake）
- WHEN `.prospec.yaml tech_stack` 已設，THEN 仍為權威、覆蓋自動偵測

**Independent Test:** Swift / C / C++ fixture 斷言 `techStack`。

## Edge Cases

- 以單一 `.cpp` 輔助的 C 專案 → 啟發式標 c++（可由 `tech_stack` 覆寫；於文件註明此限制）
- 裸 `Makefile`（無 C/C++ 特定 build 檔）→ 不觸發 C/C++ 語言偵測（過於泛用）
- Swift + vcpkg.json 並存 → Swift 排序在前（language=swift、deps 留空），與 detectTechStack 一致
- 損壞的 vcpkg.json / conanfile.txt → 回空、不拋

## Functional Requirements

- **FR-001**: Config Files pattern 擴充 C/C++/Swift build/manifest 檔
- **FR-002**: Entry Points pattern 擴充 C/C++/Swift 進入點慣例
- **FR-003**: 宣告式 Dependencies 解析（`vcpkg.json`、`conanfile.txt`）；命令式留空
- **FR-004**: Tech Stack 偵測 Swift（`Package.swift`）與 C/C++（build 檔 + 副檔名啟發式）
- **FR-005**: 維持 deterministic / 無網路 / ESM / atomicWrite；`.prospec.yaml tech_stack` 權威不變
- **FR-006**: README 支援語言矩陣補 C/C++/Swift 列

## Success Criteria

- **SC-001**: C/C++/Swift fixture 的 `configFiles` 與 `entryPoints` 命中
- **SC-002**: vcpkg/conan fixture 的 `dependencies` 正確；命令式-only 為空
- **SC-003**: Swift→swift/spm；C/C++ 啟發式語言正確；`tech_stack` 覆寫仍有效
- **SC-004**: 既有測試全綠 + 新測試覆蓋各語言路徑；type-check/lint 乾淨
- **SC-005**: README 矩陣含 C/C++/Swift

## Related Modules

- **lib**: `manifest-parsers`（vcpkg/conan parser）、`detector`（swift/c-c++ 偵測）
- **services**: `raw-scan.service`（dispatch / entry / config）
- **tests**: 各語言 fixture 單元測試

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- INVEST：3 story 獨立可測；TDD：測試先行；依賴方向 cli→services→lib→types 不變；文件繁中；README 同步（原則 5）

## UI Scope

**Scope:** none
