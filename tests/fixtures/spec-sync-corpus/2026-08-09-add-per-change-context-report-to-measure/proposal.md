## Background

一輪 standard 變更的 context 固定地板（包含各站 SKILL.md、references、L1、L2 及 feature specs）極大且目前無人量測（如 issue #142 指出本專案高達 ~160k tokens）。目前的 `prospec measure` 未考量完整的變更流程消耗，導致實際發生的 context floor 隱形，無從得知並改善這塊龐大的成本。

## User Stories

### US-1: Context 預算投影報告 [P1]

As a Agent 開發者,
I want `prospec measure` 新增一個「一輪變更投影」模式,
So that 我能看見每一次變更真正需要的 Context 固定開銷。

**Acceptance Scenarios:**

- WHEN 我執行投影模式的測量指令（例如 `prospec measure --workflow standard` 或類似參數）
  THEN 它會輸出包含 `SKILL.md` (7站)、其 references、L1、受影響的 L2 以及 REQ 路由到的 feature specs 的 token 預算報告
- WHEN 輸出這份投影報告
  THEN 它的數值必須能重現 Issue #142 的地板數字（單次讀取未含程式碼即高達 92k + 69k 等級的 tokens 總量）
- WHEN 我傳入 `scale: quick`
  THEN 它輸出的報告會正確減少不必要的載入面（如 plan），顯示出合理可解釋的較低地板數字

**Independent Test:**
給定一個 mock 的 prospec 工作區與假造的檔案長度，執行 `prospec measure` 投影指令，驗證輸出的分類加總與總和正確無誤。

## Edge Cases

- 當專案沒有某些可選的 references 或 feature specs 尚未建立時，指令能穩定運作並視其長度為 0。
- 確保在專案根目錄執行時，能正確載入並計算 `.agents/skills` 與隱藏的資源檔案。

## Functional Requirements

- **FR-001**: 實作投影模式的核心加總邏輯（含不同 scale 對應的技能載入清單）。
- **FR-002**: 擴充 `prospec measure` 的 CLI 參數以觸發一輪變更投影模式。
- **FR-003**: 建立讀取並估算 L1, L2, SKILL.md, references 與 feature specs tokens 的函式。

## Success Criteria

- **SC-001**: 該指令在 prospec 專案本身執行時，能重現 92k + 69k 規模的地板報告。
- **SC-002**: `quick` 與 `standard` 兩種 scale 的投影情境會輸出不同的 token floor，兩者差額符合預期。

## Related Modules

- **cli**: 擴充 `measure` 指令的參數與 formatter。
- **services**: 實作 `measure` 指令投影流程的商業邏輯。
- **types**: 定義測量與報告所需的資料結構。

## Open Questions

- [x] **RESOLVED**: 要如何在不知道具體修改哪一個 module 的情況下，估計「受影響的 L2」與「 feature spec」？
  - **決定**：投影模式會解析當前的 Change（或接受 `--change <name>`），透過 `metadata.yaml` 取出 `related_modules` 作為 L2 計算依據；並透過 `delta-spec.md` 擷取 `Feature:` 欄位作為受影響 feature specs 的計算依據。如果手動傳入 `--project-workflow`，則覆寫 `metadata.yaml` 的 scale。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified

## UI Scope

**Scope:** none
