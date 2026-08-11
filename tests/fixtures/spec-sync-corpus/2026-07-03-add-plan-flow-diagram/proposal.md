# Proposal: add-plan-flow-diagram

> 對應 GitHub issue [#47](https://github.com/benwu95/prospec/issues/47)：prospec-plan 產生流程圖

## Background

`/prospec-plan` 目前以純文字（Overview、Call Chain、Implementation Steps）描述實作計畫。當 user story
含多個分支與決策點時，純文字不易讓使用者快速掌握行為流程，需反覆推敲。專案已有 Mermaid 圖表慣例
（`_diagram-conventions.md`），卻尚未在 plan 階段運用來輔助理解複雜需求。

## User Stories

### US-1: 複雜 user story 產生行為流程圖 [P1]

As a 使用 `/prospec-plan` 規劃並審閱 plan.md 的開發者,
I want plan.md 在 user story 較複雜時自動附上一張行為/決策流程圖,
So that 我能一眼掌握分支與狀態轉移，不必只靠文字逐句推敲。

**Acceptance Scenarios:**

- WHEN user story 含多個決策點/分支、多步驟流程、或跨模組序列，THEN plan.md 內嵌一張描繪該 user story
  行為/決策流程的 Mermaid 流程圖
- WHEN user story 為簡單線性流程（無分支、單一結果），THEN 不產生流程圖，避免為簡單需求製造雜訊
- WHEN 產生流程圖，THEN 該圖沿用 `_diagram-conventions.md` 的 classDef 色盤與節點形狀慣例
  （決策用 diamond、對應語意的 classDef）
- WHEN `metadata.scale` 為 `quick`，THEN 無 plan 亦無流程圖（維持既有 Entry Gate 行為）

**Independent Test:**
以一個含 ≥2 決策點的 proposal.md 跑 `/prospec-plan`，確認 plan.md 出現 ` ```mermaid ` 區塊且節點涵蓋主要
決策點；再以一個線性 proposal 確認**不**產生流程圖。

## Edge Cases

- **Greenfield 專案（無模組知識）**：流程圖以 user story 行為為本、不依賴模組知識，仍可產生。
- **多個複雜 user story**：每個達門檻的 story 各一張圖，圖標題標明對應的 US 編號。
- **Mermaid 語法正確性**：產生後圖須可被 Mermaid 解析（結構性檢查，非強制阻斷閘門）。
- **與 Call Chain 混淆**：行為流程圖聚焦「使用者可觀察的行為/決策」，與逐 entry-point 的技術 Call Chain 分工，不重複描繪程式呼叫。

## Functional Requirements

- **FR-001**: `/prospec-plan` 在 user story 達複雜度門檻時，於 plan.md 產生一張 Mermaid 行為流程圖。
- **FR-002**: 複雜度採結構性 any-of 訊號——(a) ≥2 個條件分支/決策點、(b) ≥3 階段狀態轉移或多終止狀態、(c) 跨模組/跨角色且順序即理解重點（沿用並具體化 `_diagram-conventions.md`「何時加圖」精神）；單一線性 happy path/單步驟 CRUD 不產生。
- **FR-003**: 流程圖沿用 `_diagram-conventions.md` 的 classDef 色盤、節點形狀與標籤慣例。
- **FR-004**: 流程圖內嵌於 plan.md 的獨立章節，置於 Implementation Steps 之前；與 Call Chain 章節分工互補（行為 vs 技術呼叫）。
- **FR-005**: `quick` scale 不產生 plan、亦不產生流程圖；本行為僅適用 `standard`/`full`。
- **FR-006**: `plan-format` 參考文件與 `prospec-plan` skill 說明同步描述此規則（單一事實來源，供 `/prospec-verify` 稽核）。

## Success Criteria

- **SC-001**: 含 ≥2 決策點的 proposal 跑 plan 後，plan.md 至少含一個 ` ```mermaid ` flowchart 區塊。
- **SC-002**: 線性 proposal 跑 plan 後，plan.md 不含 mermaid 區塊。
- **SC-003**: 產生的 Mermaid 區塊使用 `_diagram-conventions.md` 定義的 classDef 類別（至少含 `decisionNode` 與一個其他類）。
- **SC-004**: `plan-format` 參考文件新增描述流程圖章節的段落，且 delta-spec 有對應 REQ。
- **SC-005**: 契約測試覆蓋「複雜→產生、線性→不產生」兩條路徑（TDD、覆蓋率 ≥ 80%）。

## Related Modules

- **templates**: `prospec-plan` skill 與 `plan-format` 參考範本（`src/templates/skills/prospec-plan.hbs`、
  `src/templates/skills/references/plan-format.hbs`）是產生規則的來源；本變更主要修改此模組。
- **tests**: 需新增/更新 skill-format 契約測試鎖住流程圖規則（測試金字塔品質閘門）。

## Open Questions

- [x] **RESOLVED（plan 階段）**: 流程圖區塊**不**計入 `plan.md` 的 120 行 `standard` 上限。
- [ ] 設計選項（觸發條件/位置/內容/scale）因 AskUserQuestion 逾時採用建議預設，plan 前使用者可覆寫（見 `metadata.yaml` `quality_log`）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- **Language Policy [MUST]** — 本 proposal 以繁中撰寫，識別字/技術術語保持英文 → **PASS**
- **User Stories INVEST [MUST]** — US-1 獨立可測、有明確驗收情境與 Independent Test → **PASS**
- **Test-Driven Development [MUST]** — 以 SC-005 契約測試落實，於 plan/tasks 展開 → **PASS（規劃承諾）**
- **User-Facing Documentation [SHOULD]** — 本變更改動 skill 行為（user-facing surface），須評估 root `README.md` 是否需同步 → **WARN（plan 階段確認）**

## UI Scope

**Scope:** none
