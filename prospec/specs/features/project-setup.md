---
feature: project-setup
status: active
last_updated: 2026-07-12
story_count: 18
req_count: 43
---

# 專案啟動

## Who & Why

**服務對象**：AI-First 開發者、獨立開發者、技術主管

**解決問題**：開發者在專案中導入 SDD 流程需手動建立大量配置檔與目錄結構，過程繁瑣且易遺漏。Prospec 透過 `prospec init` 一鍵初始化，讓開發者在 3 分鐘內完成 SDD 專案設定。

**為什麼重要**：專案啟動是 SDD 流程的起點，初始結構不完整則後續階段無法運作。良好的 CLI 基礎設施確保開發者在任何階段都能快速定位問題。

## User Stories & Behavior Specifications

### US-001: CLI 基礎框架 [P0]

身為開發者，
我希望有結構化的 CLI 入口，支援 `--help`、`--version` 和子指令路由，
以便我能探索所有可用指令並了解工具版本。

**Acceptance Scenarios:**
- WHEN 執行 `prospec --help` THEN 顯示所有可用指令及說明
- WHEN 執行 `prospec --version` THEN 顯示版本號
- WHEN 輸入錯誤指令（如 `prospec inti`）THEN 顯示錯誤並建議正確指令

#### REQ-SETUP-001: CLI 入口與指令路由
提供 `prospec` 指令，支援 `--help`、`--version`、子指令路由，遵循 `prospec <command>` 或 `prospec <resource> <action>` 模式。

**Scenarios:**
- WHEN executing `prospec --help`, THEN display all available commands with descriptions
- WHEN executing `prospec --version`, THEN display version from package.json
- WHEN entering invalid command (e.g., `prospec inti`), THEN suggest similar valid commands
- WHEN single-action command (e.g., `init`), THEN use `prospec <command>` format
- WHEN multi-action resource (e.g., change), THEN use `prospec <resource> <action>` format

### US-002: Config 驗證與錯誤處理 [P0]

身為開發者，
我希望 `.prospec.yaml` 有 Schema 驗證，且所有指令提供有意義的錯誤訊息，
以便我能快速定位配置問題並修正。

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` 缺少必填欄位 THEN 顯示具體欄位名稱
- WHEN 指令執行失敗 THEN 錯誤訊息包含問題描述與修正建議
- WHEN 加上 `--verbose` THEN 輸出每一步驟的詳細資訊

#### REQ-SETUP-002: Config Schema 驗證
`.prospec.yaml` 使用 Zod 進行 Schema 定義與驗證，缺少必填欄位時提供具體錯誤訊息。

**Scenarios:**
- WHEN `.prospec.yaml` is valid, THEN successfully parse all fields via Zod schema
- WHEN missing `project.name`, THEN display "project.name is required"
- WHEN multiple required fields missing, THEN list all missing fields
- WHEN contains unknown fields, THEN warn but don't block; suggest correct name if typo

#### REQ-SETUP-003: 錯誤訊息與 Debug 模式
所有指令提供有意義的錯誤訊息，支援 `--verbose` 輸出詳細步驟。

**Scenarios:**
- WHEN command fails, THEN error includes problem description + suggested fix
- WHEN encountering ProspecError, THEN display error code + message + suggestion
- WHEN `--verbose` added, THEN output detailed info for each step
- WHEN no `--verbose`, THEN only output result summary

### US-003: 專案初始化 [P0]

身為開發者，
我希望執行 `prospec init` 即可建立完整的 SDD 專案骨架，
以便我能立即開始 Spec-Driven 開發流程。

**Acceptance Scenarios:**
- WHEN 在空目錄執行 `prospec init` THEN 建立 `.prospec.yaml`、AI Knowledge 目錄、Constitution、AGENTS.md、`{base_dir}/README.md`（Prospec 簡介）
- WHEN `.prospec.yaml` 已存在 THEN 顯示警告並退出
- WHEN 偵測到 package.json THEN 自動辨識為 TypeScript/Node
- WHEN 偵測到已安裝的 AI CLI THEN 互動式選單讓使用者勾選

#### REQ-SETUP-004: 建立專案結構
執行 `prospec init` 時建立所有必要檔案與目錄：`.prospec.yaml`、`AGENTS.md`、`{base_dir}/README.md`（Prospec 簡介，見 REQ-SETUP-023）、根層級 `{base_dir}/index.md`、`{base_dir}/ai-knowledge/`（含 `_conventions.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`、`_diagram-conventions.md`）、`{base_dir}/CONSTITUTION.md`、`{base_dir}/specs/`。寫入採 per-file skip-if-exists（見 REQ-SETUP-018）：既有檔一律保留、只建缺檔；單檔 gate（`.prospec.yaml` 存在即退出）行為不變。

**Scenarios:**
- WHEN executing `prospec init` in empty directory, THEN create all required files and directories
- WHEN `{base_dir}/index.md` created, THEN contains empty module table
- WHEN `CONSTITUTION.md` created, THEN contains Principles, Constraints, Quality Standards templates
- WHEN `.prospec.yaml` already exists, THEN show warning and exit without modification (single-file gate unchanged)
- WHEN `.prospec.yaml` is absent but curated files remain (recovery), THEN rebuild only the missing files; existing files stay byte-identical

#### REQ-SETUP-023: 專案內 Prospec 簡介 README
`prospec init` 在 `{base_dir}/README.md` 產生一份 English 簡介 README，讓採用專案的其他開發者就地理解 Prospec。內容濃縮自根 `README.md` 開頭的「What is Prospec?」——以 Skills / AI Knowledge / CLI 三元件協作說明 Prospec——並於結尾附指向 `https://github.com/benwu95/prospec` 的完整說明連結。此 doc 由 `INIT_DOC_REGISTRY` 的獨立 `base` 條目派生（`root: 'base'`, `output: 'README.md'`, 標準 init context, 非 `asKnowledgeInitDoc` 派生），沿用 init 既有 per-file skip-if-exists 與 upgrade docs inventory（皆依 registry 自動涵蓋）；template 全英文（REQ-TEMPLATES-073）。

**Scenarios:**
- WHEN executing `prospec init`, THEN create `{base_dir}/README.md` containing the Skills / AI Knowledge / CLI three-piece summary and the `https://github.com/benwu95/prospec` link
- WHEN `{base_dir}/README.md` already exists, THEN per-file skip-if-exists preserves it byte-for-byte
- WHEN executing `prospec upgrade`, THEN the docs inventory reports this README present/MISSING at its actual location (registry-derived)
- WHEN inspecting `INIT_DOC_REGISTRY`, THEN README is a standalone `base` entry, not projected from a convention list via `asKnowledgeInitDoc`

#### REQ-SETUP-005: 自動偵測技術棧
自動偵測程式語言、框架與套件管理器，無法辨識時不阻斷初始化。

**Scenarios:**
- WHEN project has `package.json`, THEN detect as TypeScript/Node
- WHEN project has `pyproject.toml`, THEN detect as Python
- WHEN no recognizable markers, THEN `tech_stack` left empty, init completes normally

