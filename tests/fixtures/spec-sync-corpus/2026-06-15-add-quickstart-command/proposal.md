# Proposal：Quickstart 一鍵啟動（OPT-A4）

## Background

Brownfield 專案導入 prospec 目前需要 3 個 CLI 步驟（`init` → `agent sync` → `knowledge init`）再加 1 個 skill（`/prospec-knowledge-generate`）；非英文專案還多一段手動關卡——必須請 agent 翻譯 skill trigger、手動編輯 `.prospec.yaml`、再重跑 `agent sync`。AI Knowledge 的產生本質上需要 LLM 讀程式碼，CLI 無法獨力完成，因此「真正一步」不可能；但可以把使用者**實際要輸入的步驟壓到 2 步**（1 個 CLI 指令 + 1 個 slash command），其餘自動化。本變更出貨即解開 BL-032（`add-reverse-spec-extraction`）的「OPT-A4 出貨後」gate。

## User Stories

### US-1：一個 CLI 指令完成決定性 scaffold [P1]

As a 導入 prospec 的開發者，
I want 一個 CLI 指令把所有決定性設定（建立專案 config、同步 agent skill 檔）一次跑完，
So that 我不必記住並依序執行多個指令。

**Acceptance Scenarios:**

- WHEN 我在尚未初始化的專案執行 quickstart 指令，THEN 它建立專案 config、同步 agent skill 檔，並印出我下一步該在 AI agent 輸入的確切動作
- WHEN 我在已初始化的專案重跑該指令，THEN 它跳過已完成步驟、不報錯，仍抵達下一步引導
- WHEN 專案沒有設定任何 AI agent，THEN 它以清楚訊息提示我設定 agent／重跑 init，而非拋出 stack trace

**Independent Test:**
在空白暫存目錄以非互動參數執行指令 → 斷言 `.prospec.yaml` 與 agent skill 檔產生、stdout 指名下一個 slash command；重跑 → 斷言跳過且 exit 0。

### US-2：一個 slash command 在 agent 端收尾 [P1]

As a 同一位開發者，
I want 在 AI agent 內用單一 slash command 完成收尾——把 skill trigger 在地化成我選的語言、刷新 agent 設定、產生 AI Knowledge，
So that 整個 onboarding 是 2 個輸入步驟，而非冗長手動序列。

**Acceptance Scenarios:**

- WHEN 我在 quickstart 指令後執行該 slash command（非英文專案），THEN 它提出母語 trigger 詞，經我確認後套用並刷新 agent 設定，全程不需我手動編輯 `.prospec.yaml`
- WHEN trigger 在地化完成，THEN 它產生 knowledge 掃描骨架並接續產生模組層級 AI Knowledge
- WHEN agent 的 shell 取不到 prospec CLI，THEN 它明確告知並退回文件化的手動步驟，而非靜默失敗

**Independent Test:**
在非英文且 `skill_triggers` 為空的專案觸發該 skill → 斷言確認後 `.prospec.yaml` 的 `skill_triggers` 被填入、entry 設定以母語 trigger 重新產生、`raw-scan.md` 存在、且已進入 knowledge 產生流程。

### US-3：一次性 onboarding skill 不增加常駐 context 成本 [P1]

As a prospec 維護者（與所有下游使用者），
I want 這個一次性 onboarding skill **不**膨脹 always-loaded 的 agent context，
So that 一個每專案只用一次的功能不會對每個後續 session 的 token 預算（G4）課稅。

**Acceptance Scenarios:**

- WHEN agent 設定被同步，THEN onboarding skill 的觸發檔被寫到磁碟（可被觸發），但**不**出現在 always-loaded 的 agent entry 設定（`CLAUDE.md`/`AGENTS.md`）
- WHEN 我比對變更前後 entry 設定列出的 skill 清單，THEN onboarding skill 不在該清單中、卻仍可被 slash command 觸發

**Independent Test:**
agent sync 後 → 斷言 `prospec-quickstart` 的 `SKILL.md` 存在，且 grep `CLAUDE.md`/`AGENTS.md` 找不到 `/prospec-quickstart`。

## Edge Cases

