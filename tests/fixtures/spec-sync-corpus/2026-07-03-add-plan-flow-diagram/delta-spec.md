# Delta Spec: add-plan-flow-diagram

> REQ 命名沿用 `REQ-TEMPLATES-{NUMBER}`；下一個可用序號為 125。

## ADDED

### REQ-TEMPLATES-125: prospec-plan 對複雜 user story 產生條件式行為流程圖

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`/prospec-plan` 在 user story 觸及複雜度判準時，於 plan.md 內嵌一張描繪該 user story 行為/決策流程的
Mermaid 流程圖，沿用 `_diagram-conventions.md` 的 classDef 色盤與節點慣例，與既有技術性 Call Chain
章節（REQ-TEMPLATES-059）分工互補。複雜度採**結構性 any-of 訊號**（非情境條數）；判準為 agent 指引
而非機械閘門。實作為純模板內容：`plan-format.hbs` 定義章節規格，`prospec-plan.hbs` Phase 4 以
on-demand 子步驟驅動產圖。

**Acceptance Criteria:**
1. `plan-format.hbs` 渲染後含一個條件式「User Story Flow」流程圖章節，載明觸發的 any-of 結構訊號——
   (a) ≥2 個條件分支/決策點、(b) ≥3 階段狀態轉移或多個終止狀態、(c) 跨模組/跨角色且順序即理解重點——
   內容為 user story 行為/決策流程、沿用其 classDef/節點慣例，位置在 Implementation Steps 之前。
2. `plan-format.hbs` 明訂 skip 條件（單一線性 happy path／無實質分支或狀態／單步驟 CRUD 時**不**產圖），
   且流程圖區塊不計入 120 行 `standard` 上限。
3. `prospec-plan.hbs` Phase 4 含一個 on-demand 產圖子步驟——達門檻時按需讀 `_diagram-conventions.md`
   並產圖——並明確標註**不得**加入 Startup Loading / stable prefix；Phase 4 Gate 含對應的條件式檢查項。
4. `quick` scale 維持既有 Entry Gate 行為：不產生 plan，亦不產生流程圖。
5. 契約測試以 section-scoped、mutation-verified 方式釘住 AC1–AC3（含「不在 Startup Loading」負向斷言）；
   `startup-loading-baseline.json` 不變動。

**Priority:** High

---
