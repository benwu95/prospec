# Delta Spec：upgrade-config-nudges

## ADDED

### REQ-SETUP-020：升級 config-field nudge 策展 registry

**Feature:** project-setup
**Story:** US-1

**Description:**
`prospec upgrade` 以策展型 `UPGRADE_NUDGE_RULES`（services）偵測 pre-feature 專案缺漏的選填欄位並回報於 `UpgradeReport.nudges: UpgradeNudge[]`（`detectNudges(config)`）。**刻意策展、非「任何缺欄位」**：有合理預設者（`paths.base_dir`／`knowledge`／`exclude`）或缺失即硬錯誤者（`agents`）不入列。首例為 `artifact_language`；lib 新增 `isArtifactLanguageUnset(config)` 區分「欄位缺失／空白」與「明確選 English」。

**Acceptance Criteria:**
1. 無 `artifact_language` 欄位 → `detectNudges` 回傳含 `field: 'artifact_language'` 一筆；明確設值（含 English）→ 回傳空陣列
2. registry 為單一來源：report／formatter／互動提示／skill 皆 iterate 之，新增欄位僅需加一筆
3. unset 解析為 English，故 `missingTriggers` 必為空（兩訊號實務互斥）

**Priority:** High

---

### REQ-SETUP-021：升級互動式補齊 nudge 與 `--no-interactive`

**Feature:** project-setup
**Story:** US-1

**Description:**
互動式 TTY 下，`prospec upgrade` 對每個命中的 nudge 逐一提示填寫（`NudgeRule.prompt()` 回傳 config patch；`artifact_language` = 文字輸入，預設 English），仿 `prospec init`。CLI 以 `!--no-interactive && process.stdin.isTTY` 判斷互動；`--no-interactive` 強制 report-only。`UpgradeResult.resolvedNudges` 確認已填欄位。`/prospec-upgrade` skill 改以 `--no-interactive` 呼叫，永不阻塞；trigger 翻譯仍屬該 skill（LLM）。

**Acceptance Criteria:**
1. 互動填入非英文語言 → 寫回設定檔，且 report 隨即以 `missingTriggers` 列出所有待在地化 skill
2. 互動接受預設（空輸入）→ 寫入 `English`，nudge 自我終結
3. `--no-interactive`／非 TTY → 不呼叫提示、只印報告；不阻塞 skill／CI

**Priority:** High

---

### REQ-LIB-022：writeConfig 就地合併保留註解（mergeIntoDocument）

**Feature:** project-setup
**Story:** US-2

**Description:**
lib 新增 `mergeIntoDocument(doc, value)`：把物件就地合併進既有 YAML Document——純量變更只改值（保留節點與註解）、巢狀 map 遞迴、陣列／型別變更整塊重建、物件未含的鍵刪除；無 top-level map 時退回整體替換。`writeConfig` 改用之，使既有 `.prospec.yaml` 的註解與排版在覆寫時保留。

**Acceptance Criteria:**
1. 對含 top-level 與 inline 註解的設定檔，只變更一個純量後，註解全數保留、僅該值改寫
2. 新增鍵在尾端插入、未動既有鍵與註解；物件不含的鍵被刪除
3. 目標檔不存在時退回全新序列化

**Priority:** High

---

### REQ-AGNT-028：canonical agent 順序

**Feature:** agent-integration
**Story:** US-3

**Description:**
支援 agent 的 canonical 順序定為 `claude, codex, copilot, antigravity`，統一於 `VALID_AGENTS`（types，驅動 zod enum 錯誤與 `supported:` 訊息）、`AGENT_CONFIGS`（types，查表）、`AGENT_DIRS`（lib，init 偵測／提示）。產出檔依 agent 集合而非順序，故順序變更不改任何 generated 檔內容。

**Acceptance Criteria:**
1. 無效 agent 的 enum 錯誤列為 `"claude"|"codex"|"copilot"|"antigravity"`
2. `detectAgents()` 回傳 id 順序為新順序
3. 重跑 `agent sync` 後 generated 檔零 diff

**Priority:** Medium

---

## MODIFIED

### REQ-SETUP-019：prospec upgrade Command

**Feature:** project-setup
**Story:** US-1

**Before:**
`prospec upgrade`（zero-LLM）：升級 `.prospec.yaml`——`version` 更新並**以 canonical 格式重新序列化**；執行 `agent sync`；輸出 report（version delta、缺觸發詞 skill）+ 下一步 `/prospec-upgrade`。

**After:**
保留 zero-LLM 編排與 post-init `ConfigNotFound` 守門，但：(1) `version` 改以**註解保留的就地合併**持久化（不再 canonical 重寫，見 REQ-LIB-022）；(2) report 增列 config-field nudges（REQ-SETUP-020）；(3) 新增 `--no-interactive` 旗標，互動式 TTY 下會逐一提示補齊 nudge（REQ-SETUP-021）。

**Reason:**
原 canonical 重序列化會清掉使用者註解（且文件謊稱保留）；同時讓升級能在當下提示補齊缺漏的策展欄位，免去使用者必經 AI agent。

**Priority:** High

---
