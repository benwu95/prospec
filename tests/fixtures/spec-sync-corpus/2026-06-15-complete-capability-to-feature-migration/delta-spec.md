# Delta Spec：完成 capability → feature 術語遷移收尾

> 本變更主體為「移除/修正」既有引用，無新增需求，故無 ADDED 段落。
> Feature Spec truth-layer 的對應條文用語改由以下 MODIFIED/REMOVED 經 `/prospec-archive` Spec Sync graduation 同步。

## MODIFIED

### REQ-CHNG-006: Load Proposal and Module Context

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
- WHEN matching capability specs exist, THEN load as Layer 0 context

（planning skills 的 Layer-0 spec 載入來源以「capability specs」描述；`prospec-new-story.hbs` 的 `[DYNAMIC]` 載入路徑仍指向已不存在的 `{{base_dir}}/specs/capabilities/`。）

**After:**
- WHEN matching feature specs exist, THEN load as Layer 0 context

（Layer-0 spec 載入來源統一為 Product-First 路徑 `{{base_dir}}/specs/features/`；`prospec-new-story.hbs` `[DYNAMIC]` 載入路徑修正為 `specs/features/`。）

**Reason:**
`specs/capabilities/` 於 Product-First 遷移後已不存在，舊路徑導致 new-story 載入空集合；用語與路徑對齊 `specs/features/` 真相層。

**Priority:** High

---

### REQ-CHNG-009: Generate plan.md

**Feature:** sdd-workflow
**Story:** US-2

**Before:**
- WHEN MODIFIED requirements, THEN reference Before from capability spec

**After:**
- WHEN MODIFIED requirements, THEN reference Before from feature spec

**Reason:**
規格真相層已由 Capability Spec 全面轉為 Feature Spec；MODIFIED 的 Before 來源敘述同步更名，消除殘留術語。

**Priority:** Medium

---

### REQ-MCP-003: Spec resources 與 archived 排除單一來源

**Feature:** mcp-server
**Story:** US-2

**Before:**
`spec://feature/{name}` resource 的 metadata description 為「Capability spec (REQ source of truth) for one feature」；US-2 敘述以「列舉與讀取 capability specs」描述。

**After:**
resource description 改為「Feature spec (REQ source of truth) for one feature」；US-2 敘述改為「列舉與讀取 feature specs」。resource 行為（per-request 讀取、`_archived*` 排除、name 護欄）不變。

**Reason:**
該 resource 實際讀取的是 `specs/features/`（`listFeatureSpecs`/`readFeatureSpec`），description 卻仍稱「Capability spec」，屬遷移殘留用語；對齊實際真相層名稱。

**Priority:** Medium

---

## REMOVED

### REQ-TEMPLATES-031: Capability Spec Format Reference

**Reason:**
此 REQ 已於 `sdd-workflow` Feature Spec 標記 deprecated（由 REQ-SPEC-010 Feature Spec Format 取代，Feature Spec 涵蓋 Capability Spec 全部資訊）。但實作層孤兒檔 `src/templates/skills/references/capability-spec-format.hbs` 與其 contract 測試（`skill-format.test.ts` 的 `Capability spec format structure` describe 區塊、REFERENCE_TEMPLATES 清單項）一直未移除。本變更完成實作層物理移除，使 deprecated 狀態與實作一致。已確認該檔不在 `agent-sync.service.ts` referenceMap，無 skill 引用，移除安全。
