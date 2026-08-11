# Delta Spec: fix-init-clobber-add-upgrade

## ADDED

### REQ-SETUP-018: Init Per-File Idempotency Guard

**Feature:** project-setup
**Story:** US-1

**Description:**
`init.service.execute` 的 artifact 寫入迴圈改為 per-file skip-if-exists（套用 `knowledge-init.service` 既有 `if (!fileExists(...))` pattern）：只寫入缺少的檔，既有檔一律不動。`createdFiles` 只列實際寫入者加 `.prospec.yaml`。`.prospec.yaml` 仍最後寫入，作為「init 完成」復原標記。

**Acceptance Criteria:**
1. WHEN 已有 trust-zone 的專案刪 `.prospec.yaml` 後重跑 `prospec init`，THEN 只重建 `.prospec.yaml`，`CONSTITUTION.md`/`_conventions.md`/`_index.md` 及其他既有 artifact 內容零變更（byte 不變）
2. WHEN trust-zone 部分缺失（半初始化）後重跑 init，THEN 只重建缺少的檔，既有檔保留
3. WHEN 在空目錄 greenfield init，THEN 所有 artifact 皆缺 → 全部寫入，行為不變
4. WHEN init 完成，THEN `createdFiles` 只含本次實際寫入的檔（含 `.prospec.yaml`）

**Priority:** High

---

### REQ-TYPES-037: `version` 欄位代表專案使用的 prospec 版本

**Feature:** project-setup
**Story:** US-2

**Description:**
`.prospec.yaml` 的 `version` 欄位語義定為「該專案使用的 prospec 版本」（即 `PROSPEC_VERSION`），不再是 config schema 版本「1.0」。`init.service` 種入 `version: PROSPEC_VERSION`；`upgrade.service` 升級時更新它。`ProspecConfigSchema.version` 維持 optional 字串（向後相容：舊 config 的 `version: "1.0"` 仍合法，視為過時版本，首次 `prospec upgrade` 會更新）。**不**新增獨立 `prospec_version` 欄位——直接以 `version` 承載（使用者澄清需求 2026-06-22）。`version` 從不被任何邏輯讀取（僅寫入用的版本標記），故重新定義安全。

**Acceptance Criteria:**
1. WHEN `prospec init` 完成，THEN `.prospec.yaml` 的 `version` 等於 `PROSPEC_VERSION`（非 "1.0"）
2. WHEN 舊 config（`version: "1.0"` 或無 `version`）safeParse，THEN 仍合法（向後相容）
3. WHEN `prospec upgrade` 執行，THEN `version` 更新為當前 `PROSPEC_VERSION`
4. WHEN 檢查 schema，THEN 無獨立 `prospec_version` 欄位（語義由 `version` 單一承載）

**Priority:** High

---

### REQ-TYPES-036: PROSPEC_VERSION Single Source

**Feature:** project-setup
**Story:** US-2

**Description:**
新增 `types/version.ts` 以 `createRequire` 讀套件 `package.json` 並匯出 `PROSPEC_VERSION`。置於 leaf `types` 層——因 `cli`（commander `.version()`）與 `services`（`init`/`upgrade`）皆需用，而 lint 層級規則禁止 `cli → lib` 直接 import，`types` 是兩者皆可向下 import 的共同層。消除版本字面值重複（PB-004）。

**Acceptance Criteria:**
1. WHEN 讀 `PROSPEC_VERSION`，THEN 值等於 `package.json` 的 `version`
2. WHEN `prospec --version`，THEN 輸出 `PROSPEC_VERSION`（單一來源，無重複字面值）
3. WHEN 檢查 import，THEN `cli` 與 `services` 皆 import `types/version`，無 `cli → lib` 違規（lint 守門）

**Priority:** Medium

---

### REQ-SETUP-019: prospec upgrade Command

**Feature:** project-setup
**Story:** US-2

