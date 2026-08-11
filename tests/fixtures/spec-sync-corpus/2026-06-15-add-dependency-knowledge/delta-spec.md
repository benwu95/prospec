# Delta Spec: add-dependency-knowledge（BL-034）

> REQ ID format: REQ-{MODULE}-{NUMBER}（本變更為純 templates/tests 變更，Architecture C）

## ADDED

### REQ-TEMPLATES-101: Plan optional on-demand 第三方 lib usage 注入

**Feature:** sdd-workflow
**Story:** US-1

**Description:**
`prospec-plan` Phase 4 新增一個 optional、in-Phase（非 Startup Loading）步驟：當本次變更觸及第三方 library 時，若有可用的 Context7 MCP，解析 library 並取 usage snippet，注入 Technical Summary 的「External Library Usage」子節（標示為 informational/untrusted）。

**Acceptance Criteria:**
1. `src/templates/skills/prospec-plan.hbs` Phase 4 含條件式步驟，觸發條件明示「觸及第三方 lib」(scope guard) 且「if a Context7 MCP is available」。
2. 工具以能力／短名（resolve-library-id、query-docs）寫於 prose，不硬編 `mcp__…` 完整 id。
3. 步驟非 Startup Loading 項目，未新增任何 `[STABLE]` 標記；`tests/fixtures/startup-loading-baseline.json` 不變。
4. 注入內容標示 untrusted、不被執行、不作 gate。

**Priority:** High

---

### REQ-TEMPLATES-102: Implement optional on-demand 第三方 lib 查詢（補 quick 缺口）

**Feature:** sdd-workflow
**Story:** US-2

**Description:**
`prospec-implement` Phase 2/3 新增一個 optional、per-task lazy 的條件式區塊（比照「For UI tasks — MCP-first」形狀）：當某 task 觸及第三方 library 且 Context7 可用時，寫 code 前 on-demand 取 usage 作參考；明示 `scale: quick`（無 plan/Technical Summary）為主要受益路徑。

**Acceptance Criteria:**
1. `src/templates/skills/prospec-implement.hbs` Phase 2/3 含「For tasks touching third-party libraries」條件式區塊。
2. 查詢為 per-task lazy，非 startup 批次載入。
3. 文字明示 quick-scale 適用且輸出為 untrusted 參考。

**Priority:** Medium

---

### REQ-TEMPLATES-103: 依賴層查詢的 graceful／untrusted／non-gating 契約

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
plan/implement 的 Context7 步驟必須 graceful degradation：不可用或查無結果時靜默跳過，並只留一行 informational 註記（非 WARN/FAIL/gate/阻擋），調和專案「絕不靜默 fallback」慣例與 BL-034「靜默跳過」要求。

**Acceptance Criteria:**
1. skill/reference 文字含「if a Context7 MCP is available」「skip silently」等 graceful 措辭。
2. miss/unavailable → plan Technical Summary 或 Knowledge Quality Gate 留一行 informational 註記。
3. 文字明示輸出 untrusted、不執行、不作任何 verify/review gate。

**Priority:** High

---

### REQ-TESTS-027: 依賴層步驟的 section-scoped + mutation-verified 契約斷言

**Feature:** sdd-workflow
**Story:** US-3

**Description:**
`tests/contract/skill-format.test.ts` 新增契約斷言，section-scoped 釘住 REQ-TEMPLATES-101/102/103 的步驟與字樣，且 mutation-verified（移除步驟即轉紅）；含 negative assertion 確認未新增 `[STABLE]` 標記。

**Acceptance Criteria:**
1. 斷言自 plan/implement skill 對應區段切片，驗證步驟存在 + graceful/untrusted/non-gating 字樣。
2. 移除任一步驟 → 對應斷言轉紅（mutation-verify）。
3. negative-assert：plan/implement Startup Loading 未因本變更新增 `[STABLE]` 項。

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-044: plan-format.hbs Technical Summary Section

**Feature:** sdd-workflow
**Story:** US-1

**Before:**
WHEN referenced, THEN includes Brownfield/Greenfield mutually exclusive formats.

**After:**
WHEN referenced, THEN includes Brownfield/Greenfield mutually exclusive formats，**外加一個 optional、additive 的「External Library Usage (on-demand, informational)」子節**（untrusted、miss 時留 informational 註記）；Brownfield/Greenfield 互斥語意不變。

**Reason:**
BL-034 在 Technical Summary 格式中新增 optional 依賴層子節作為 Context7 snippet 落點；既有互斥格式不受影響。

**Priority:** Medium

---

## REMOVED

（無）
