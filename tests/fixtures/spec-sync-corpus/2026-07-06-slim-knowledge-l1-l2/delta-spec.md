# Delta Spec: slim-knowledge-l1-l2

> REQ ID format: `REQ-{MODULE}-{NUMBER}` (e.g. REQ-AUTH-001)
> Backfill (`scale: backfill`): a feature-first REQ-id `REQ-{FEATURE-SLUG}-{NUMBER}` is allowed — archive routes by the **Feature:** field and derives modules from `related_modules`/feature-map.

## ADDED

### REQ-KNOW-037: index.md Description Column Is Routing-Only

**Feature:** ai-knowledge
**Story:** US-1

**Description:**
The `index.md` Modules table `Description` column carries only routing-level positioning (1-2 sentences on what the module is / when to look here), never accumulated implementation detail (REQ ids, function names, per-change behavior). Such detail belongs in L2 (module README + its sub-modules), per index.md Principle 2 (no lower-layer duplication). The single source of the cell is `module-map.yaml` `description` — curate there, not by hand-editing the index cell (the auto block is regenerated from module-map).

**Acceptance Criteria:**
1. Each Modules-table `Description` cell is routing-only (1-2 sentences); implementation detail lives in the module README / sub-modules and the Keywords/Aliases/Status/Depends On columns.
2. `module-map.yaml` `description` is the single source; `index.md` Description equals it after regeneration.
3. `index.md` stays within the L1 per-file token budget (`knowledge-size` PASS for index.md).

**Priority:** High

---

## MODIFIED

### REQ-TYPES-061: token_budget 誠實命名 + DEFAULT 單一來源

**Feature:** drift-detection
**Story:** US-2

**Before:** `DEFAULT_KNOWLEDGE_TOKEN_BUDGET = {l1_per_file:1500, l2_per_module:400, readme_max_lines:100}` — the single authoritative source for the `knowledge-size` thresholds and the index.md declared budgets (introduced by issue #63; `TokenBudgetSchema` fields `l1_per_file`/`l2_per_module`/`readme_max_lines`, all optional, per-field overridable via `.prospec.yaml`).

**After:** `l1_per_file` default raised **1500 → 1800** and `l2_per_module` default raised **400 → 1000**; `readme_max_lines` (100) unchanged. Schema, override mechanism, single-source role, and warn-class severity all unchanged — only the two token default values move. The `.prospec.yaml` init seed (`prospec.yaml.hbs`) tracks both (REQ-TEMPLATES-149).

**Reason:** Empirical calibration in both layers. L1: after the index Description column is slimmed to routing-only (REQ-KNOW-037), a healthy 6-module index still measures ~1562 tokens — the structural floor of a disciplined index. L2: a slimmed, self-contained module map for a real module (e.g. services, 16 files) floors at ~1000 tokens even after removing all accumulated implementation detail; 400 would force fragmenting every large module into many sub-modules, which harms navigability against the convention's intent. Both new values still WARN on genuine regrowth (the pre-slim 3239 index / 4861-token READMEs, a ~2–5× ratchet) while staying a pressure signal, never a build breaker.

---

### REQ-KNOW-013: L0-L3 Layered Loading

**Feature:** ai-knowledge
**Story:** US-2

**Before:** AC declares L1 as "root `index.md` + Core Conventions, **≤1,500 tokens total**" and L2 as "module READMEs **≤400 tokens/module**".

**After:** AC declares L1 as "root `index.md` + Core Conventions, **≤1,800 tokens per file** (index.md and each core convention individually)" and L2 as "module READMEs **≤1,000 tokens/module**".

**Reason:** Two-fold alignment. (1) Values: track the REQ-TYPES-061 calibration (L1 1800, L2 1000). (2) Semantics: #63 moved the L1 budget from a *total* to a *per-file* model (`l1_per_file`), but this REQ's AC and the generated `index.md` Progressive Loading section still said "total"; align the wording to per-file so the single-source assertion (REQ-TESTS-048, which reads the index.md declared L1/L2 values and asserts equality with `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`) reflects the real model.

---

### REQ-KNOW-011: Module README Token Budget

**Feature:** ai-knowledge
**Story:** US-3

**Before:** AC: "WHEN generating module README, THEN keep within 100 lines and a **≤400 token** budget."

**After:** AC: "WHEN generating module README, THEN keep within 100 lines and a **≤1000 token** budget." The line budget (100) is unchanged; the `_module-readme-conventions.md` `## Sub-Modules` extraction guidance is unchanged (still the escape hatch for a genuinely content-rich independent sub-area).

**Reason:** Same L2 calibration as REQ-TYPES-061 — a slimmed, self-contained module map floors near ~1000 tokens for a real module; 400 forced over-fragmentation. All six module READMEs are brought within the new budget as routing maps (no sub-modules needed at this scale).

---

## REMOVED

_No removals in this change._
