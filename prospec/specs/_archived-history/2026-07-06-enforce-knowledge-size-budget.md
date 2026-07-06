# enforce-knowledge-size-budget — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06
- **Quality Grade**: A

## User Story

As a prospec 維護者,
I want 一個機器可查的 `knowledge-size` drift check，且 `index.md` 的預算宣告與 check 閾值單一來源一致,
So that 知識庫檔案超出宣告的 token 預算時能被自然接住，宣告不再與查核脫節（誠實邊界）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | `DRIFT_CHECK_IDS` append `knowledge-size`（第 11）；`TokenBudgetSchema` 誠實重命名 + `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 單一來源常數 |
| lib | High | `collectKnowledgeSize`（drift-sources）+ `evaluateKnowledgeSize`（drift-checker）+ `runChecks` 佈線 |
| services | Low | `check.service` 注入 collector；`resolveKnowledgeTokenBudget`（DEFAULT 覆蓋 config） |
| templates | Low | `init/prospec.yaml.hbs` seed 改用重命名欄位 |
| tests | Medium | 引擎 + single-source + config 測試（coverage 96.95%） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-060 | ADDED | Drift Report knowledge-size Check Id（warn-class，第 11） |
| REQ-TYPES-061 | ADDED | token_budget 誠實命名 + DEFAULT_KNOWLEDGE_TOKEN_BUDGET 單一來源 |
| REQ-LIB-027 | ADDED | knowledge-size Collector + Evaluator |
| REQ-SERVICES-065 | ADDED | check.service 注入 knowledge-size collector |
| REQ-TEMPLATES-149 | ADDED | init scaffold 採用重命名 budget 欄位 |
| REQ-TESTS-048 | ADDED | knowledge-size 引擎測試 + single-source 斷言 |
| REQ-TYPES-052 | MODIFIED | frozen check id 總數 10 → 11 |
| REQ-TYPES-034 | MODIFIED | frozen 計數引用 10 → 11 |
| REQ-TESTS-045 | MODIFIED | skipped-never-PASS 全 10 → 11 checks |

## Completion

- **Tasks**: 15/15 code tasks (100%) + 2 [V] verification tasks done
- **Acceptance Criteria**: SC-001~005 met（`prospec check` 含 knowledge-size、對現況如實 WARN、宣告=閾值單一來源、總數 11、coverage ≥80%）

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — 獨立 fresh-context reviewer；major＝知識庫/spec「10→11」計數（knowledge 部分已於 verify commit-prompt 同步，drift-detection.md 於本次 archive graduate）
- **Verify**: Grade A, 5/5 dimensions PASS（3/5 帶 1 個 [SHOULD] User-Facing-Doc advisory WARN）；full suite 2079 tests green, coverage 96.95% lines / 93.67% branch
- **Quality Log**: 1 verify WARN（root README check 清單補 knowledge-size — 已於 feature commit 補列）；1 review major（同上，advisory）

## Knowledge Update

Synced at the verify S/A commit prompt (folded into the feature commit):
- `prospec/ai-knowledge/modules/{types,lib,services,templates,tests}/README.md`
- `prospec/index.md` + `prospec/ai-knowledge/module-map.yaml`（「10→11」+ knowledge-size 描述）