**Description:**
新增 `prospec upgrade`（zero-LLM）CLI 指令。職責**僅限**：(1) 升級 `.prospec.yaml`——`version` 更新為 `PROSPEC_VERSION`、以 canonical 格式重新序列化（格式至最新版）；(2) 執行 `agent sync`（zone-1 重生）。**不**自動改寫任何 init 建立的 doc（doc 格式更新交由 `/prospec-upgrade` skill 經使用者同意處理，使用者澄清需求 2026-06-22）。屬 post-init 指令——不列入 `INIT_COMMANDS`，未初始化時 `ConfigNotFound` 阻擋並提示先 `prospec init`。輸出 report（version delta、缺觸發詞 skill）+ 下一步 `/prospec-upgrade`。

**Acceptance Criteria:**
1. WHEN 在已初始化專案執行 `prospec upgrade`，THEN `.prospec.yaml` `version` 更新為 `PROSPEC_VERSION` 並以 canonical 格式重寫、跑 agent sync、印 report，exit 0
2. WHEN 在未初始化專案（無 `.prospec.yaml`）執行，THEN `ConfigNotFound` 阻擋並提示 `prospec init`，不寫任何檔
3. WHEN agent sync 因無 agent 設定失敗，THEN 透傳 `PrerequisiteError`（actionable，非 stack trace）
4. WHEN 執行 upgrade，THEN 不寫任何 `prospec/ai-knowledge/` doc 或 CONSTITUTION（僅動 `.prospec.yaml` + zone-1 agent-sync 產物）

**Priority:** High

---

### REQ-SERVICES-035: Upgrade Orchestrator Service

**Feature:** project-setup
**Story:** US-2

**Description:**
新增 `upgrade.service.execute({ cwd })`：(1) `readConfig`；(2) 更新 `config.version = PROSPEC_VERSION` 並 `writeConfig`（comment-preserving，canonical 重序列化＝格式至最新版）；(3) orchestrate sibling `agentSync.execute`（service-orchestrates-service，透傳 hints/warnings）；(4) `buildReport`：version delta（from→to）、缺觸發詞的新 skill 清單。**完全不寫** `prospec/ai-knowledge/` 任何 doc、不寫 CONSTITUTION——doc 格式更新歸 `/prospec-upgrade` skill（經同意）；CLI 只動 `.prospec.yaml` 與 zone-1 agent-sync 產物。

**Acceptance Criteria:**
1. WHEN execute 完成，THEN `.prospec.yaml` `version` = `PROSPEC_VERSION` 且 agent sync 已跑
2. WHEN execute 執行，THEN `prospec/ai-knowledge/` 下任何 doc 與 CONSTITUTION.md 內容零變更（byte 不變）
3. WHEN report 產出，THEN 含 version{from,to} 與缺 `skill_triggers` 條目的 skill 清單（非英文時）
4. WHEN orchestrate，THEN 呼叫 `agentSync` 且依賴方向 `cli → services` 不破（不呼叫 knowledge init、不渲染 canonical docs）

**Priority:** High

---

### REQ-TYPES-035: SKILL_DEFINITIONS Registers prospec-upgrade

**Feature:** agent-integration
**Story:** US-3

**Description:**
`SKILL_DEFINITIONS` 新增 `prospec-upgrade`（type `Lifecycle`、`hasReferences:false`、`cliDependency:'prospec upgrade'`、`excludeFromEntryConfig:true`），總數 16→17，描述與 `.hbs` frontmatter 同步（雙寫）。觸發詞不與既有 skill 衝突。

**Acceptance Criteria:**
1. WHEN 讀 `SKILL_DEFINITIONS`，THEN 含 `prospec-upgrade`、`excludeFromEntryConfig:true`、count 17
2. WHEN triggers 比對，THEN `prospec-upgrade` 不與既有 skill 觸發詞衝突
3. WHEN agent sync 執行，THEN 各 agent skill dir 部署 `prospec-upgrade/SKILL.md`

**Priority:** High

---

### REQ-TEMPLATES-121: prospec-upgrade Skill Template

**Feature:** agent-integration
**Story:** US-3

