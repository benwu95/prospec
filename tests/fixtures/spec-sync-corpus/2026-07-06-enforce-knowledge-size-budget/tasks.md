# Tasks: enforce-knowledge-size-budget

> TDD：每個 code 單元先寫 RED 測試再實作（`test:` 伴隨/先於 `feat:`）。分層順序 Types → Lib → Services → Templates → Tests。

## Types

- [x] T1 `DRIFT_CHECK_IDS` append `'knowledge-size'`（warn-class，第 11 個）+ 範圍註解 — `src/types/drift-report.ts` (REQ-TYPES-060)
- [x] T2 `TokenBudgetSchema` 重命名 `l0_max`→`l1_per_file`、`l1_per_module`→`l2_per_module`；新增 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET = {l1_per_file:1500, l2_per_module:400, readme_max_lines:100}` — `src/types/config.ts` (REQ-TYPES-061)

## Lib

- [x] T3 新增 `KnowledgeSizeItem` + `KnowledgeSizeSource` 介面（`{available, reason?, items[]}` 封套；item 含 path/kind/tokens/lines?/budget/over_by） — `src/lib/drift-sources.ts` (REQ-LIB-027)
- [x] T4 `collectKnowledgeSize(baseDir, knowledgePath, budget)`：讀 index.md + `CORE_CONVENTIONS`（L1）+ `modules/*/README.md`（L2），`estimateTokens` 計 token、L2 併計行數；`knowledgePath` 不存在 → `{available:false, reason}` — `src/lib/drift-sources.ts` (REQ-LIB-027)
- [x] T5 `evaluateKnowledgeSize`（純函式）：`!available→skipped`；L1>`l1_per_file`、L2 tokens>`l2_per_module` 或 lines>`readme_max_lines` → warn finding（detail 含 actual/budget/`TOKEN_ESTIMATOR_LABEL`）；import `KnowledgeSizeSource` — `src/lib/drift-checker.ts` (REQ-LIB-027)
- [x] T6 佈線：`DriftCheckInputs` 加 `knowledgeSize`；`runChecks` outcomes 加 `'knowledge-size': evaluateKnowledgeSize(...)`（窮盡護欄） — `src/lib/drift-checker.ts` (REQ-TYPES-060)

## Services

- [x] T7 `check.service.execute` 注入 `collectKnowledgeSize(paths.baseDir, paths.knowledgePath, budget)`，`budget` = DEFAULT 覆蓋 `config.knowledge?.token_budget` — `src/services/check.service.ts` (REQ-SERVICES-065)

## Templates & AI Knowledge

- [x] T8 `init/prospec.yaml.hbs` 的 `token_budget` seed 改重命名欄位（值同 DEFAULT） — `src/templates/init/prospec.yaml.hbs` (REQ-TEMPLATES-149)
- [x] T9 校正 `prospec/index.md` Progressive Loading 表：L1「≤1500 per file」、L2「≤400/module 且 ≤100 行」、L0 標 agent-injected 且註明不受 knowledge-size enforce；數字與 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 一致 — `prospec/index.md` (REQ-TYPES-061 誠實宣告)

## Tests

- [x] T10 `drift-report.test.ts`：frozen 數 10→11、清單加 `'knowledge-size'` — `tests/unit/types/drift-report.test.ts` (REQ-TESTS-048)
- [x] T11 `drift-checker.test.ts`：`emptyInputs` 補 `knowledgeSize`；`evaluateKnowledgeSize` 六情境（over-L1 / over-L2-tokens / over-L2-lines / 邊界 / skipped / config-override） — `tests/unit/lib/drift-checker.test.ts` (REQ-TESTS-048)
- [x] T12 `drift-sources.test.ts`：`collectKnowledgeSize` temp fixture（超標 + 合規 + 缺 knowledgePath skipped） — `tests/unit/lib/drift-sources.test.ts` (REQ-TESTS-048)
- [x] T13 `check.service.test.ts`：報告含 knowledge-size；更新「ten checks」→「eleven checks」措辭；skipped-never-PASS — `tests/unit/services/check.service.test.ts` (REQ-TESTS-048)
- [x] T14 config schema 測試：重命名欄位可驗證、`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 值斷言 — `tests/unit/types/config.test.ts`（無則新增） (REQ-TESTS-048)
- [x] T15 single-source 測試：讀 repo `prospec/index.md` 抽 L1/L2 預算數，斷言 == `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`（不一致 → FAIL） — `tests/unit/...`（drift 或 knowledge 目錄） (REQ-TESTS-048)

## Verification

- [x] T16 [V] `pnpm test` 全綠、新程式 coverage ≥ 80%；`pnpm build`/typecheck 通過（窮盡護欄不報錯）
- [x] T17 [V] 對現況跑 `prospec check`：確認 `knowledge-size` 對超標檔（index.md、_status-lifecycle、6 個 README）如實 WARN，報告含 knowledge-size 結果（SC-001/SC-002）

## Summary

- **Total Tasks:** 17（code 15 + verification 2）
