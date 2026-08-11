# 完成 capability → feature 術語遷移收尾

## Background

專案先前已從 Capability-centric 規格架構遷移至 Product-First（Feature Spec）架構，`prospec/specs/features/` 已建立、舊規格已封存至 `_archived-capabilities/`，`feature-spec-format.hbs` 也已取代舊格式。但遷移收尾並不完整：`src/templates/skills/references/capability-spec-format.hbs` 這個孤兒檔仍存在（無任何 skill 引用它，且 `sdd-workflow` Feature Spec 的 `REQ-TEMPLATES-031` 早已標記 deprecated），且多個 skill 模板、runtime resource 描述與 README 仍殘留指向已不存在的 `specs/capabilities/` 路徑或「Capability spec」用語。這些殘骸會把讀模板的 agent 導向失效路徑，並讓現行版本對外呈現不一致的術語。

## User Stories

### US-1: 清除 src/templates 的 capability spec 殘骸 [P1]

As a prospec 維護者，
I want 移除 `src/templates` 中殘留的 capability spec 孤兒檔與失效路徑/用語，
So that 讀 skill 模板工作的 agent 不再被導向已不存在的 `specs/capabilities/` 路徑或已棄用格式，現行模板術語與 Feature Spec 架構一致。

**Acceptance Scenarios:**

- WHEN 列出 `src/templates/skills/references/`，THEN `capability-spec-format.hbs` 不存在，`feature-spec-format.hbs` 為唯一 spec 格式參考。
- WHEN render `prospec-new-story.hbs`，THEN 其 `[DYNAMIC]` 載入路徑為 `specs/features/`，且不含 `specs/capabilities/`。
- WHEN 搜尋 `src/templates`（排除一般英文 capability 用語），THEN 無任何指向 capability spec 格式或 `specs/capabilities/` 路徑的現行引用。
- WHEN `pnpm test`，THEN 全綠（`skill-format.test.ts` 與 `startup-loading-baseline.json` 已同步）。

**Independent Test:**
刪檔 + 修模板後，`grep -rn "specs/capabilities/\|capability-spec-format" src/templates` 無結果，且 `pnpm test` 全綠。

### US-2: 修正 runtime 與 docs 殘留的「Capability spec」用語 [P2]

As a 透過 MCP 或 README 認識 prospec 的使用者，
I want MCP Feature Spec resource 描述與 README MCP 表格使用「Feature spec」而非「Capability spec」，
So that 對外呈現的術語與遷移後架構一致，不再殘留 capability 概念。

**Acceptance Scenarios:**

- WHEN 讀取 MCP `spec://feature/{name}` resource 的 metadata，THEN description 為「Feature spec ...」而非「Capability spec ...」。
- WHEN 查 `README.md` / `README.zh-TW.md` 的 MCP resources 表格，THEN `spec://feature/{name}` 描述為「Feature specs」而非「Capability specs」。

**Independent Test:**
`grep -n "Capability spec" src/services/mcp.service.ts README.md README.zh-TW.md` 無結果。

## Edge Cases

- 一般英文「capability」用語**不得誤改**（指「系統能力」而非 Capability Spec 產物／路徑）：`prospec-ff.hbs`（FF's core capability）、`prospec-design.hbs`（MCP tools and capabilities）、`product-spec-format.hbs`（roadmap「Key Capabilities」欄位）、`feature-spec-format.hbs`（I want [capability]）、`scripts/measure/providers.ts`（model capability）、`prospec-verify.hbs:116`（already-archived capability）、`prospec-archive.hbs:82`（permanent capability record）、`init/status-lifecycle.md.hbs:36`（graduated capabilities，且與 `prospec/ai-knowledge/_status-lifecycle.md` sync-locked，動它會牽連 scope 外檔案）。
- 歷史封存**不得改**：`prospec/specs/_archived-capabilities/*`、`prospec/specs/MIGRATION.md`（遷移歷史文件）。
- 刪除 `capability-spec-format.hbs` 後，`skill-format.test.ts`（REFERENCE_TEMPLATES 清單 + `Capability spec format structure` describe 區塊）與 `startup-loading-baseline.json`（`specs/capabilities/` 項）**必須同步**，否則 build 紅；migration-enforcing 斷言（`Feature Spec Sync, not Capability Spec Sync`）須**保留**。
- Feature Spec truth-layer 指向 spec 產物的殘留用語（`sdd-workflow.md` 行 86/99、`mcp-server.md` 行 73）**不於 implement 直寫**——改由 `delta-spec.md` MODIFIED/REMOVED（REQ-CHNG-006/009、REQ-MCP-003）記錄，經 `/prospec-archive` Spec Sync graduation 同步（遵守「archive 為 Feature Spec 唯一寫入者」）。注意 `sdd-workflow.md:209`「already-archived capability regresses」屬一般英文（對應 KEPT 的 `prospec-verify.hbs:116`），不列 delta-spec、不需 graduation。