#### REQ-SETUP-006: 偵測已安裝的 AI CLI
自動偵測系統已安裝的 AI CLI 工具（Claude Code、Antigravity CLI、Copilot、Codex），提供互動式勾選。

**Scenarios:**
- WHEN `~/.claude` exists, THEN detect Claude Code and pre-check
- WHEN `~/.gemini/antigravity-cli` exists, THEN detect Antigravity CLI and pre-check
- WHEN user unchecks detected CLI, THEN `.prospec.yaml` agents excludes it
- WHEN user checks uninstalled CLI, THEN remind but allow adding
- WHEN detection complete, THEN suggest `prospec agent sync`

#### REQ-SETUP-007: 可配置的專案名稱
支援 `--name` 旗標覆蓋自動偵測的目錄名稱。

**Scenarios:**
- WHEN no `--name`, THEN use directory name as project name
- WHEN `--name my-project`, THEN `.prospec.yaml` project.name set accordingly

#### REQ-SETUP-014: 生成 Canonical Convention Docs
`prospec init` 在 `{base_dir}/ai-knowledge/` 生成三份 prospec 自帶、語言中立的 convention docs，作為 Knowledge 生成與狀態流轉的單一真實來源。

**Scenarios:**
- WHEN executing `prospec init`, THEN generate `_status-lifecycle.md` (canonical change status state machine), `_module-readme-conventions.md` (module README structure + marker contract), and `_diagram-conventions.md` (Mermaid diagram rules)
- WHEN convention docs created, THEN `{base_dir}/index.md` links to them
- WHEN knowledge-generate / knowledge-update run, THEN defer to these docs as the single source of truth

### US-005: Base Directory 設定 [P1]

身為使用 Prospec 的開發者，
我希望 Prospec 產出物放在可配置的 `prospec/` 目錄下而非硬編碼路徑，
以便 Prospec 輸出有清晰的品牌命名空間，與一般專案文件分離。

**Acceptance Scenarios:**
- WHEN `prospec init` 互動模式 THEN 提示選擇 artifacts 目錄（預設 `prospec`）
- WHEN 非互動模式 THEN 使用預設 base directory
- WHEN 所有 Service 需要路徑 THEN 統一使用 `resolveBasePaths()`

#### REQ-SETUP-011: Base Directory 常數與路徑解析
定義 `DEFAULT_BASE_DIR` 常數，`resolveBasePaths()` 從 config 衍生所有標準路徑。

**Scenarios:**
- WHEN base_dir not configured, THEN use default value
- WHEN configured in `.prospec.yaml`, THEN use configured value
- WHEN legacy config has no base_dir, THEN backwards-compatible using `'docs'`
- WHEN config has `paths.base_dir`, THEN derive knowledgePath, constitutionPath, specsPath
- WHEN any service needs paths, THEN uniformly use `resolveBasePaths()`

#### REQ-SETUP-012: Init 互動式 Base Directory 選擇
`prospec init` 互動式提示 base directory 選擇。

**Scenarios:**
- WHEN interactive mode, THEN prompt "Prospec artifacts directory?" (default `prospec`)
- WHEN non-interactive mode, THEN use default base directory
- WHEN user enters custom name, THEN write to `.prospec.yaml` paths.base_dir

### US-006: 第一次使用 Prospec [P0]

身為第一次接觸 Prospec 的開發者，
我希望從安裝到完成第一個 SDD 流程的體驗流暢且有引導，
以便我能在 10 分鐘內理解 Prospec 的價值並開始使用。

**Acceptance Scenarios:**
- WHEN 安裝後執行 `prospec --help` THEN 看到清晰的指令列表
- WHEN 執行 `prospec init` THEN 互動式引導完成所有設定
- WHEN 初始化完成 THEN 輸出摘要含下一步建議
- WHEN 執行 `prospec knowledge init` THEN 掃描專案並產出 raw-scan.md 與知識骨架

#### REQ-SETUP-013: 首次使用引導流程
初始化完成後提供清晰的下一步建議與操作摘要。

**Scenarios:**
- WHEN init complete, THEN output summary with created files, next steps (`prospec knowledge init`, `prospec agent sync`), estimated time
- WHEN knowledge init complete, THEN suggest next action based on project state

### US-007: 可執行 Constitution [P1]

身為使用 Prospec 的開發者，
我希望 `prospec init` 產出帶嚴重度的引導式 Constitution 規則（而非空模板），
以便 Constitution 從第一天就可用，且 verify 能依嚴重度分級回報。

**Acceptance Scenarios:**
- WHEN 在某 tech stack 專案執行 `prospec init` THEN CONSTITUTION.md 含 3-5 條相稱、帶 MUST/SHOULD/MAY 的具體規則
- WHEN tech stack 無法判定 THEN 給語言中立通用規則，仍非空白
- WHEN verify 遇帶嚴重度的規則 THEN MUST 違反→FAIL、SHOULD→WARN、MAY→資訊性提示（不影響 grade）

#### REQ-TYPES-021: Constitution Rule Type
定義 `ConstitutionRule`（RFC-2119 severity + name / description / rationale / optional check）。
- WHEN a rule is defined, THEN severity is one of MUST / SHOULD / MAY

#### REQ-LIB-012: Stack-Appropriate Example Rules
`lib/constitution-rules.ts` 的純函式 `exampleRulesFor(techStack)` 依語言回 3-5 條帶 severity 的引導規則。
- WHEN language is python, THEN return python rules including an authentication rule
- WHEN language is unknown or undetected, THEN return language-neutral rules
- WHEN any stack, THEN 3-5 rules, each with a severity, at least one MUST

#### REQ-SERVICES-026: Init Wires Example Rules
`init.service` 將 `exampleRulesFor(techStack)` 結果作為 `example_rules` 傳入 Constitution 模板。
- WHEN `prospec init` runs, THEN the constitution template context includes `example_rules`

#### REQ-TEMPLATES-062: Guided Structured Constitution Template
`init/constitution.md.hbs` 以 `{{#each example_rules}}` 渲染 `### [SEVERITY] Name` + Rationale + Verify，取代空 placeholder。
- WHEN rendered, THEN output has severity-tagged rules and no `[Principle Name]` placeholder

#### REQ-TESTS-021: Constitution Rules + Format Tests
`exampleRulesFor` 單元測試 + constitution.hbs / verify 嚴重度 contract test。
- WHEN tests run, THEN they cover python/typescript/fallback rule sets and template severity rendering

### US-008: Init 語言選擇與 Language Policy [P1]

身為非英文母語的專案擁有者，
我希望在 `prospec init` 時選擇文件主要語言，並讓 Language Policy 自動寫入 Constitution，
以便所有 AI 產出文件使用我的語言，而不需手動編輯 Constitution。

**Acceptance Scenarios:**
- WHEN 互動式 init THEN 出現主要語言提示（預設 English、可自訂輸入）
- WHEN `init --language X` THEN 跳過提示並採用 X
- WHEN CI 模式（`--agents`）無 flag THEN 採用 English 且零互動
- WHEN init 完成 THEN `.prospec.yaml` 記錄 `artifact_language` 且 CONSTITUTION.md 含 [MUST] Language Policy