**Description:**
新增 `templates/skills/prospec-upgrade.hbs`（judgment skill，English-only baseline）：(1) 執行 `prospec upgrade` 讀 report（version 已升、agent 已 sync、缺觸發詞 skill 清單）；(2) **掃描由 `prospec init` 建立的相關檔案**（`CONSTITUTION.md`、`_conventions.md`、`_index.md`、`_status-lifecycle.md`、`_module-readme-conventions.md`、`_diagram-conventions.md`），對照已安裝 prospec 套件的最新模板偵測格式落差，逐檔顯示 diff、**詢問使用者是否同意修改內容**後才更新（套件模板不可得時 graceful 跳過並回報）；(3) 依 `artifact_language` 為缺觸發詞的 skill 補譯 `skill_triggers`（只補缺、snapshot/confirm/最小 in-place/讀回驗證 YAML）→ 再次 `prospec agent sync`。含 Output Contract + NEVER；Startup Loading 靜態優先 `[STABLE]/[DYNAMIC]`。

**Acceptance Criteria:**
1. WHEN rendered，THEN 帶 Output Contract 與 NEVER 段、無硬編碼語言指令（English baseline）
2. WHEN 掃描 init 建立的檔案發現與最新模板格式不符，THEN 逐檔 diff + 詢問同意後才改；未同意則該檔不動
3. WHEN `artifact_language` 非英文且有缺觸發詞 skill，THEN 只譯缺的、confirm 後最小 in-place 寫入 `skill_triggers` 並讀回驗證 YAML
4. WHEN 收尾（有任何變更），THEN 再次執行 `prospec agent sync` 使部署反映最新觸發詞

**Priority:** High

---

### REQ-AGNT-026: User-Facing Docs Reflect prospec-upgrade

**Feature:** agent-integration
**Story:** US-3

**Description:**
`README.md`/`README.zh-TW.md` 的 skill 目錄表 + lifecycle workflow 小節雙語同步新增 `prospec-upgrade` 與 `prospec upgrade` CLI 指令、header skill 計數 16→17；`CLAUDE.md` Available Prospec Skills（由 agent sync 從 `SKILL_DEFINITIONS` 重生）同步；`_index.md` templates 模組描述「16 skills」→「17 skills」。

**Acceptance Criteria:**
1. WHEN 讀兩份 README，THEN skill 目錄 + workflow 皆含 `prospec-upgrade`、計數 17、含 `prospec upgrade` 指令
2. WHEN 讀 `CLAUDE.md`，THEN Available Prospec Skills 含 `prospec-upgrade`
3. WHEN 讀 `_index.md`，THEN templates 模組描述 skill 計數一致為 17

**Priority:** Medium

---

### REQ-TEMPLATES-122: prospec-knowledge-update 格式落差同意

**Feature:** ai-knowledge
**Story:** US-5

**Description:**
`templates/skills/prospec-knowledge-update.hbs` 新增格式落差檢查：在更新 Knowledge 前，比對既有 AI Knowledge 檔案（`_index.md` 欄位 schema 對照 `_module-readme-conventions.md` 與 INDEX 欄位規範、module README 結構）是否與當前模板/conventions 格式相符；若偵測到落差，列出落差並**詢問使用者是否同意更新格式**，同意才改格式（內容增量更新照常）。English-only baseline。

**Acceptance Criteria:**
1. WHEN knowledge-update 偵測到既有 Knowledge 格式與當前 conventions/模板不符，THEN 列出落差並詢問使用者同意後才更新格式
2. WHEN 使用者不同意格式更新，THEN 僅做內容增量更新、保留既有格式
3. WHEN 無格式落差，THEN 照常增量更新、不打擾使用者

**Priority:** Medium

---

## MODIFIED

### REQ-SETUP-004: 建立專案結構

**Feature:** project-setup
**Story:** US-1

**Before:**
`prospec init` 對所有必要檔做無條件 `atomicWrite`；idempotency 僅靠「`.prospec.yaml` 已存在 → 警告退出」的單檔 gate（gate 一旦因 `.prospec.yaml` 缺席而通過，便覆寫含 curated trust-zone 在內的全部檔）。