## Functional Requirements

- **FR-001**: 刪除 `src/templates/skills/references/capability-spec-format.hbs`。
- **FR-002**: `prospec-new-story.hbs` 的 `[DYNAMIC]` 載入由 `{{base_dir}}/specs/capabilities/` 改為 `{{base_dir}}/specs/features/`，並把對應「capability specs」敘述改為「feature specs」（含行 144 檢核表格用語）。
- **FR-003**: 修正指向 spec 產物的殘留「capability spec(s)」用語為「feature/Feature Spec」——`prospec-archive.hbs`（行 3 description）、`prospec-implement.hbs`（行 152）。（plan 階段判定：`prospec-archive.hbs:82`「capability record」、`prospec-verify.hbs:116`「already-archived capability」、`init/status-lifecycle.md.hbs:36`「graduated capabilities」皆屬一般英文用語，KEEP——見 Edge Cases。）
- **FR-004**: `tests/contract/skill-format.test.ts` 從 `REFERENCE_TEMPLATES` 移除 `'capability-spec-format.hbs'`，移除整個 `describe('Capability spec format structure')` 區塊；保留 migration-enforcing 斷言。
- **FR-005**: `tests/fixtures/startup-loading-baseline.json` 的 `prospec-new-story.items` 內 `{{base_dir}}/specs/capabilities/` 改為 `{{base_dir}}/specs/features/`。
- **FR-006**: `src/services/mcp.service.ts` Feature Spec resource 的 `description`「Capability spec (REQ source of truth) for one feature」改為「Feature spec ...」。
- **FR-007**: `README.md` 與 `README.zh-TW.md` 的 MCP resources 表格中 `spec://feature/{name}` 描述「Capability specs」改為「Feature specs」。
- **FR-008**: 新增 guard 斷言（於 `skill-format.test.ts` 或同層 contract test），防止未來再現指向 `specs/capabilities/` 路徑或 `capability-spec-format` 的現行模板引用。

## Success Criteria

- **SC-001**: `grep -rn "specs/capabilities/\|capability-spec-format" src/ README.md README.zh-TW.md`（排除 `_archived*`）無結果。
- **SC-002**: `pnpm test` 全綠（含新增 guard 斷言）。
- **SC-003**: `src/templates/skills/references/capability-spec-format.hbs` 不存在。
- **SC-004**: `grep -n "Capability spec" src/services/mcp.service.ts README.md README.zh-TW.md` 無結果。

## Related Modules

- **templates**: 刪除 `capability-spec-format.hbs`、修正 skill 模板與 init 模板的路徑/用語（High）。
- **tests**: 同步 `skill-format.test.ts` 與 `startup-loading-baseline.json`、新增 guard 斷言（High）。
- **services**: `mcp.service.ts` resource description 一行用語修正（Low）。

## Open Questions

_(無——scope 已於前置偵察與使用者確認中釐清)_

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] P1（繁中變更文件）：本 proposal 及後續 plan/delta-spec/tasks 皆繁中，code/識別字/commit 英文。
- [x] P3（INVEST）：US-1/US-2 各自獨立可交付、可測、有明確 AC。
- [x] P4（TDD）：FR-008 guard 斷言先紅後綠；FR-004/005 為既有測試同步。
- [x] P5（README [SHOULD]）：FR-007 於同批更新 root README（user-facing surface），符合。
- [x] 依賴方向 `cli → services → lib → types`：本變更不新增任何 import，無反向依賴。

## UI Scope

**Scope:** none