#### REQ-SETUP-015: Init Primary Language Selection
`prospec init` 提供主要語言選擇：互動 input（預設 "English"）、`--language <lang>` flag、CI 模式預設 English。

**Scenarios:**
- WHEN interactive init, THEN prompt for the document language with default English
- WHEN `--language X` (including `--language ""`), THEN skip the prompt; blank resolves to English
- WHEN CI mode without the flag, THEN English with zero interaction

#### REQ-TYPES-025: Config Language and Skill Triggers Schema
`ProspecConfigSchema` 新增 optional `artifact_language`（自由字串）與 `skill_triggers`（skill 名稱 → 字串陣列）。

**Scenarios:**
- WHEN the fields are absent, THEN legacy `.prospec.yaml` still validates; consumers treat the language as English
- WHEN `skill_triggers` values are not string arrays, THEN validation fails (ConfigInvalid)

#### REQ-LIB-013: Language Policy Constitution Rule
`languagePolicyRule(language)` 回傳 [MUST] 規則 — 所有 AI 產出文件（change artifacts + AI Knowledge）使用主要語言，程式碼與專業術語一律英文；init 將其置於 `example_rules` 首位。

**Scenarios:**
- WHEN `init --language X`, THEN CONSTITUTION.md contains a [MUST] Language Policy rule rendering X
- WHEN no language chosen, THEN the rule renders English

### US-009: CLI 輸出英文化 [P2]

身為任意語系的 prospec CLI 使用者，
我希望 CLI 的 option 說明、錯誤訊息與執行輸出皆為英文，
以便 CLI 行為與「產物英文 baseline」定位一致，且錯誤訊息可被搜尋。

**Acceptance Scenarios:**
- WHEN `prospec --help` 與各子指令 help THEN 說明文字為英文
- WHEN 觸發任何錯誤 THEN 訊息（含 suggestion）為英文

#### REQ-SETUP-016: CLI Runtime Output in English
CLI option 說明、錯誤訊息（含 `suggestion`）、stdout/stderr 輸出統一英文。

**Scenarios:**
- WHEN running any help or error path, THEN output contains no CJK characters
- WHEN scanning `src/`, THEN zero files contain CJK characters

### US-010: Quickstart 一鍵啟動 [P1]

身為導入 prospec 的開發者，
我希望一個 CLI 指令完成決定性 scaffold、再以一個 slash command 在 agent 端收尾，
以便 brownfield onboarding 壓到 2 個輸入步驟（含非英文專案），其餘自動化。

**Acceptance Scenarios:**
- WHEN 在未初始化專案執行 `prospec quickstart` THEN 完成 init + agent sync 並印出下一步 `/prospec-quickstart`
- WHEN 在已初始化專案重跑 THEN 跳過 init、exit 0、仍抵達下一步引導
- WHEN 無 agent 設定 THEN 以清楚訊息提示，而非 stack trace

> AI Knowledge 生成需 LLM 讀 source，CLI 無法獨力完成 — CLI→agent 的 context switch 是 2 步下限；其餘（trigger 在地化、knowledge 生成）由 `/prospec-quickstart` skill 自動收尾（見 agent-integration US-431）。

#### REQ-SETUP-017: Quickstart One-Command Onboarding
`prospec quickstart` 串接 init + agent sync（跳過已完成步驟），印出 agent 端下一步；註冊於 `INIT_COMMANDS`，在 `.prospec.yaml` 存在前可執行；`--name`/`--agents`/`--language` 透傳 init。

**Scenarios:**
- WHEN executing `prospec quickstart` in an uninitialized project, THEN run init + agent sync and print the next action (`/prospec-quickstart`)
- WHEN re-run on an initialized project, THEN init is skipped, exit 0, and next-step guidance is still printed
- WHEN no agent is configured, THEN surface a `PrerequisiteError` with actionable guidance, not a stack trace
- WHEN run before `.prospec.yaml` exists, THEN the config-existence preAction gate does not block it (registered in `INIT_COMMANDS`)

#### REQ-SERVICES-028: Quickstart Orchestrator Service
`quickstart.service.execute()` 依序呼叫 sibling `init`（catch `AlreadyExistsError` → 標記 skipped）與 `agentSync`，聚合 per-step 狀態並透傳 hints；刻意不呼叫 knowledge-init（LLM 工作歸 `/prospec-quickstart` skill）。

**Scenarios:**
- WHEN init throws `AlreadyExistsError`, THEN catch it and mark the init step skipped without aborting the run
- WHEN agent-sync returns hints (non-English language + empty `skill_triggers`), THEN the result forwards them for display
- WHEN orchestrating, THEN it does not run knowledge init, and the dependency direction `cli → services` is preserved (service-orchestrates-service, cf. change-resolver)

---

### US-011: init 不再覆寫既有 curated 檔 [P1]

身為刪除 `.prospec.yaml` 後重跑 init/quickstart 的 prospec 使用者，
我希望 init 對既有 trust-zone 檔案逐檔跳過、只重建缺少的檔，
以便我絕不會因為重跑初始化而遺失已策劃的 Constitution 原則、`_conventions` 與根層級 `index.md`。

**Acceptance Scenarios:**
- WHEN 在已有 trust-zone 的專案刪除 `.prospec.yaml` 後重跑 `prospec init`, THEN 只重建 `.prospec.yaml`，`CONSTITUTION.md`/`_conventions.md`/根層級 `index.md` 內容零變更
- WHEN trust-zone 檔案部分缺失（半初始化）後重跑 init, THEN 只重建缺少的檔，既有檔保留不動
- WHEN 在全空目錄執行 init（greenfield）, THEN 行為不變，所有種子檔照常生成
- WHEN 既有 `AGENTS.md`（managed 產物，非 trust-zone）存在, THEN 其手寫內容遷入 `prospec:user` 區塊、stub 入 `prospec:auto`（不 skip、不覆蓋）

#### REQ-SETUP-018: Init Per-File Idempotency Guard
`init.service.execute` 的 artifact 寫入迴圈：curated trust-zone 檔（`CONSTITUTION.md`/`_conventions.md`/根層級 `index.md`/canonical convention docs）採 per-file skip-if-exists、既有檔 byte 不變；`AGENTS.md` 為 `managed` 產物，改走 `mergeManagedDoc`（既有內容遷入 `prospec:user` 區塊、stub 入 `prospec:auto`；缺檔則建立 auto=stub、user 空）並列入 `createdFiles`。`.prospec.yaml` 仍最後寫入，作為「init 完成」復原標記。

**Scenarios:**
- WHEN 已有 trust-zone 的專案刪 `.prospec.yaml` 後重跑 `prospec init`, THEN 只重建 `.prospec.yaml`、trust-zone artifact byte 不變；`AGENTS.md` 經 merge 寫入並列入 `createdFiles`
- WHEN trust-zone 部分缺失（半初始化）後重跑 init, THEN 只重建缺少的 trust-zone 檔，既有檔保留
- WHEN 在空目錄 greenfield init, THEN trust-zone 全寫入、`AGENTS.md` 建立（auto=stub、user 空），行為不變
- WHEN 既有 `AGENTS.md` 為手寫（無區塊）, THEN 內容遷入 user 區塊（不 skip、不覆蓋）

