# Delta Spec: raw-scan-multi-language

> REQ ID 格式：`REQ-{MODULE}-{NUMBER}`。Feature：`ai-knowledge`（raw-scan 歸屬）。沿用既有 `REQ-KNOW-*` 序列（既有最高 026）。

## ADDED

### REQ-KNOW-027: Dependencies 多生態依賴解析

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
`collectDependencies` 依專案檔案分派解析多語言依賴宣告，解析邏輯集中於新 lib 模組 `manifest-parsers`，維持確定性與依賴方向；docstring 與實作一致。

**Acceptance Criteria:**
1. `pyproject.toml`（Poetry `[tool.poetry.dependencies]` 與 PEP 621 `[project.dependencies]`/`[project.optional-dependencies]`）經 `smol-toml` 解析列出依賴。
2. `go.mod` 的 require（block 與單行）列出；`replace`/`exclude`/`retract` 不誤收。
3. `Cargo.toml`（`[dependencies]`/`[dev-dependencies]`/`[build-dependencies]`）、`composer.json`（`require`/`require-dev`）、`pom.xml`、`*.csproj`（`PackageReference`）各自列出。
4. `requirements.txt` 強化掃描：忽略 `-r`/`-c`/`-e`/`--hash`、處理行接續與 inline 註解、剝除 markers 與 extras，不誤列。
5. 解析失敗回空不拋；scan 全程無網路；依賴方向 `cli → services → lib → types` 不變。

**Priority:** High

---

### REQ-KNOW-028: Tech Stack 後端語言與套件管理器偵測

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`autoDetectTechStack` 擴充至主流後端語言的語言／套件管理器偵測。

**Acceptance Criteria:**
1. `go.mod`→Go/go modules；`Cargo.toml`→Rust/cargo；`pom.xml`→Java/maven、`build.gradle(.kts)`→Java(/Kotlin)/gradle；`*.csproj`→C#/nuget；`Gemfile`→Ruby/bundler；`composer.json`→PHP/composer。
2. `.prospec.yaml` 的 `tech_stack` 仍為權威、覆蓋自動偵測；`source` 標示維持 config/auto-detected/mixed。
3. 既有 JS/TS/Python 偵測行為不變。

**Priority:** High

---

### REQ-KNOW-029: Entry Points 後端慣例偵測

**Feature:** ai-knowledge
**Story:** US-2

**Description:**
`detectEntryPoints` 擴充後端進入點慣例（best-effort 啟發式）。

**Acceptance Criteria:**
1. Python（pyproject `[project.scripts]`/`[tool.poetry.scripts]` 目標、`__main__.py`、`main.py`/`app.py`、`manage.py`）、Go（`main.go`、`cmd/*/main.go`）、Rust（`Cargo.toml [[bin]]`、`src/main.rs`、`src/bin/*.rs`）、Java（`Application`/`Main`/`App.java` 檔名啟發式）、C#（csproj `OutputType=Exe`）、Ruby（`Gemfile` 存在時 `bin/`、`exe/` 可執行檔）列出。
2. 既有 `package.json` main/bin 與 JS/TS pattern 行為不變。
3. 非命中時不誤報、不拋。

**Priority:** Medium

---

### REQ-KNOW-030: Config Files 後端 build 檔擴充

**Feature:** ai-knowledge
**Story:** US-3

**Description:**
`collectConfigFiles` pattern 補後端 build/manifest 檔。

**Acceptance Criteria:**
1. `pom.xml`、`build.gradle`、`build.gradle.kts`、`*.csproj`、`Gemfile`、`Gemfile.lock`、`composer.json`、`composer.lock` 列入 Config Files。
2. 既有 pattern 命中不變。

**Priority:** Medium

---

## MODIFIED

### REQ-KNOW-022: raw-scan.md section 順序

**Feature:** ai-knowledge
**Story:** US-3

**Before:**
順序為 Tech Stack / Entry Points / Directory Tree / Dependencies / Config Files / File Stats。

**After:**
順序為 Tech Stack / Entry Points / Dependencies / Config Files / Directory Tree / File Stats（技術剖面群相鄰、專案結構群相鄰）。內容欄位不變。

**Reason:**
原順序將 Directory Tree 夾在技術剖面區塊間、File Stats 落單於末，分組不一致；重排提升可讀性。

**Priority:** Low

---

## REMOVED

_No removals in this change._
