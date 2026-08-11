# Delta Spec: inject-resolved-knowledge-budgets

## ADDED

### REQ-LIB-028: Canonical knowledge-token-budget resolver in lib/config

**Feature:** drift-detection
**Story:** US-1

**Description:**
`resolveKnowledgeTokenBudget(config): KnowledgeSizeBudget` lives in `lib/config.ts` as the canonical config-resolution helper (sibling of `resolveBasePaths`/`resolveArtifactLanguage`), per-field overriding `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` with `config.knowledge?.token_budget`. Both `check.service` and `agent-sync` consume this single source — no consumer re-derives the merge (PB-006/PB-007).

**Acceptance Criteria:**
1. `resolveKnowledgeTokenBudget` is exported from `lib/config.ts`; no duplicate resolver exists elsewhere.
2. Unset fields fall back to `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`; set fields override per-field.
3. Dependency direction holds: `services → lib → types`; no `service → service` import for budget resolution.

**Priority:** High

---

### REQ-AGNT-035: agent-sync injects resolved budgets; templates carry no internal symbol

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent-sync` injects `l1_per_file`/`l2_per_module`/`readme_max_lines` (from `resolveKnowledgeTokenBudget(config)`) into the shared `templateContext`. The knowledge-loading skill templates render budgets from these `{{}}` variables and describe the budget source as `.prospec.yaml` `knowledge.token_budget` (editable) plus `prospec check knowledge-size` (runnable) — never the internal constant name.

**Acceptance Criteria:**
1. Any generated `SKILL.md` contains no `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` string.
2. With no `.prospec.yaml` override, rendered budgets equal the defaults (L1 1800 / L2 1000 tokens, README 100 lines).
3. With `knowledge.token_budget.l2_per_module: 1200`, a re-sync renders L2 = 1200.
4. The budget-source prose references `.prospec.yaml knowledge.token_budget` and `prospec check knowledge-size`.

**Priority:** High

---

### REQ-TESTS-049: Contract test — generated skills exclude the symbol and match the resolver

**Feature:** agent-integration
**Story:** US-1

**Description:**
A skill-format/agent-sync test asserts that rendered skill output excludes `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` and that the injected numbers equal `resolveKnowledgeTokenBudget(config)` for both a default and an overriding config fixture.

**Acceptance Criteria:**
1. Negative assertion: rendered skill output does NOT contain `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` (mutation-verified).
2. Positive assertion: rendered L1/L2/line numbers equal the resolver's output under default and override fixtures.

**Priority:** High

---

## MODIFIED

### REQ-TYPES-061: token_budget 誠實命名 + DEFAULT 單一來源

**Feature:** drift-detection
**Story:** US-1

**Before:**
`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 作為 knowledge-size 閾值與 index.md 宣告的單一權威來源。

**After:**
不變之外,單一來源現亦透過 lib resolver + agent-sync 注入,餵給**生成的 skill 模板預算渲染**(模板不再含寫死預算字面值);`KnowledgeSizeBudget`(resolved 型別)移至 `types/config.ts`,與 `TokenBudget`/`DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 同居。值與 warn-class 不變。

**Reason:**
消除生成文件對內部符號的洩漏,並讓預算契約集中於 types。

**Priority:** Medium

---

### REQ-SERVICES-065: check.service 注入 knowledge-size collector

**Feature:** drift-detection
**Story:** US-1

**Before:**
`resolveKnowledgeTokenBudget` 定義於 `check.service`,由 `check.service.execute` 呼叫注入 collector。

**After:**
`resolveKnowledgeTokenBudget` 改由 `lib/config` 提供;`check.service.execute` 仍以 `resolveKnowledgeTokenBudget(config)` 注入 `collectKnowledgeSize`(檢查路徑之唯讀性、確定性、逐欄覆蓋語意不變)。

**Reason:**
提升為中立 leaf(lib)的單一來源 helper,供 agent-sync 共用而不造成 service→service 耦合(PB-006)。

**Priority:** Medium

---

### REQ-KNOW-013: L0-L3 Layered Loading

**Feature:** ai-knowledge
**Story:** US-2

**Before:**
生成 `index.md` 時附 `## Progressive Knowledge Loading Strategy`,反映 L0-L3;skill 模板引用 Knowledge 時 Loading Strategy 與 L0-L3 定義一致。

**After:**
不變之外,Loading Strategy 的預算來源註解(skill 模板與 index.md)指向 `.prospec.yaml knowledge.token_budget` 與 `prospec check knowledge-size`,不再具名內部常數 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`;L0-L3 一致性與數字宣告不變。

**Reason:**
下游讀者看不到內部 TypeScript 符號;改指向下游可見/可執行的來源。

**Priority:** Medium

---
