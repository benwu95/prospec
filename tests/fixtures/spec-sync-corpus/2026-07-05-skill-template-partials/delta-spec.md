# Delta Spec：skill template boilerplate partial 化 + generated 標記

## ADDED

### REQ-TEMPLATES-143: Boilerplate Partials Single Source

**Feature:** agent-integration
**Story:** US-1

**Description:**
skill template 間 verbatim-identical 的 boilerplate 段落（至少 Next-Step Handoff）抽成 `src/templates/skills/_*.hbs` Handlebars partials，各 template 以 `{{> ...}}` 引用單一來源（PB-006）；`template.ts` `ensureBuiltinPartials` 註冊之。per-skill 變異段落保留 inline（不強抽破壞 byte-identical）。

**Acceptance Criteria:**
1. 至少 Next-Step Handoff 收斂為單一 partial，引用它的 template 不再各存一份
2. 重新 render + 部署的 SKILL.md 與現況 byte-identical（generated 標記除外）
3. 新 partials 於 `ensureBuiltinPartials` 註冊（lazy）

**Priority:** High

---

### REQ-TEMPLATES-144: SKILL.md Generated Marker

**Feature:** agent-integration
**Story:** US-2

**Description:**
部署的 SKILL.md 於 frontmatter 後帶 generated 標記，註明由 `src/templates/skills/{name}.hbs` 生成、手改會在下次 `agent sync` 被覆寫、修改請改 template。標記為唯一相對現況的輸出差異，且不破壞 frontmatter YAML 與既有契約斷言。

**Acceptance Criteria:**
1. 每個部署 SKILL.md 含 generated 標記（來源指引）
2. 標記外 SKILL.md 輸出零變化（byte-identical）
3. frontmatter 仍為合法 YAML；既有 skill-format 契約通過

**Priority:** High

---

### REQ-TESTS-047: Partial Single-Source + Marker Contract

**Feature:** agent-integration
**Story:** US-1

**Description:**
契約測試釘住：boilerplate 已 partial 化（引用 template 不含 inline 副本、含 `{{> ...}}`）、generated 標記存在、且 render 輸出對 partial 展開 byte-identical。mutation-verified。

**Acceptance Criteria:**
1. 移除 partial 引用或改回 inline 副本 → 斷言轉紅
2. generated 標記缺失 → 斷言轉紅

**Priority:** High

---

## Spec Impact（graduation 備註）

- templates/lib/tests module README 於 verify S/A commit 同步（partials 單一來源、ensureBuiltinPartials 註冊、generated 標記）；agent-integration REQ 於 archive Phase 3.5 graduate。
