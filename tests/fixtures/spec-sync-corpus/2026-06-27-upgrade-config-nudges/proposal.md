# Proposal：upgrade-config-nudges

## Background

`prospec upgrade` 過去只在 `.prospec.yaml` 缺 `artifact_language`／`skill_triggers` 時靜默套用英文預設，從不提示使用者可以設定——由 pre-feature CLI 建立的舊專案因此永遠看不到這個選項。同時 `writeConfig` 在升級重寫時會清掉使用者註解（且 JSDoc 謊稱保留），canonical agent 順序的列舉也與期望不符。本變更一次處理這三個相鄰的 upgrade／config 強健性問題。

## User Stories

### US-1：升級時提示並互動補齊缺漏的策展欄位 [P1]

As a 升級舊版 prospec 專案的開發者,
I want `prospec upgrade` 偵測我從未設定的策展型 `.prospec.yaml` 欄位並（在終端機）逐一提示我填寫,
So that 我不必進 AI agent 也能在升級當下完成設定，且不會被無謂的預設值悄悄綁定。

**Acceptance Scenarios:**

- WHEN `.prospec.yaml` 無 `artifact_language` 欄位且在互動式 TTY 執行 `prospec upgrade`, THEN 像 `prospec init` 一樣提示輸入語言（預設 English），答案寫回設定檔
- WHEN 帶 `--no-interactive`（或非 TTY，如 skill／CI）執行, THEN 不提示、只印出含該 nudge 的 migration report
- WHEN 專案已明確選擇任一語言（含 English）, THEN 不提示、不報 nudge（既有選擇永不被嘮叨）
- WHEN 互動填入非英文語言, THEN report 隨即以既有 missingTriggers 機制列出所有待在地化的 skill

**Independent Test:** 對無 `artifact_language` 的設定檔跑 `prospec upgrade --no-interactive`，stdout 含 `no artifact_language set`；互動模式（mock 提示）填入語言後設定檔出現該欄位。

### US-2：升級重寫 `.prospec.yaml` 時保留使用者註解 [P1]

As a 在 `.prospec.yaml` 寫了註解的開發者,
I want `prospec upgrade` 只 bump `version` 時不要清掉我的註解與排版,
So that 升級不會默默破壞我手寫維護的設定檔。

**Acceptance Scenarios:**

- WHEN 對含註解的 `.prospec.yaml` 執行 `prospec upgrade`, THEN top-level 與 inline 註解原樣保留、`version` 更新、其餘行不變
- WHEN `writeConfig` 寫入既有檔, THEN 僅變動到的純量值被改寫，未變動的鍵、順序、註解皆保留
- WHEN 目標檔不存在, THEN 退回全新序列化寫出（無註解可保留）

**Independent Test:** 對含 `# comment` 的設定檔讀取→bump version→`writeConfig`，輸出仍含該註解且 version 已更新。

### US-3：校正 canonical agent 順序 [P2]

As a 設定 `agents` 的使用者,
I want 支援的 agent 以 `claude, codex, copilot, antigravity` 的順序呈現,
So that enum 驗證錯誤訊息、init 偵測提示與 agent sync 分組順序一致且符合預期。

**Acceptance Scenarios:**

- WHEN `.prospec.yaml` 的 `agents` 含無效值, THEN zod enum 錯誤列為 `"claude"|"codex"|"copilot"|"antigravity"`
- WHEN 執行 `prospec init` 偵測, THEN 候選 agent 以新順序列出
- WHEN 改變順序, THEN 產出檔（CLAUDE.md／AGENTS.md／SKILL.md）內容不變（產出只看 agent 集合，不看順序）

**Independent Test:** 對含無效 agent 的設定檔呼叫 `validateConfig`，錯誤訊息順序為新順序；`detectAgents()` 回傳順序為新順序。

## Edge Cases

- `artifact_language` 為空字串／全空白：視為「未設定」（與缺欄位同義），會 nudge
- 互動模式下使用者直接按 Enter：寫入 `English`，nudge 自我終結（與 init 一致）
- skill／CI 非互動呼叫：`--no-interactive` 保證不阻塞；trigger 翻譯仍由 `/prospec-upgrade` skill（LLM）負責
- agent 順序變更：本 repo 自身 `.prospec.yaml` 一併校正，但不影響任何 generated 檔

## Functional Requirements

- **FR-001**：升級以策展 registry 偵測缺漏欄位並回報（非「任何缺欄位」）
- **FR-002**：互動式 TTY 逐一提示補齊 nudge；`--no-interactive` 強制 report-only
- **FR-003**：`writeConfig` 就地合併、保留註解與排版
- **FR-004**：canonical agent 順序統一為 `claude, codex, copilot, antigravity`

## Success Criteria

- **SC-001**：`prospec upgrade --no-interactive` 對無語言設定檔印出 nudge；互動模式可寫入語言
- **SC-002**：含註解的 `.prospec.yaml` 經升級後註解保留、version 更新
- **SC-003**：enum 錯誤／偵測／sync 分組皆呈現新 agent 順序
- **SC-004**：全測試套件綠（含新增的 unit／integration／e2e），typecheck／lint 通過，覆蓋率 ≥ 80%

## Related Modules

- **types**：`VALID_AGENTS`／`AGENT_CONFIGS` 順序（US-3）
- **lib**：`isArtifactLanguageUnset`、`mergeIntoDocument`（writeConfig）、`agent-detector` 順序
- **services**：`upgrade.service` nudge registry + 互動解析
- **cli**：`upgrade` 指令 `--no-interactive`／TTY gating、`upgrade-output` 格式
- **templates**：`prospec-upgrade` skill 改用 `--no-interactive`
- **tests**：unit／integration／e2e 涵蓋

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：Language Policy（本文件繁中、code/REQ-ID 英文）、INVEST（三則 story 皆獨立可測）、TDD（已附 unit/integration/e2e）、One-way Dependency（types←lib←services←cli 未逆向）、README 已同步（US-facing：upgrade 行為與 agent 列舉）

## UI Scope

**Scope:** none