**After:**
寫入迴圈逐檔 skip-if-exists（見 REQ-SETUP-018）：既有檔一律保留、只建缺檔。單檔 gate（`.prospec.yaml` 存在即退出）行為不變；新增的 per-file 守衛覆蓋「`.prospec.yaml` 被刪、其餘 curated 檔仍在」的復原情境。

**Reason:**
修復資料遺失 bug——init 與對照組 `knowledge-init.service` 行為不一致（後者早有 per-file 守衛）。

**Priority:** High

---

### REQ-AGNT-021: Skill Triggers Population Hint

**Feature:** agent-integration
**Story:** US-4

**Before:**
非英文且 `skill_triggers` **完全未設定**（空）時，agent sync 輸出單一通用 hint：請 AI agent 將英文 baseline 翻譯後寫入 `skill_triggers` 再重跑 sync。`skill_triggers` 一旦非空即不再 hint（all-or-nothing）。

**After:**
agent sync 計算缺漏集合 `SKILL_DEFINITIONS \ keys(skill_triggers)`。非英文且集合非空時 hint：全空 → 保留原通用引導；部分缺（既有已譯、新 skill 未譯）→ **具名列出缺觸發詞的 skill**，引導只補缺。英文或全齊 → 無 hint。既有 unknown-skill warning 不變。

**Reason:**
關閉觸發詞再本地化入口缺口——使用者新增 skill 後可只補該 skill 的觸發詞，永不需刪 `.prospec.yaml` 重跑 init（即不再踩 REQ-SETUP-018 修復的破口）。

**Priority:** Medium

---

### REQ-TYPES-030: excludeFromEntryConfig Skill Field

**Feature:** agent-integration
**Story:** US-3

**Before:**
`prospec-quickstart` 是唯一的 entry-excluded skill（contract-asserted「只有 quickstart」）。

**After:**
entry-excluded 集合擴為**恰好** `{prospec-quickstart, prospec-upgrade}`——兩者皆 `_conventions.md` 明文授權的 self-terminating one-shot（onboarding / migration·repair）。`excludeFromEntryConfig` 語義與預設（absent=false）不變。

**Reason:**
`prospec-upgrade` 屬 migration/repair 一次性流程，部署 SKILL.md 但排除於常駐 entry config，省 L0 token；契約由「唯一」放寬為「指定集合」。

**Priority:** Medium

---

### REQ-TESTS-029: Entry-Config Exclusion Contract Test (mutation-verified)

**Feature:** agent-integration
**Story:** US-3

**Before:**
契約測試斷言 entry-excluded skills `toEqual(['prospec-quickstart'])`。

**After:**
斷言 entry-excluded 集合 `{prospec-quickstart, prospec-upgrade}`（順序無關），且兩者 SKILL.md 仍部署；移除/反轉排除 filter 須轉紅（mutation-verified）。`SKILL_DEFINITIONS.length` 對應斷言更新為 17。

**Reason:**
反映 REQ-TYPES-030/REQ-TYPES-035 的契約擴張，維持 mutation-verified 守門。

**Priority:** Medium

---

### REQ-TEMPLATES-108: prospec-quickstart Onboarding Skill Template

**Feature:** agent-integration
**Story:** US-4

**Before:**
`prospec-quickstart.hbs` Step 1：`artifact_language` 非英文且 `skill_triggers` 缺席或空時翻譯整批 baseline；`skill_triggers` 已非空即整步 skip（all-or-nothing）。

**After:**
Step 1 改「只補缺」：迭代 `SKILL_DEFINITIONS`，對缺 `skill_triggers` 條目的 skill 翻譯並補入，既有條目不覆寫（show-and-confirm、最小 in-place edit、讀回驗證 YAML 流程不變）。英文或全齊 → skip。

**Reason:**
與 REQ-AGNT-021 一致地關閉觸發詞再本地化缺口；新增 skill 後重跑 quickstart 即可補新 skill 觸發詞，不需刪 `.prospec.yaml`。

**Priority:** Medium
