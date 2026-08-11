# Delta Spec: raw-scan-c-cpp-swift

> REQ ID 格式：`REQ-{MODULE}-{NUMBER}`。Feature：`ai-knowledge`。沿用既有 `REQ-KNOW-*`（既有最高 030）。

## ADDED

### REQ-KNOW-031: C/C++/Swift Config Files 與 Entry Points 偵測

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`collectConfigFiles` 與 `detectEntryPoints` 擴充 C/C++/Swift 的 build/manifest 檔與進入點慣例（確定性 pattern，無新依賴）。

**Acceptance Criteria:**
1. Config Files 補：`CMakeLists.txt`、`*.cmake`、`Package.swift`、`Package.resolved`、`*.podspec`、`Podfile`、`conanfile.txt`、`conanfile.py`、`vcpkg.json`、`meson.build`。
2. Entry Points 補：`main.c`/`src/main.c`、`main.cpp`/`main.cc`/`main.cxx`（含 `src/`）、`main.swift`、`Sources/**/main.swift`。
3. 既有 pattern 行為不變；非命中不誤報、不拋。

**Priority:** High

---

### REQ-KNOW-032: 宣告式 Dependencies 解析（vcpkg / Conan）

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`collectDependencies` 解析宣告式 C/C++ manifest，邏輯置於 `lib/manifest-parsers`；命令式 manifest 不解析。

**Acceptance Criteria:**
1. `vcpkg.json` 的 `dependencies` 列出（字串項；或 `{ "name", "version>=" }` 物件取 name 與 version）。
2. `conanfile.txt` 的 `[requires]` 區段列出（`pkg/version` → name + version）。
3. 僅含命令式 manifest（`CMakeLists.txt`/`Package.swift`/`conanfile.py`）時 Dependencies 留空、不誤列。
4. 解析失敗回空不拋；scan 無網路；依賴方向 `cli → services → lib → types` 不變；無新增 runtime 依賴。

**Priority:** Medium

---

### REQ-KNOW-033: Tech Stack 偵測 Swift 與 C/C++

**Feature:** ai-knowledge
**Story:** US-3

**Description:**
`autoDetectTechStack` 擴充 Swift 與 C/C++ 語言／套件管理器偵測（用既有 `files` 參數做 tree-wide 與副檔名判定）。

**Acceptance Criteria:**
1. `Package.swift`→language=swift、package_manager=spm。
2. C/C++ 特定 build 檔（`CMakeLists.txt`/`*.cmake`/`conanfile.*`/`vcpkg.json`/`meson.build`，**不含裸 `Makefile`**）存在時：掃描檔含 `.cpp/.cc/.cxx/.hpp/.hh/.hxx`→c++、僅 `.c/.h`→c；package_manager 依 manifest（`vcpkg`/`conan`/`meson`/`cmake`）。
3. 偵測順序中 Swift 排在 C/C++ 前，且 `collectDependencies` 同序（Swift→`[]` 短路），兩區塊不矛盾。
4. `.prospec.yaml tech_stack` 仍為任意語言的權威覆寫；既有語言偵測行為不變。

**Priority:** High

---

## MODIFIED

_No modifications in this change._（沿用既有 `detectTechStack(cwd, config, files)` 簽章與 raw-scan 模板，皆不變。）

## REMOVED

_No removals in this change._
