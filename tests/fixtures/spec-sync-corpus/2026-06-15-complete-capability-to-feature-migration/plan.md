# 實作計劃：完成 capability → feature 術語遷移收尾

## Overview

Product-First 規格遷移先前已完成主體（`specs/features/` 建立、舊規格封存、`feature-spec-format.hbs` 取代舊格式），但 `src/templates` 仍殘留 capability spec 的實作層殘骸：孤兒檔 `capability-spec-format.hbs`（`sdd-workflow` Feature Spec 的 `REQ-TEMPLATES-031` 已標 deprecated，但實作層未移除）、`prospec-new-story.hbs` 指向已不存在的 `specs/capabilities/` 載入路徑，以及 archive/implement 對 spec 產物的殘留「capability spec」用語。經使用者確認，runtime（`mcp.service.ts` resource description）與 docs（README MCP 表格）的「Capability spec」用語一併納入。

策略：以最小手術刀式變更完成收尾。**只遷移指向 `specs/capabilities/` 路徑或 `Capability Spec(s)`/`capability-spec-format` 產物名稱的引用；一般英文「capability」用語（含 `status-lifecycle.md.hbs:36` 的 graduated capabilities、`prospec-verify.hbs:116` 的 already-archived capability、`prospec-archive.hbs:82` 的 capability record）保留**。Feature Spec truth-layer（`sdd-workflow.md` / `mcp-server.md`）的對應用語不於 implement 直寫，改由 `delta-spec.md` MODIFIED/REMOVED 經 `/prospec-archive` Spec Sync graduation 同步。先以 guard 斷言 RED，再刪檔/改檔轉 GREEN。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|---------------------|---------|--------------|
| templates | Handlebars 模板庫（純資源，無 import） | `renderTemplate(name, ctx)` 消費 | — |
| services | 業務邏輯；`mcp.service.ts` 註冊 6 resources | `buildMcpServer(ctx)` | types, lib |
| tests | 4 層測試金字塔；contract 鎖模板格式 | vitest | all |

### Existing Patterns (from _conventions.md / module READMEs)
- `references/*.hbs` 經 `agent-sync.service.ts` 的 referenceMap 渲染為 `.md`——已確認 `capability-spec-format` **不在** referenceMap，刪檔不會 dangle。
- 改 Startup Loading `[DYNAMIC]` 項後必須重生 `startup-loading-baseline.json`（contract 斷言檢查 marker/order/item-set/MANDATORY/contiguity）。
- `status-lifecycle.md.hbs` 與 `prospec/ai-knowledge/_status-lifecycle.md` 內容 sync-lock（contract test `skill-format.test.ts:1645-1680`）——本變更**不觸** line 36，避免 sibling ripple。

### Architecture Constraints (from Constitution)
- P1：變更文件繁中；P4：TDD（guard 斷言先紅）；P5：README user-facing 同批更新。
- 依賴方向 `cli → services → lib → types`——本變更零新增 import，無反向依賴。
- 模板全英文（REQ-TEMPLATES-073）。

## Affected Modules
| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 刪 `capability-spec-format.hbs`；修 `prospec-new-story.hbs`（路徑+用語）、`prospec-archive.hbs:3`、`prospec-implement.hbs:152` |
| tests | High | 同步 `skill-format.test.ts`（移除孤兒引用+describe 區塊）、`startup-loading-baseline.json`；新增 guard 斷言 |
| services | Low | `mcp.service.ts:192` resource description 一行用語 |
| docs (README) | Low | `README.md` / `README.zh-TW.md` MCP 表格用語 |

## Call Chain

本變更為模板/字串/測試層級，無新增或變更執行期呼叫鏈。唯一 runtime 觸點為 `mcp.service.ts` 的 spec resource **靜態 metadata 字串**（`description` 欄位），不改變 `buildMcpServer → registerResource → readFeatureSpec` 的既有流程與行為。

## Implementation Steps

1. **RED — 新增 guard 斷言**
   - 於 `skill-format.test.ts` 新增：render 全部 skill 模板後斷言不含 `specs/capabilities/`；且 `references/` 不含 `capability-spec-format.hbs`。
   - 此時應紅（`new-story.hbs` 仍有 `specs/capabilities/`、REFERENCE_TEMPLATES 仍列孤兒檔）。

2. **刪除孤兒檔 + 同步其測試**
   - `git rm src/templates/skills/references/capability-spec-format.hbs`。
   - `skill-format.test.ts`：移除 REFERENCE_TEMPLATES 的 `'capability-spec-format.hbs'`、移除整個 `describe('Capability spec format structure')`；**保留** `Feature Spec Sync, not Capability Spec Sync` 等 migration-enforcing 斷言。

3. **修 new-story 載入路徑/用語 + baseline**
   - `prospec-new-story.hbs:22` `specs/capabilities/` → `specs/features/`，敘述「capability specs」→「feature specs」；`:144` 表格用語同步。
   - 重生 `startup-loading-baseline.json`：`{{base_dir}}/specs/capabilities/` → `{{base_dir}}/specs/features/`。

4. **修 skill 模板殘留 spec-產物用語**
   - `prospec-archive.hbs:3` description「capability specs」→「feature specs」；`prospec-implement.hbs:152`「capability spec inconsistency」→「Feature Spec inconsistency」。

5. **修 runtime + docs 用語**
   - `mcp.service.ts:192` description「Capability spec (REQ source of truth) for one feature」→「Feature spec (REQ source of truth) for one feature」。
   - `README.md:409` / `README.zh-TW.md:384` MCP 表格「Capability specs」→「Feature specs」。

6. **GREEN — 驗證**
   - `pnpm test` 全綠；`grep -rn "specs/capabilities/\|capability-spec-format" src/ README.md README.zh-TW.md`（排除 `_archived*`）無結果；`grep -n "Capability spec" src/services/mcp.service.ts README*.md` 無結果。

## Risk Assessment
| Risk | Impact | Mitigation |
|------|--------|------------|
| 誤改一般英文 capability 用語 | Medium | guard 斷言只針對 `specs/capabilities/` 路徑與 `capability-spec-format` 名稱；plan/proposal 明列 KEEP 清單 |
| 刪檔導致 referenceMap dangle | Low | 已確認 `capability-spec-format` 不在 `agent-sync.service.ts` referenceMap |
| baseline fixture 漏同步 | Medium | contract 斷言檢查 item-set equality，漏更新即紅 |
| 動 line 36 觸發 status-lifecycle sibling sync 破測 | Low | 本變更不觸 line 36（屬一般英文用語，KEEP） |
| truth-layer 用語未同步 | Low | delta-spec MODIFIED/REMOVED 經 archive graduation 同步，非 implement 直寫 |