---

### US-012: prospec upgrade 刷新 canonical docs [P1]

身為升級 prospec CLI 版本的專案維護者，
我希望一個 zero-LLM 指令重渲染 zone 2 canonical docs、重跑 agent sync、記錄版本並產出升級報告，
以便我的 shipped 文件跟上新版 CLI，而 zone 3 curated 內容完全不受影響。

**Acceptance Scenarios:**
- WHEN 在已初始化專案執行 `prospec upgrade`, THEN `.prospec.yaml` `version` 更新為 `PROSPEC_VERSION`、跑 agent sync、印 report
- WHEN upgrade 完成, THEN upgrade report 列出缺觸發詞的新 skill 與版本 delta（from→to）
- WHEN 在未初始化專案（無 `.prospec.yaml`）執行 upgrade, THEN `ConfigNotFound` 阻擋並提示先 `prospec init`，不寫任何檔
- WHEN upgrade 執行, THEN 任何 `prospec/ai-knowledge/` doc 與 CONSTITUTION 內容零變更

#### REQ-TYPES-037: `version` 欄位代表專案使用的 prospec 版本
`.prospec.yaml` 的 `version` 欄位語義定為「該專案使用的 prospec 版本」（即 `PROSPEC_VERSION`），不再是 config schema 版本「1.0」。`init.service` 種入 `version: PROSPEC_VERSION`；`upgrade.service` 升級時更新它。`ProspecConfigSchema.version` 維持 optional 字串（向後相容）。不新增獨立 `prospec_version` 欄位——直接以 `version` 承載。

**Scenarios:**
- WHEN `prospec init` 完成, THEN `.prospec.yaml` 的 `version` 等於 `PROSPEC_VERSION`（非 "1.0"）
- WHEN 舊 config（`version: "1.0"` 或無 `version`）safeParse, THEN 仍合法（向後相容）
- WHEN `prospec upgrade` 執行, THEN `version` 更新為當前 `PROSPEC_VERSION`
- WHEN 檢查 schema, THEN 無獨立 `prospec_version` 欄位（語義由 `version` 單一承載）

#### REQ-TYPES-036: PROSPEC_VERSION Single Source
新增 `types/version.ts` 以 `createRequire` 讀套件 `package.json` 並匯出 `PROSPEC_VERSION`，置於 leaf `types` 層——`cli`（commander `.version()`）與 `services`（`init`/`upgrade`）皆可向下 import，消除版本字面值重複。

**Scenarios:**
- WHEN 讀 `PROSPEC_VERSION`, THEN 值等於 `package.json` 的 `version`
- WHEN `prospec --version`, THEN 輸出 `PROSPEC_VERSION`（單一來源，無重複字面值）
- WHEN 檢查 import, THEN `cli` 與 `services` 皆 import `types/version`，無 `cli → lib` 違規（lint 守門）

#### REQ-SERVICES-035: Upgrade Orchestrator Service
`upgrade.service.execute({ cwd, interactive? })`：(1) `readConfig`；(2) 更新 `config.version = PROSPEC_VERSION`；(3) 互動模式逐一提示補齊缺漏的策展欄位（`UPGRADE_NUDGE_RULES`），套用答案；(4) `writeConfig`（comment-preserving 就地合併，保留註解；見 REQ-LIB-022）；(5) orchestrate sibling `agentSync.execute`（service-orchestrates-service，透傳 hints/warnings）；(6) best-effort 刷新 `raw-scan.md`（`generateRawScan`，非致命，回傳 `rawScanRefreshed`）；(7) **`createMissingDocs`**——以 `buildDocsInventory` 找出 MISSING 文件，逐檔經共用 `lib/init-docs` helper render＋`atomicWrite`（skip-if-exists、per-doc best-effort），成功者收入 `createdDocs`（見 REQ-SERVICES-061）；(8) `buildReport`（post-prompt、建立後）：version delta（from→to）、缺觸發詞 skill 清單、config-field nudges（`detectNudges`）、建立後 docs inventory（`buildDocsInventory`——依 `INIT_DOC_REGISTRY` × `resolveInitDocLocation` 逐檔於實際位置檢查，尊重遷移的 `knowledge.base_path`，見 REQ-SETUP-022）與 `createdDocs`。**只建缺檔、永不覆寫既有 curated doc**（格式遷移屬 `/prospec-upgrade` skill）；除可重生的 `raw-scan.md` 外，`prospec/ai-knowledge/` 寫入僅限本次補建的缺檔。

**Scenarios:**
- WHEN execute 完成, THEN `.prospec.yaml` `version` = `PROSPEC_VERSION`、agent sync 已跑、`raw-scan.md` 已刷新、缺漏的 init 文件已補建
- WHEN execute 執行且有既有 curated doc, THEN 既有 doc（CONSTITUTION/根層級 index/_conventions/canonical convention docs/module README）byte 不變（只補缺檔、不覆寫）
- WHEN 單檔 render/write 失敗, THEN best-effort——該檔留 MISSING、upgrade 仍成功（version + agent sync 不受影響）；`generateRawScan` 失敗時 `rawScanRefreshed` 為 false 亦不中止
- WHEN report 產出, THEN 含 version{from,to}、缺 `skill_triggers` 條目的 skill 清單（非英文時）、nudges、建立後逐檔 docs inventory 與 `createdDocs`
- WHEN orchestrate, THEN 呼叫 `agentSync` + `generateRawScan` + 共用 `lib/init-docs`，依賴方向 `cli → services → lib → types` 不破（不渲染 canonical docs、不跑 LLM knowledge generate）

#### REQ-SETUP-019: prospec upgrade Command
`prospec upgrade`（zero-LLM）CLI 指令。職責：(1) 升級 `.prospec.yaml`——`version` 更新為 `PROSPEC_VERSION`，以 **comment-preserving 就地合併**持久化（保留使用者註解與排版，見 REQ-LIB-022）；(2) 執行 `agent sync`（zone-1 重生）並 best-effort 刷新 `raw-scan.md`（決定性，等價 `--raw-scan-only`，對齊新版掃描器）；(3) **直接建立缺漏的 init 文件**（依 `INIT_DOC_REGISTRY` 逐檔 render＋write、skip-if-exists，見 REQ-SETUP-024）；(4) 輸出 report（version delta、docs inventory 與本次「已建立」清單，見 REQ-SETUP-022、缺觸發詞 skill、config-field nudges）+ 下一步 `/prospec-upgrade`。在互動式 TTY 逐一提示補齊缺漏的策展欄位（見 REQ-SETUP-021）；`--no-interactive`（及非 TTY stdin）強制不提示，但**缺檔建立與互動與否無關**，故 `/prospec-upgrade` skill 與 CI 仍會補檔。**永不覆寫既有 curated doc**、不遷移既有文件格式、不改 CONSTITUTION（格式遷移屬 `/prospec-upgrade` skill）。屬 post-init 指令——不列入 `INIT_COMMANDS`，未初始化時 `ConfigNotFound` 阻擋並提示先 `prospec init`。