- **重跑既有專案**：init 偵測既有 config 即跳過、agent sync 覆寫安全、knowledge 掃描保留已編修的 curated 檔——整體指令可重複執行
- **未設定 agent**：agent sync 前置條件失敗時給可行動訊息，不中斷成 trace
- **agent shell 無 prospec CLI**：探測失敗則改走手動步驟並續行可做的 LLM 部分
- **跑了 CLI 卻沒切到 agent**：onboarding 半完成；指令可重跑收尾，但 CLI 無法強制使用者跟進
- **大型 brownfield repo**：knowledge 產生可能超出單一 agent turn 的 context 預算（見 Open Questions）
- **LLM 寫出格式錯誤的 `skill_triggers`**：重跑 agent sync 前需先驗證 YAML 可解析
- **英文／預設語言專案**：trigger 在地化步驟為 no-op，skill 直接跳過翻譯
- **entry 排除機制回歸**：若 `excludeFromEntryConfig` 失效，onboarding skill 會洩漏進 entry 設定——須以測試鎖住

## Functional Requirements

- **FR-001**：提供可在 `.prospec.yaml` 尚未存在時即可執行的 `prospec quickstart` 指令
- **FR-002**：quickstart 串接決定性設定（init + agent sync），跳過已完成步驟且不報錯
- **FR-003**：quickstart 成功時印出明確下一步（onboarding slash command）
- **FR-004**：提供 `/prospec-quickstart` onboarding skill，負責 trigger 在地化、刷新 agent 設定、備妥 knowledge 骨架並接續 knowledge 產生
- **FR-005**：trigger 在地化僅在 `artifact_language` 非預設且 `skill_triggers` 為空時、經使用者確認後寫入
- **FR-006**：onboarding skill 必須可被觸發，但**不得**列入 always-loaded 的 agent entry 設定
- **FR-007**：agent 端步驟在 prospec CLI 不可用時優雅降級
- **FR-008**：root `README.md` 同變更內補上新指令（Constitution P5）

## Success Criteria

- **SC-001**：brownfield onboarding 對英文與非英文專案皆 ≤ 2 個使用者輸入動作（1 CLI + 1 slash）
- **SC-002**：在已初始化專案重跑 `prospec quickstart` 回傳 exit 0 並跳過已完成步驟
- **SC-003**：`/prospec-quickstart` 不在 `CLAUDE.md`/`AGENTS.md` skill 清單中，但其 `SKILL.md` 存在且可觸發（測試鎖住）
- **SC-004**：非英文專案執行 skill 後，`.prospec.yaml` `skill_triggers` 被填入且 entry 設定以母語 trigger 呈現
- **SC-005**：涵蓋 fresh-init／re-run-skip／missing-agents／entry-config 排除（`excludeFromEntryConfig`）的測試；覆蓋率 ≥ 80%
- **SC-006**：OPT-A4 標記為已出貨 → BL-032 gate 解除

## Related Modules

- **cli**：新增 `quickstart` 指令並註冊為可在 config 前執行的入口
- **services**：新增 quickstart orchestrator（薄包裝 init/agent-sync）；agent-sync 服務調整 entry 設定的 skill 清單來源
- **types**：擴充 skill 設定 schema（`excludeFromEntryConfig` 屬性）並新增 onboarding skill 定義
- **templates**：新增 `/prospec-quickstart` skill 模板；entry 設定模板沿用既有渲染
- **tests**：新增 quickstart 與 onboarding 排除行為的單元／契約測試

## Open Questions

- [ ] **NEEDS CLARIFICATION**：knowledge 掃描骨架（`raw-scan.md`）由 CLI step 產生，還是由 onboarding skill 產生？（傾向 skill，確保掃描結果新鮮）
- [ ] **NEEDS CLARIFICATION**：onboarding skill 應 inline 完整 knowledge 產生流程，還是 chain／交棒給既有 `/prospec-knowledge-generate`？（傾向 chain，避免大型 repo 撐爆 context 預算）
- [ ] **NEEDS CLARIFICATION**：引入首個「entry 排除型（`excludeFromEntryConfig`）」skill 是否需要文件化治理慣例，以防日後濫用隱藏 skill？（傾向需要一行慣例）

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **P1 變更文件繁中**：PASS — 本 proposal 以繁體中文撰寫
- **P3 INVEST**：PASS — 3 個獨立、可測試、各含 ≥ 2 WHEN/THEN 的 Story
- **P4 TDD**：PASS（規劃層）— SC-005 要求測試先行；實作遵 RED→GREEN→REFACTOR
- **P5 README [SHOULD]**：PASS（附帶）— FR-008 要求同變更更新 README，否則 verify 將 WARN
- **依賴方向 `cli → services → lib → types`**：PASS（規劃層）— 新 orchestrator 落 services、指令落 cli、schema 落 types，無反向 import（plan 階段定案）

## UI Scope

**Scope:** none
