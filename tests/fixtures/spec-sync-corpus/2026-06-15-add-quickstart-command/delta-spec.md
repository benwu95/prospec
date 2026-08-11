# Delta Spec：add-quickstart-command

## ADDED

### REQ-SETUP-017: `prospec quickstart` 一鍵啟動指令

**Feature:** project-setup
**Story:** US-1

**Description:**
新增 top-level `prospec quickstart` 指令，串接決定性 scaffold（init + agent sync），跳過已完成步驟，並印出在 AI agent 端的下一步。須註冊於 `INIT_COMMANDS` 以在 `.prospec.yaml` 存在前可執行（繞過 preAction config gate）。`--name/--agents/--language` 透傳 init。

**Acceptance Criteria:**
1. WHEN 在未初始化專案執行，THEN 建立 config、同步 agent skill 檔，stdout 末行指名 `/prospec-quickstart`
2. WHEN 在已初始化專案重跑，THEN init 步驟標記 skipped、exit 0、仍抵達下一步引導
3. WHEN 無 agent 設定，THEN 以 `PrerequisiteError` 清楚訊息提示設定 agent／重跑 init，非 stack trace

**Priority:** High

---

### REQ-SERVICES-028: Quickstart Orchestrator Service

**Feature:** project-setup
**Story:** US-1

**Description:**
新增 `quickstart.service.ts` `execute()`，依序呼叫 sibling `init.service.execute`（try／catch `AlreadyExistsError` → 該步標記 skipped）與 `agentSync.service.execute`（idempotent），聚合 per-step 狀態並透傳 agent-sync 的 `hints`。**刻意不**呼叫 knowledge-init（歸 skill，確保 raw-scan.md 新鮮）。屬「service 編排 service」既有模式（先例 `change-resolver`），維持 `cli → services → lib → types`。

**Acceptance Criteria:**
1. WHEN init 因既有 config 拋 `AlreadyExistsError`，THEN 攔截並標記該步 skipped，不中止後續步驟
2. WHEN agent-sync 回傳 hints（非英文且 skill_triggers 空），THEN result 透傳 hints 供 formatter 顯示
3. WHEN 任一步以非預期錯誤失敗，THEN 回傳結構化 per-step 狀態供 CLI 呈現

**Priority:** High

---

### REQ-TYPES-030: SkillConfig `excludeFromEntryConfig` 與 Quickstart Skill 定義

**Feature:** agent-integration
**Story:** US-3

**Description:**
`SkillConfig` 新增 optional `excludeFromEntryConfig?: boolean`（JSDoc 載明：限自我終結的一次性流程）。`SKILL_DEFINITIONS` 新增 `prospec-quickstart`（type: Lifecycle、`hasReferences: false`、`excludeFromEntryConfig: true`），命名遵 `prospec-{name}`（REQ-AGNT-009）。

**Acceptance Criteria:**
1. WHEN 讀取 `SKILL_DEFINITIONS`，THEN 含 `prospec-quickstart` 且帶 `excludeFromEntryConfig: true`
2. WHEN `skill-format.test.ts` 執行，THEN skill 計數由 13 更新為 14 且斷言新欄位
3. WHEN config 省略 `excludeFromEntryConfig`，THEN 視同 false（向後相容，既有 skill 不受影響）

**Priority:** High

---

### REQ-AGNT-023: Entry Config 排除標記 excludeFromEntryConfig 的 Skills

**Feature:** agent-integration
**Story:** US-3

**Description:**
agent-sync 渲染 entry config（CLAUDE.md/AGENTS.md，always-loaded Layer 0）的 skill 清單時排除 `excludeFromEntryConfig` skills；`syncSkillsDirSkills` 維持 iterate 完整 `SKILL_DEFINITIONS`，故其 `SKILL.md` 仍寫到磁碟、可被 slash command 觸發。此舉維持 L0 穩定性（REQ-AGNT-020 / REQ-TEMPLATES-082）與 entry config <100 行（REQ-AGNT-003），且不抵觸 REQ-TYPES-011（所有 skill 仍產生檔案）。

**Acceptance Criteria:**
1. WHEN agent sync 執行，THEN excludeFromEntryConfig skill 不出現在 entry config 的 Available Skills 清單
2. WHEN agent sync 執行，THEN excludeFromEntryConfig skill 的 `SKILL.md`（含 references，若有）仍寫到各 agent skill 目錄
3. WHEN 移除排除 filter（mutation test），THEN 契約測試轉紅（PB-001 mutation-verified）

**Priority:** High

---

### REQ-TEMPLATES-108: `/prospec-quickstart` Onboarding Skill 模板

**Feature:** agent-integration
**Story:** US-2

**Description:**
新增 `skills/prospec-quickstart.hbs`：探測 `prospec --version`；讀 `artifact_language`；當非英文且 `skill_triggers` 空時翻譯各 skill 的英文 trigger baseline、show-and-confirm 後寫入 `.prospec.yaml`、讀回驗證 YAML 可解析、Bash `prospec agent sync` 套用；再 Bash `prospec knowledge init`；最後 chain 進既有 `/prospec-knowledge-generate` workflow（不 inline）。CLI 不可用時 graceful fallback 至手動步驟（比照 prospec-verify）。含 `## Output Contract` 與 `## NEVER`（`skill-format.test.ts` 強制）；English-only 模板（REQ-TEMPLATES-073）。

**Acceptance Criteria:**
1. WHEN 渲染模板，THEN 含 Output Contract（可客觀檢核的 Success Criteria）與 NEVER 段
2. WHEN 非英文且 skill_triggers 空，THEN 指示翻譯 baseline、確認後寫入並重跑 agent sync
3. WHEN prospec CLI 不可用，THEN 宣告並退回手動步驟、不靜默失敗
4. WHEN 收尾，THEN chain 進 `/prospec-knowledge-generate`（非 inline 複製其邏輯）

**Priority:** High

---

### REQ-TESTS-029: Entry-Config 排除契約測試（mutation-verified）

**Feature:** agent-integration
**Story:** US-3

**Description:**
新增 section-scoped、結構感知、mutation-verified 契約測試（PB-001）：斷言 excludeFromEntryConfig skill 缺席於 agent-sync 的 entry-config skills context 與產出的 entry config，同時其 `SKILL.md` 仍被寫出；刪除排除 filter 須使測試轉紅。

**Acceptance Criteria:**
1. WHEN 測試執行，THEN 斷言 entry-config skills context 不含 excludeFromEntryConfig skill
2. WHEN 測試執行，THEN 斷言 excludeFromEntryConfig skill 的 `SKILL.md` 仍產出
3. WHEN 排除 filter 被刪除或反向，THEN 測試轉紅（負向／mutation 驗證）

**Priority:** High