**Scenarios:**
- WHEN 在已初始化專案執行 `prospec upgrade --no-interactive`, THEN `.prospec.yaml` `version` 更新且使用者註解保留、跑 agent sync、刷新 `raw-scan.md`、補建缺漏的 init 文件、印 report（含 docs inventory 與已建立清單），exit 0
- WHEN 在互動式 TTY 執行且有缺漏的策展欄位, THEN 像 `prospec init` 一樣逐一提示補齊（如 artifact_language）
- WHEN 在未初始化專案（無 `.prospec.yaml`）執行, THEN `ConfigNotFound` 阻擋並提示 `prospec init`，不寫任何檔
- WHEN 執行 upgrade, THEN 只建立缺漏的 curated doc；既有 curated doc 與 CONSTITUTION byte 不變（格式遷移屬 skill；`prospec/ai-knowledge/` 另一寫入是可重生的 `raw-scan.md`）

---

### US-013: 升級時互動補齊缺漏的策展設定 [P1]

身為升級舊版 prospec 專案的開發者，
我希望 `prospec upgrade` 偵測我從未設定的策展型 `.prospec.yaml` 欄位並在終端機逐一提示我填寫，
以便我不必進 AI agent 也能在升級當下完成設定，且既有選擇永不被嘮叨。

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` 無 `artifact_language` 且在 TTY 升級, THEN 提示輸入語言（預設 English），答案寫回
- WHEN 帶 `--no-interactive`／非 TTY, THEN 不提示、只印含該 nudge 的 report
- WHEN 專案已明確選擇任一語言（含 English）, THEN 不報 nudge、不提示

#### REQ-SETUP-020: 升級 config-field nudge 策展 registry
`prospec upgrade` 以策展型 `UPGRADE_NUDGE_RULES`（services）偵測 pre-feature 專案缺漏的選填欄位並回報於 `UpgradeReport.nudges`（`detectNudges`）。**刻意策展、非「任何缺欄位」**：有合理預設者（`paths.base_dir`／`knowledge`／`exclude`）或缺失即硬錯誤者（`agents`）不入列。首例 `artifact_language`；lib `isArtifactLanguageUnset(config)` 區分「欄位缺失／空白」與「明確選 English」。

**Scenarios:**
- WHEN `artifact_language` 缺失, THEN `detectNudges` 回傳含該 field 一筆；明確設值（含 English）→ 空陣列
- WHEN unset（解析為 English）, THEN `missingTriggers` 必為空（兩訊號實務互斥）
- WHEN 新增策展欄位, THEN 僅需加一筆 rule，report／formatter／互動／skill 皆 iterate

#### REQ-SETUP-021: 升級互動式補齊與 `--no-interactive`
互動式 TTY 下，`prospec upgrade` 對每個命中的 nudge 逐一提示（`NudgeRule.prompt()` 回傳 config patch；`artifact_language` = 文字輸入，預設 English），仿 `prospec init`。CLI 以 `!--no-interactive && process.stdin.isTTY` 判斷互動；`UpgradeResult.resolvedNudges` 確認已填欄位。`/prospec-upgrade` skill 改以 `--no-interactive` 呼叫，永不阻塞；trigger 翻譯仍屬該 skill（LLM）。

**Scenarios:**
- WHEN 互動填入非英文語言, THEN 寫回設定檔，report 隨即以 `missingTriggers` 列出所有待在地化 skill
- WHEN 互動接受預設（空輸入）, THEN 寫入 `English`，nudge 自我終結
- WHEN `--no-interactive`／非 TTY, THEN 不呼叫提示、只印報告，不阻塞 skill／CI

---

### US-014: 升級保留 `.prospec.yaml` 註解 [P1]

身為在 `.prospec.yaml` 寫了註解的開發者，
我希望 `prospec upgrade` 只 bump `version` 時不要清掉我的註解與排版，
以便升級不會默默破壞我手寫維護的設定檔。

**Acceptance Scenarios:**
- WHEN 對含 top-level 與 inline 註解的 `.prospec.yaml` 升級, THEN 註解全數保留、`version` 更新、其餘行不變
- WHEN `writeConfig` 寫入既有檔, THEN 僅變動到的純量值被改寫、未變動鍵與順序保留
- WHEN 目標檔不存在, THEN 退回全新序列化

#### REQ-LIB-022: writeConfig 就地合併保留註解（mergeIntoDocument）
lib `mergeIntoDocument(doc, value)`：把物件就地合併進既有 YAML Document——純量變更只改值（保留節點與註解）、巢狀 map 遞迴、陣列／型別變更整塊重建、物件未含的鍵刪除；無 top-level map 時退回整體替換。`writeConfig` 改用之，使既有 `.prospec.yaml` 註解與排版在覆寫時保留。

**Scenarios:**
- WHEN 只變更一個純量, THEN top-level 與 inline 註解全保留、僅該值改寫
- WHEN 新增鍵, THEN 尾端插入、未動既有鍵與註解；物件不含的鍵被刪除
- WHEN 目標檔不存在, THEN 退回全新序列化

---

### US-015: 升級 report 揭示文件覆蓋狀態 [P1]

身為升級 prospec 版本的專案維護者，
我希望 `prospec upgrade` 的 report 列出 init 會建立的每份文件及其 present/missing 狀態（清單與 init 實作同源推導），
以便升級時一眼看出哪些檔案缺漏，而不是事後才發現舊格式殘留或檔案未建立。

**Acceptance Scenarios:**
- WHEN 在缺少 `_glossary.md` 的既有專案執行 `prospec upgrade`, THEN report 的 docs inventory 將 `_glossary.md` 標記為 MISSING
- WHEN 所有 init 文件皆存在, THEN inventory 逐檔標記 present，且不出現清單外的檔案
- WHEN `prospec upgrade` 執行, THEN 任何 curated doc 與 CONSTITUTION 內容 byte 不變（CLI 只報告、不寫入）

#### REQ-TYPES-038: Init-Doc Registry 單一事實來源
`types/conventions.ts` 的 `INIT_DOC_REGISTRY`——init 建立的 8 份 curated 文件之單一事實來源：每項含範本名、root 判別（`base`＝`paths.base_dir` 下；`knowledge`＝知識庫下，消費端須經 `resolveBasePaths().knowledgePath` 解析、不得以 `base_dir + 'ai-knowledge'` 拼合）與 root 相對路徑；canonical 與 user-managed convention docs 皆自其 `ConventionDocSource` 常數（`{template, output}` 對）經共用 `asKnowledgeInitDoc` 投影推導不重複——任何文件名於 codebase 僅宣告一處；index 項以 `context: 'index'` 宣告渲染 context，消費端以欄位判別、不比對範本路徑字串。排除 `AGENTS.md`（zone-1，agent-sync 擁有）與 `specs/.gitkeep`（非文件）。`init.service` 的 curated 清單由此推導（per-file skip-if-exists 與寫入行為不變）；位於 leaf `types` 層，純資料無 I/O。

**Scenarios:**
- WHEN 讀 registry, THEN 恰 8 項（base：`README.md`、`CONSTITUTION.md`、`index.md`；knowledge：`_conventions`、`_diagram-conventions`、`_glossary`、`_status-lifecycle`、`_module-readme-conventions`），每項含範本與 root
- WHEN `prospec init` 於 greenfield 執行, THEN 實際建立的 curated 文件集合 == registry 推導集合（雙向等式）
- WHEN 檢查 imports, THEN `conventions.ts` 無任何內部 import（leaf 純資料）

#### REQ-SETUP-022: Upgrade Report Docs Inventory
`prospec upgrade` report 的 docs inventory 區段：依 `INIT_DOC_REGISTRY` 逐檔經共用 `resolveInitDocLocation` 以**實際位置**檢查存在性（knowledge root 尊重遷移的 `knowledge.base_path`——與 knowledge-init／agent-sync／knowledge-reader 一致）；因 CLI 先補建缺檔再回報，inventory 反映**建立後**狀態。formatter 以固定可解析行格式輸出 `✓ <path> (template: <hbs>)`／`✗ <path> — MISSING (template: <hbs>)`（路徑經 `sanitizeTerminal`），並以 `created N missing doc(s): …` 行列出本次補建者；仍為 MISSING（補建失敗）時提示 `/prospec-upgrade` 處理。`buildDocsInventory` 本身純唯讀（不寫入），建立由 `createMissingDocs` 負責。

**Scenarios:**
- WHEN 專案缺 `_glossary.md`, THEN upgrade 補建它、inventory 標記 present 並列於 `createdDocs`
- WHEN `knowledge.base_path` 遷移至非預設位置, THEN 缺檔於實際位置檢查與建立，不誤報 MISSING、不建到錯誤路徑
- WHEN 輸出 report, THEN docs 行格式固定（e2e 釘住精確字串），skill 可據以解析

---

### US-016: skill 依 inventory 完整刷新與補建 [P1]

身為執行 `/prospec-upgrade` 的專案維護者，
我希望 skill 消費 report 的 inventory 清單——存在的檔案逐檔 diff 最新範本並經我同意後更新、缺少的檔案詢問我後補建——取代範本內寫死的檔案清單，
以便升級後不再殘留舊格式文件、也不再漏建新版本引入的文件。

**Acceptance Scenarios:**
- WHEN report 將某檔標記 MISSING 且使用者同意補建, THEN skill 以最新範本建立該檔；未同意則不動
- WHEN report 將某檔標記 present 且格式與最新範本有落差, THEN 逐檔顯示 diff、經同意後只遷移格式
- WHEN 渲染 skill 範本檢視 Step 2, THEN 不存在寫死的 init 文件清單（掃描範圍完全來自 report inventory）

#### REQ-TESTS-036: Init⇄Registry 漂移防護測試
三層漂移防護，全數 mutation-verified：unit 釘住 registry 形狀（恰 8 項 root:output、canonical 推導）；`init.service.test` 斷言 memfs init 實際產出集合與 registry 推導集合**雙向相等**（init 私加文件或 registry 缺項皆轉紅）；contract `init-doc-registry.test` 以真 `renderTemplate()` 渲染每個 registry 範本（範本名打錯即紅）。

**Scenarios:**
- WHEN 自 registry 移除任一項, THEN 形狀測試轉紅；WHEN init 私加清單外文件, THEN 等式測試轉紅
- WHEN registry 範本路徑與實際 `.hbs` 不符, THEN contract 渲染測試轉紅

---

### US-017: prospec upgrade 直接補建缺漏的 init 文件 [P1]

身為升級 prospec CLI 版本的專案維護者，
我希望 `prospec upgrade` 直接建立缺漏的 init 文件（以其範本 render、既有檔不覆寫），
以便我不需重跑 `prospec init`（已初始化專案會被 `AlreadyExistsError` 擋）就能取得新版引入的文件。

**Acceptance Scenarios:**
- WHEN `prospec upgrade` 執行且某 `INIT_DOC_REGISTRY` 文件於實際位置缺漏 THEN CLI 以其範本 render 並寫入、report 列於「已建立」清單
- WHEN 某 registry 文件已存在 THEN 逐位元保留（skip-if-exists、永不覆寫）
- WHEN 帶 `--no-interactive`（skill／CI 路徑）執行 THEN 缺檔仍照建（建立與互動與否無關）
- WHEN `index.md` 缺漏 THEN CLI 建立 baseline render；真實 modules table 與舊 `_index.md` 遷移由 `/prospec-upgrade` skill 補齊

#### REQ-SETUP-024: prospec upgrade 直接補建缺漏的 init 文件
`prospec upgrade` 在建立 docs inventory 後，對每個標記 MISSING 的 `INIT_DOC_REGISTRY` 文件以其範本 render 並寫入（skip-if-exists、既有檔永不覆寫），使已初始化專案不需重跑 `prospec init` 即可取得新版新增的 init 文件；建立在互動與 `--no-interactive` 皆生效（無 per-file 提示、無旗標）。`index.md` 一併建立為 baseline；真實 modules table 與舊 `_index.md` 遷移仍屬 `/prospec-upgrade` skill。

**Scenarios:**
- WHEN 某 registry 文件於實際位置缺漏, THEN upgrade render 其範本並寫入、report 列於「已建立」清單
- WHEN 某 registry 文件已存在, THEN 逐位元保留（skip-if-exists）
- WHEN 帶 `--no-interactive` 執行, THEN 缺檔仍照建
- WHEN `index.md` 缺漏, THEN 建立 baseline（modules table 空），內容補齊由 skill 負責

#### REQ-LIB-023: 共用 init-doc render helper
新增 `lib/init-docs.ts`：`buildInitDocContexts(config, cwd)` 由 config 重建標準 render context 與 baseline index context（modules table 空）；`renderInitDoc(doc, contexts)` 依 `doc.context` 選 context 渲染；`resolveInitDocLocation(doc, config, cwd)` 經 `resolveBasePaths` 回傳 `{ absPath, label }`。`init.service` 與 `upgrade.service` 皆消費之，杜絕兩處渲染邏輯漂移；僅 import `lib`/`types`，維持依賴方向。

**Scenarios:**
- WHEN `init.service` 改用 helper, THEN greenfield init 產出集合與內容逐位元不變
- WHEN 檢查 import, THEN `lib/init-docs` 無 `services`/`cli` 上行 import
- WHEN `knowledge.base_path` 遷移, THEN `resolveInitDocLocation` 回傳實際位置（與 `buildDocsInventory` 一致）

#### REQ-SERVICES-061: Upgrade 缺檔建立步驟
`upgrade.service.execute` 於 agent sync／raw-scan 之後、build report 之前呼叫 `createMissingDocs`：以 `buildDocsInventory` 找 MISSING、逐檔經共用 helper render＋`atomicWrite`（`fileExists` 保險），成功者收入 `createdDocs`；單檔失敗為 best-effort（不中止 upgrade、該檔留 MISSING）；report `docs` 於建立後重建。不覆寫任何既有檔。

**Scenarios:**
- WHEN 有 MISSING 文件, THEN 逐份 render＋write、`createdDocs` 記錄成功者
- WHEN 單檔建立丟例外, THEN upgrade 仍成功、該檔留 MISSING
- WHEN 既有檔存在, THEN 不覆寫（byte 不變）

#### REQ-TYPES-051: UpgradeReport 建立清單欄位
`UpgradeReport` 新增 `createdDocs: string[]`（本次由 CLI 建立文件之專案相對 label）；docs inventory 於建立後回報，已建者標記 present 並列於 `createdDocs`。

**Scenarios:**
- WHEN upgrade 建立 N 份缺檔, THEN `createdDocs` 含該 N 份；未建任何檔時為空陣列
- WHEN report 序列化, THEN `docs` 反映建立後狀態（已建者 present）

#### REQ-TEMPLATES-124: prospec-upgrade skill Step 2 語義轉移
`prospec-upgrade.hbs` Step 2 由「建立缺檔」改為：(a) 補齊 CLI 已建但需更多內容的文件（`index.md` 真實 modules table、舊 `_index.md` 遷移與策展欄位保留）；(b) 既有文件格式漂移之 diff＋同意遷移；建立缺檔降為安全網（僅 report 仍 MISSING＝建立失敗時）。掃描範圍仍完全來自 report 的 `Docs inventory:`（無寫死清單）。

**Scenarios:**
- WHEN 渲染 skill 檢視 Step 2, THEN 說明 CLI 已建缺檔、skill 負責補齊與格式遷移
- WHEN report 仍列 MISSING（建立失敗）, THEN skill 以安全網提議補建
- WHEN 渲染 skill, THEN 無寫死 init 文件清單

#### REQ-TESTS-037: Upgrade 缺檔建立與共用 helper 測試
新增/擴充測試：`upgrade-flow`／`upgrade.service` 斷言缺檔被建立（含 `--no-interactive`）、既有檔 byte 不變、`createdDocs` 正確、單檔失敗 best-effort；`init.service` 重構後 greenfield 輸出不變（既有等式測試續綠）；`lib/init-docs` 單元測試（context／path、`knowledge.base_path` 遷移）；e2e 實跑補建。

**Scenarios:**
- WHEN 在缺檔專案跑 upgrade（互動與 `--no-interactive`）, THEN 缺檔皆建立且既有檔不變
- WHEN init 重構後跑既有 init⇄registry 等式測試, THEN 續綠
- WHEN 覆蓋率量測, THEN ≥ 80%

---

### US-018: 完整的 .prospec.yaml 參考範例 [P1]

身為想理解或校正 `.prospec.yaml` 全欄位的 prospec 使用者（含 onboarding agent），
我希望一個 CLI 指令吐出完整、合法、逐欄註解的 `.prospec.yaml` 範例，
以便我不必讀 minified binary 或殘缺的 README 就能發現每個可設欄位。

**Acceptance Scenarios:**
- WHEN 執行 `prospec config example` THEN 輸出涵蓋 `ProspecConfigSchema` 全欄位、逐欄帶註解、parse 過 `safeParse`
- WHEN 在未初始化專案執行 THEN 仍可輸出（範例與專案狀態無關）
- WHEN schema 新增欄位而範例未同步 THEN 完整性契約測試轉紅

#### REQ-CLI-021: `prospec config example` Emits Complete Annotated Config
新 `config` command group + `example` 子指令印出完整、合法、逐欄註解的 `.prospec.yaml` 範例，涵蓋 `ProspecConfigSchema` 全欄位；登錄於 `INIT_COMMANDS`（未 init 可跑）；success→stdout。

**Scenarios:**
- WHEN 輸出被 parse, THEN 合法 YAML 且 `ProspecConfigSchema.safeParse` 成功
- WHEN 檢視輸出, THEN 涵蓋 schema 每個欄位（含 README 曾漏的 `tech_stack` / `paths.base_dir` / `knowledge.base_path`）
- WHEN 未 init 專案執行, THEN 可執行（`INIT_COMMANDS`）；`README.md`/`README.zh-TW.md` 記載此指令

#### REQ-TESTS-051: config-example Completeness Contract
structure-aware、mutation-verified 契約：`config example` 輸出 parse 過 `ProspecConfigSchema`，且 schema 每個 key（含 nested，經各 nested schema `.shape` 派生）皆現於範例。

**Scenarios:**
- WHEN 範例缺任一 schema key（含 nested）, THEN 契約轉紅
- WHEN schema 已無死欄位, THEN 範例每個宣告 key 皆 live（無 dead allowlist）

---

### US-019: 清理 config schema 的 dead 欄位 [P2]

身為 prospec 維護者，
我希望從 `ProspecConfigSchema` 移除宣告了但程式碼從不讀的 dead 欄位、並汰換 deprecated 的 `.passthrough()`，
以便 schema 只保留有實效欄位、且不用被淘汰的 API。

**Acceptance Scenarios:**
- WHEN 檢視 `ProspecConfigSchema` THEN 不含 `project.version`、`knowledge.files`（+ `KNOWLEDGE_FILE_TYPES`）、`paths` catchall
- WHEN 既有含這些 key 的 config parse THEN 仍成功（Zod strip 未知 nested key），零行為改變
- WHEN 檢視頂層物件 THEN 以 `.loose()` 取代 deprecated `.passthrough()`，loose 行為保留

#### REQ-TYPES-062: Config Schema Carries Only Live Fields + Non-Deprecated Loose API
`ProspecConfigSchema` 只保留有 runtime reader 的宣告欄位；移除 dead 的 `project.version`、`knowledge.files`（+ orphaned `KNOWLEDGE_FILE_TYPES`）、`paths` 的 `.catchall`。頂層 `.passthrough()` 汰換為 Zod 4 `.loose()`（行為等價，保留未知頂層 key）。既有 config 仍 parse：移除的 nested key 被 strip（本就無 reader，零行為改變），未知頂層 key 仍 passthrough。

**Scenarios:**
- WHEN schema 檢視, THEN 不宣告 `project.version` / `knowledge.files` / `KNOWLEDGE_FILE_TYPES` / `paths` catchall
- WHEN 含被移除 nested key 的 config `validateConfig`, THEN 成功且結果不含它們
- WHEN 未知頂層 key, THEN 仍被 `.loose()` 保留（既有 passthrough 測試續綠）

---

## Edge Cases

- `.prospec.yaml` 格式錯誤（YAML 語法）：提供具體錯誤位置與修正建議
- 重複執行 `prospec init`：警告並退出，不修改既有檔案
- 使用者勾選未安裝的 AI CLI：提醒但允許加入配置
- 磁碟空間不足：使用 atomic write，保留原檔並顯示具體錯誤
- 無法辨識的指令輸入：顯示錯誤並建議相似指令
- 專案使用不支援的架構模式：允許手動配置 `paths`
- `--language ""`（空字串或空白）：視同未指定，採預設 English

## Success Criteria

- **SC-1**: 新專案可在 3 分鐘內完成 Prospec 初始化
- **SC-2**: 所有 Prospec 服務統一使用 `resolveBasePaths()` 進行路徑解析
- **SC-3**: 第一次使用的開發者可在 10 分鐘內理解並執行完整 Greenfield 流程
- **SC-4**: 所有 CLI 指令可透過 `--help` 探索
- **SC-5**: 100% 的無效指令輸入都能收到有意義的錯誤訊息或指令建議

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED 需求直接替換為最新狀態
2. **Functional Grouping**: 新需求插入對應的功能分組
3. **No Inline Provenance**: 歷史追溯只在 Change History 中
4. **Deprecation over Deletion**: 移除的需求搬到 Deprecated 區段

## Deprecated Requirements

#### ~~REQ-SETUP-008: 掃描專案架構~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: `prospec steering` 指令移除；掃描＋模組偵測由 `prospec knowledge init` 取代（且 tech-stack 偵測更準）。獨有的 `.prospec.yaml` tech_stack/paths 回寫刻意捨棄——tech_stack 於 `prospec init` 建檔已寫；per-module `paths` 為只有 steering 自寫自讀（buildLayers 餵 architecture.md）的循環設定，全系統其他處只讀 `paths.base_dir`。

#### ~~REQ-SETUP-009: 生成架構報告與模組映射~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: `prospec steering` 指令移除。`module-map.yaml` 生成保留於 `knowledge init`（同一 `buildModuleMap`，only-if-absent rerun-safe 版）；獨有的 `architecture.md` 生成刻意捨棄——內容已散在 `raw-scan.md`/`_index.md`/module READMEs，Architecture Layers 表亦可從 `module-map.yaml` 還原。

#### ~~REQ-SETUP-010: 掃描控制~~
**Removed**: 2026-06-22 | **Change**: remove-deprecated-steering-command
**Reason**: `prospec steering` 指令移除。`--dry-run`/`--depth`/敏感檔案排除等掃描控制已存在於 `prospec knowledge init`（共用 `parseDepth` 驗證器與 `config.exclude`）。

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-02-04 | mvp-initial | CLI 基礎框架、專案初始化、架構分析 | US-001~004, REQ-SETUP-001~010 |
| 2026-02-09 | configure-base-dir | 可配置的 Base Directory | US-005, REQ-SETUP-011~012 |
| 2026-03-02 | v2-product-first | 合併為 Feature Spec，新增首次使用 Story | US-006, REQ-SETUP-013 |
| 2026-06-04 | skill-alignment (PR #2) | init 生成 canonical convention docs | REQ-SETUP-004 (MODIFIED), REQ-SETUP-014 (ADDED) |
| 2026-06-06 | migrate-gemini-to-antigravity | init AI CLI 偵測 Gemini→Antigravity（`~/.gemini/antigravity-cli`） | REQ-SETUP-006 (MODIFIED) |
| 2026-06-07 | make-constitution-executable | init 產帶嚴重度引導式 Constitution 規則 | US-007; REQ-TYPES-021, REQ-LIB-012, REQ-SERVICES-026, REQ-TEMPLATES-062, REQ-TESTS-021 |
| 2026-06-11 | add-init-language-policy | init 語言選擇 + Language Policy seed；CLI 輸出英文化 | US-008~009; REQ-SETUP-015~016, REQ-TYPES-025, REQ-LIB-013 |
| 2026-06-15 | add-quickstart-command | prospec quickstart 一鍵啟動（init+agent-sync orchestrator，搭 agent 端 /prospec-quickstart 收尾） | US-010; REQ-SETUP-017, REQ-SERVICES-028 (ADDED) |
| 2026-06-22 | fix-init-clobber-add-upgrade | init per-file idempotency guard + version=prospec-version + prospec upgrade CLI | US-011/012; REQ-SETUP-018/019, REQ-TYPES-037/036, REQ-SERVICES-035 (ADDED), REQ-SETUP-004 (MODIFIED) |
| 2026-06-22 | preserve-agent-config-edits | init 的 `AGENTS.md` 改為 managed 合併（既有內容遷入 `prospec:user` 區塊、stub 入 auto），trust-zone 維持 skip-if-exists | REQ-SETUP-018 (MODIFIED) |
| 2026-06-22 | remove-deprecated-steering-command | 移除 deprecated `prospec steering` 指令與專屬死碼；退役 architecture.md 生成與 .prospec.yaml per-module paths 回寫（刻意捨棄） | US-004 (REMOVED); REQ-SETUP-008/009/010 (REMOVED) |
| 2026-06-27 | upgrade-config-nudges | upgrade 互動補齊缺漏策展設定（nudge registry + `--no-interactive`）、writeConfig 就地合併保留註解；更正 REQ-SETUP-019/SERVICES-035 的 canonical-rewrite 說法 | US-013/014 (ADDED); REQ-SETUP-020/021、REQ-LIB-022 (ADDED); REQ-SETUP-019、REQ-SERVICES-035 (MODIFIED) |
| 2026-06-27 | upgrade-refresh-raw-scan | `prospec upgrade` best-effort 刷新 `raw-scan.md`（決定性，對齊新版掃描器）；將「不寫 ai-knowledge doc」收斂為「不寫 curated doc」 | REQ-SETUP-019、REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | fix-upgrade-doc-coverage | 升級文件覆蓋補全（issue #48）：`INIT_DOC_REGISTRY` 單一來源（root 判別 base/knowledge）、upgrade report 唯讀 docs inventory（實際位置、`knowledge.base_path`-aware）、init⇄registry 等式漂移防護 | US-015/016 (ADDED); REQ-TYPES-038、REQ-SETUP-022、REQ-TESTS-036 (ADDED); REQ-SETUP-019、REQ-SERVICES-035 (MODIFIED) |
| 2026-07-02 | dedupe-init-doc-registry | registry 平行重複收束（review F2/F3）：user-managed 清單升級為 `ConventionDocSource` 對並經 `asKnowledgeInitDoc` 推導、`InitDoc.context` 判別欄位取代範本路徑字串比對；行為逐位元不變 | REQ-TYPES-038 (MODIFIED，描述性) |
| 2026-07-03 | add-init-project-readme | `prospec init` 產生專案內 Prospec 簡介 README（issue #50）：新增 `init/readme.md.hbs`、`INIT_DOC_REGISTRY` 獨立 base 條目（README.md），init create + upgrade docs inventory 自動涵蓋 | US-003; REQ-SETUP-023 (ADDED); REQ-SETUP-004 (MODIFIED) |
| 2026-07-03 | upgrade-create-missing-docs | prospec upgrade 直接補建缺漏的 init 文件（render-from-template、skip-if-exists、best-effort）；共用 `lib/init-docs` helper；skill Step 2 轉補齊＋格式遷移 | US-017; REQ-SETUP-024/TYPES-051/LIB-023/SERVICES-061/TEMPLATES-124/TESTS-037 (ADDED); REQ-SETUP-019/SERVICES-035/SETUP-022 (MODIFIED) |
| 2026-07-12 | emit-trigger-scaffold | `prospec config example`（完整逐欄註解 .prospec.yaml 範例，INIT_COMMANDS）；清理 config schema dead 欄位 + `.passthrough()`→`.loose()` | US-018/019 (ADDED); REQ-CLI-021、REQ-TYPES-062、REQ-TESTS-051 (ADDED) |
