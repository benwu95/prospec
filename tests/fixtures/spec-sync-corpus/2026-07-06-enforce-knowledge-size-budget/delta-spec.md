# Delta Spec: enforce-knowledge-size-budget

> 全數路由至 `specs/features/drift-detection.md`；對應 proposal US-1（check）+ US-2（誠實宣告），於 feature spec 收斂為 **US-8**（沿用 US-5/6/7 每變更加一 US 的慣例）。

## ADDED

### REQ-TYPES-060: Drift Report knowledge-size Check Id

**Feature:** drift-detection
**Story:** US-8

**Description:**
`DRIFT_CHECK_IDS` append `knowledge-size`（第 11 個 frozen check id，**warn-class**；additive-only、不動 `knowledge_health` 凍結契約）。未於 `runChecks` dispatch 對應 evaluator 即編譯失敗（`Record<DriftCheckId, CheckOutcome>` 窮盡護欄）。

**Acceptance Criteria:**
1. `DRIFT_CHECK_IDS` 含 `knowledge-size`，總數 11。
2. 未加對應 evaluator dispatch 則 TypeScript 編譯失敗。

**Priority:** High

---

### REQ-TYPES-061: token_budget 誠實命名 + DEFAULT 單一來源

**Feature:** drift-detection
**Story:** US-8

**Description:**
`TokenBudgetSchema` 欄位重命名 `l0_max`→`l1_per_file`、`l1_per_module`→`l2_per_module`（`readme_max_lines` 不變，皆 optional），名實對齊 index.md 的 L1/L2 語意。新增 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET = { l1_per_file: 1500, l2_per_module: 400, readme_max_lines: 100 }` 作為 knowledge-size 閾值的**單一權威來源**。

**Acceptance Criteria:**
1. schema 匯出重命名後欄位；`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 匯出且值為 1500/400/100。
2. 舊欄位名於整個 codebase 無殘留引用（grep 空）。

**Priority:** High

---

### REQ-LIB-027: knowledge-size Collector + Evaluator

**Feature:** drift-detection
**Story:** US-8

**Description:**
`collectKnowledgeSize(baseDir, knowledgePath, budget)`（I/O）：讀 `index.md` + 每個 `CORE_CONVENTIONS`（L1）與 `modules/*/README.md`（L2），以 `estimateTokens` 計 token、L2 併計行數；`knowledgePath` 不存在 → `{available:false, reason}`（永不偽 PASS）。pure `evaluateKnowledgeSize`：L1 檔 tokens > `l1_per_file`、L2 README tokens > `l2_per_module` 或 lines > `readme_max_lines` → **warn** finding（detail 含 actual/budget/`TOKEN_ESTIMATOR_LABEL`）。

**Acceptance Criteria:**
1. 超標檔各發 warn finding（`source_path` + detail 含實測值與預算）；`≤` 邊界不 warn。
2. `!available → skipped` + reason；evaluator 維持 I/O-free、findings codepoint-sort。
3. config 提供 `knowledge.token_budget` 時覆蓋 DEFAULT。

**Priority:** High

---

### REQ-SERVICES-065: check.service 注入 knowledge-size collector

**Feature:** drift-detection
**Story:** US-8

**Description:**
`check.service.execute` 將 `collectKnowledgeSize(paths.baseDir, paths.knowledgePath, budget)` 注入 `runChecks`，`budget` = `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 覆蓋 `config.knowledge?.token_budget`；純檢查路徑維持唯讀、確定性。

**Acceptance Criteria:**
1. `prospec check` / `prospec-report.json` 含 `knowledge-size` 結果。
2. 不需 module-map（module 名由 README 路徑推得）。

**Priority:** High

---

### REQ-TEMPLATES-149: init scaffold 採用重命名 budget 欄位

**Feature:** drift-detection
**Story:** US-8

**Description:**
`init/prospec.yaml.hbs` 的 `knowledge.token_budget` seed 改用 `l1_per_file`/`l2_per_module`/`readme_max_lines`，值與 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 一致。

**Acceptance Criteria:**
1. 模板 seed 欄位名與 schema 一致；`prospec init` 產出可被 schema 驗證通過。

**Priority:** Medium

---

### REQ-TESTS-048: knowledge-size 引擎測試 + single-source 斷言

**Feature:** drift-detection
**Story:** US-8

**Description:**
`evaluateKnowledgeSize`（over-L1/over-L2-tokens/over-L2-lines/邊界/skipped/config-override）；`collectKnowledgeSize`（temp fixture：超標 + 合規 + 缺 knowledgePath）；`drift-report.test.ts` frozen 數 10→11 + 清單加 id；**single-source 測試**：讀 repo `prospec/index.md` 抽 L1/L2 預算數，斷言 == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`。

**Acceptance Criteria:**
1. 上述情境皆有斷言、mutation-verified；coverage ≥ 80%。
2. single-source 測試在宣告與常數不一致時 FAIL。

**Priority:** High

---

## MODIFIED

### REQ-TYPES-052: Drift Report review-provenance Check Id（frozen 總數）

**Feature:** drift-detection
**Story:** US-8

**Before:** `DRIFT_CHECK_IDS` ... 共 **10** 個 frozen check id。

**After:** `DRIFT_CHECK_IDS` ... 共 **11** 個 frozen check id（append `knowledge-size`，warn-class）。

**Reason:** 新增第 11 個 check，此 REQ 為 frozen 計數權威來源，須同步。

**Priority:** High

---

### REQ-TYPES-034: Drift Report mcp-readme-counts Check Id（計數引用）

**Feature:** drift-detection
**Story:** US-8

**Before:** 當前 frozen check id 總數見 REQ-TYPES-052（**10** 個，含 metadata-completeness）。

**After:** 當前 frozen check id 總數見 REQ-TYPES-052（**11** 個，含 knowledge-size）。

**Reason:** 同步 frozen 計數引用。

**Priority:** Low

---

### REQ-TESTS-045: metadata-completeness 引擎測試（skipped-never-PASS 計數）

**Feature:** drift-detection
**Story:** US-8

**Before:** `check.service` 注入 + skipped-never-PASS 全 **10** checks——S/A clause 與 skill clause mutation-verified。

**After:** `check.service` 注入 + skipped-never-PASS 全 **11** checks（含 knowledge-size）——S/A clause 與 skill clause mutation-verified。

**Reason:** 新增第 11 個 check 後，空專案 skipped-never-PASS 測試的 check 總數同步 10→11（review 揪出的 incidental 計數）。

**Priority:** Low
