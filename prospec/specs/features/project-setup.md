---
feature: project-setup
status: active
last_updated: 2026-06-27
story_count: 13
req_count: 30
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
- WHEN 在空目錄執行 `prospec init` THEN 建立 `.prospec.yaml`、AI Knowledge 目錄、Constitution、AGENTS.md
- WHEN `.prospec.yaml` 已存在 THEN 顯示警告並退出
- WHEN 偵測到 package.json THEN 自動辨識為 TypeScript/Node
- WHEN 偵測到已安裝的 AI CLI THEN 互動式選單讓使用者勾選

#### REQ-SETUP-004: 建立專案結構
執行 `prospec init` 時建立所有必要檔案與目錄：`.prospec.yaml`、`AGENTS.md`、根層級 `{base_dir}/index.md`、`{base_dir}/ai-knowledge/`（含 `_conventions.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`、`_diagram-conventions.md`）、`{base_dir}/CONSTITUTION.md`、`{base_dir}/specs/`。寫入採 per-file skip-if-exists（見 REQ-SETUP-018）：既有檔一律保留、只建缺檔；單檔 gate（`.prospec.yaml` 存在即退出）行為不變。

**Scenarios:**
- WHEN executing `prospec init` in empty directory, THEN create all required files and directories
- WHEN `{base_dir}/index.md` created, THEN contains empty module table
- WHEN `CONSTITUTION.md` created, THEN contains Principles, Constraints, Quality Standards templates
- WHEN `.prospec.yaml` already exists, THEN show warning and exit without modification (single-file gate unchanged)
- WHEN `.prospec.yaml` is absent but curated files remain (recovery), THEN rebuild only the missing files; existing files stay byte-identical

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
`upgrade.service.execute({ cwd, interactive? })`：(1) `readConfig`；(2) 更新 `config.version = PROSPEC_VERSION`；(3) 互動模式逐一提示補齊缺漏的策展欄位（`UPGRADE_NUDGE_RULES`），套用答案；(4) `writeConfig`（comment-preserving 就地合併，保留註解；見 REQ-LIB-022）；(5) orchestrate sibling `agentSync.execute`（service-orchestrates-service，透傳 hints/warnings）；(6) best-effort 刷新 `raw-scan.md`（`generateRawScan`，等價 `--raw-scan-only`；非致命，回傳 `rawScanRefreshed`）；(7) `buildReport`（post-prompt）：version delta（from→to）、缺觸發詞 skill 清單、config-field nudges（`detectNudges`）。不寫任何 CURATED doc 或 CONSTITUTION；唯一 `prospec/ai-knowledge/` 寫入是決定性、可隨時重生的 `raw-scan.md`。

**Scenarios:**
- WHEN execute 完成, THEN `.prospec.yaml` `version` = `PROSPEC_VERSION`、agent sync 已跑、`raw-scan.md` 已刷新
- WHEN execute 執行, THEN CURATED doc（CONSTITUTION/根層級 index/_conventions/canonical convention docs/module README）byte 不變（唯一 `ai-knowledge/` 寫入是 `raw-scan.md`）
- WHEN `generateRawScan` 失敗, THEN `rawScanRefreshed` 為 false 且 upgrade 仍成功（version + agent sync 不受影響）
- WHEN report 產出, THEN 含 version{from,to}、缺 `skill_triggers` 條目的 skill 清單（非英文時）、與缺漏策展欄位的 nudges
- WHEN orchestrate, THEN 呼叫 `agentSync` + `generateRawScan` 且依賴方向 `cli → services` 不破（不渲染 canonical docs、不跑 LLM knowledge generate）

#### REQ-SETUP-019: prospec upgrade Command
`prospec upgrade`（zero-LLM）CLI 指令。職責：(1) 升級 `.prospec.yaml`——`version` 更新為 `PROSPEC_VERSION`，以 **comment-preserving 就地合併**持久化（保留使用者註解與排版，見 REQ-LIB-022）；(2) 執行 `agent sync`（zone-1 重生）並 best-effort 刷新 `raw-scan.md`（決定性，等價 `--raw-scan-only`，對齊新版掃描器）；(3) 輸出 report（version delta、缺觸發詞 skill、config-field nudges）+ 下一步 `/prospec-upgrade`。在互動式 TTY 逐一提示補齊缺漏的策展欄位（見 REQ-SETUP-021）；`--no-interactive`（及非 TTY stdin）強制 report-only，故 `/prospec-upgrade` skill 與 CI 不阻塞。不自動改寫任何 init 建立的 CURATED doc。屬 post-init 指令——不列入 `INIT_COMMANDS`，未初始化時 `ConfigNotFound` 阻擋並提示先 `prospec init`。

**Scenarios:**
- WHEN 在已初始化專案執行 `prospec upgrade --no-interactive`, THEN `.prospec.yaml` `version` 更新且使用者註解保留、跑 agent sync、刷新 `raw-scan.md`、印 report，exit 0
- WHEN 在互動式 TTY 執行且有缺漏的策展欄位, THEN 像 `prospec init` 一樣逐一提示補齊（如 artifact_language）
- WHEN 在未初始化專案（無 `.prospec.yaml`）執行, THEN `ConfigNotFound` 阻擋並提示 `prospec init`，不寫任何檔
- WHEN 執行 upgrade, THEN 不寫任何 CURATED doc 或 CONSTITUTION（唯一 `prospec/ai-knowledge/` 寫入是決定性可重生的 `raw-scan.md`；其餘僅動 `.prospec.yaml` + zone-1 agent-sync 產物）

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
