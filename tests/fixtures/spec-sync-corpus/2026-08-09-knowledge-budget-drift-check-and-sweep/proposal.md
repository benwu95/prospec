## Background

知識庫的 `knowledge-size` 迴路在面對 `l2_per_module` 預算超標時，唯一的修正手段是發出 WARN，而最簡單的消解方式是無條件調高 `.prospec.yaml` 中的預算。這導致預算只是落後指標而失去約束力。我們需要針對調高預算增加強制記錄理由的機制，並在 knowledge update 時加入自動的 Sweep 釋壓閥，避免模組文件單向無限增長，同時新增 headroom 壓力訊號提早預警。

## User Stories

### US-1: 增加 token budget 覆寫的 Drift Check [P1]

As a 開發者,
I want 高於預設值的 token budget 覆寫必須有相鄰的理由註解,
So that 無理由隨意調高預算時會被阻擋（發出訊號），保留理由才能通過檢查。

**Acceptance Scenarios:**

- WHEN `.prospec.yaml` 中某項 `token_budget` 高於預設值且無註解, THEN 發出包含欄位、現值與預設值的可定位 drift check WARN/FAIL。
- WHEN 某項 `token_budget` 高於預設值且有相鄰理由註解, THEN 檢查直接 PASS (例如 `demand_knowledge_per_file: 15000` 現況)。
- WHEN 某項 `token_budget` 低於或等於預設值, THEN 不論有無註解都不產生該項的訊號。

**Independent Test:**
在測試專案中加入不同的 `.prospec.yaml` (高於預設無註解、高於預設有註解、低於等於預設)，確認 drift report 產生正確的 id 和訊息。

### US-2: 增加知識更新時的自動 Sweep 清理 [P1]

As a 開發者,
I want 在 `/prospec-knowledge-update` 寫入受影響模組 README 前，自動執行三判準的 Sweep,
So that 已機械化的內容能被壓縮為指標，而被取代或被吸收的內容能被清理，為模組文件釋放空間。

**Acceptance Scenarios:**

- WHEN 執行 update, THEN 掃描受影響的模組並對 README 套用三判準 Sweep（機械化 ⇒ 壓縮成指標、被取代、被吸收）。
- WHEN Sweep 發揮作用, THEN 終端機或日誌記錄前後 token 變化量（沒有可壓縮內容時誠實回報「無」）。

**Independent Test:**
準備一份含有已知可機械化 Pitfalls 的 README 檔案，執行 mock knowledge update，斷言輸出檔案的特定段落已壓縮並留下正確的 Guard 參考。

### US-3: 增加 Headroom 壓力訊號 [P2]

As a 開發者,
I want `KNOWLEDGE_SIZE_RULES` 增加一個 headroom 帶,
So that 可以提早預警模組容量接近上限，而不是等到完全越界才發出警告。

**Acceptance Scenarios:**

- WHEN 檔案容量超過 headroom 門檻但未達 100%, THEN 發出 headroom 的預警訊號。
- WHEN 設定檔中有針對 headroom 門檻的獨立覆寫, THEN drift check 套用該覆寫值。

**Independent Test:**
建立大小剛好落在 85% 到 100% 之間的模組 README，執行 drift check 並斷言觸發了專屬的 headroom 訊號。

## Edge Cases

- 檔案沒有註解但有空白行：解析器應判斷為無相鄰註解。
- 測試環境未安裝完整 prospec：本 repo 需能實跑 Sweep 並取得 token 記錄。
- Token 測量單位統一：所有量測必須使用 `Math.ceil(chars/4)`，避免計數單位分歧。

## Functional Requirements

- **FR-001**: 實作針對 `knowledge.token_budget` 覆寫的 drift check 規則（只檢查高於 default，依賴 yaml parsing 讀取註解）。
- **FR-002**: 修改 `/prospec-knowledge-update` 執行邏輯，在寫入 README 前執行三判準 Sweep。
- **FR-003**: 擴充 `KNOWLEDGE_SIZE_RULES` 支援 headroom 門檻，並允許 `.prospec.yaml` 中覆寫。

## Success Criteria

- **SC-001**: 回歸測試以 `demand_knowledge_per_file: 15000` 為 fixture 且該筆直接 PASS。
- **SC-002**: 在本專案實跑一輪 Sweep，並成功印出前後 token 數變化。
- **SC-003**: Headroom 門檻可獨立設定且測量單位一致。

## Related Modules

- **lib**: yaml parsing, drift engine (collectors/evaluators), token accounting 等邏輯。
- **types**: 新增 drift check ids，調整 token-budget 相關介面。
- **services**: drift check 以及 knowledge update (執行 Sweep) 的核心邏輯。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified
