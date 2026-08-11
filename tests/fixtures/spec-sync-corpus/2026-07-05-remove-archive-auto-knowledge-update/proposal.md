# Proposal：移除 archive.service 自動 knowledge-update 死碼

## Background

`prospec archive` 沒有對應的 CLI 指令，`archive.service.execute()` 目前只被測試引用。它在歸檔後會自動觸發 `executeKnowledgeUpdate`（→ `updateIndex`）與 `generateRawScan` 兩段 safety net：前者重建 `index.md` module 表時只填 Module/Status/Description 三欄、其餘 curated 欄位一律清成 `—`，再就地取代整個 `prospec:auto` block，正好會清空住在 auto block 內的 curated 豐富表格。更糟的是 `prospec-archive` skill template 在決策點放了反向宣稱，把這些 auto side effect 描述為「idempotent safety net / no-op」，正確警告卻只存在 prospec-upgrade skill。目前僅靠 session memory 規則防誤觸。本變更為止血：移除死碼與反向宣稱；`updateIndex` 保真度的根治（curated 欄位不被清空）另開 issue 處理。（來源：稽核報告 01-C2、04-C3。）

## User Stories

### US-1：移除 archive service 的自動 knowledge 副作用 [P1]

As a prospec 維護者，
I want `archive.service.execute()` 不再自動觸發 knowledge-update 與 raw-scan safety net，
So that 歸檔流程不會有清空 curated `index.md` 的危險死碼，手動逐 phase 成為唯一路徑。

**Acceptance Scenarios:**

- WHEN 呼叫 `execute()` 且有變更被歸檔, THEN 不再呼叫 `executeKnowledgeUpdate`（`updateIndex` 不被觸發）
- WHEN 呼叫 `execute()` 且有變更被歸檔, THEN 不再呼叫 `generateRawScan`
- WHEN 檢視 `ArchiveResult` 型別, THEN 不再含 `knowledgeUpdated`、`knowledgeWarnings`、`rawScanRefreshed` 欄位；`archive.service` 不再 import 這兩個被移除的相依

**Independent Test:**
單元測試斷言 `execute()` 執行後 `executeKnowledgeUpdate` 與 `generateRawScan` 皆未被呼叫；`pnpm test`、`pnpm typecheck` 全綠。

### US-2：修正 skill template 的反向宣稱 [P1]

As a 執行 `/prospec-archive` 的 AI agent，
I want skill template 誠實描述「手動逐 phase 是唯一路徑、service 層不再自動觸發 knowledge-update / raw-scan」，
So that 我不會依賴一段已不存在的 safety net。

**Acceptance Scenarios:**

- WHEN render `prospec-archive.hbs` 產生 SKILL.md, THEN 內容無「auto-triggers a knowledge update … safety net … no-op」這類 archive service 自動 knowledge-update / raw-scan 反向宣稱
- WHEN 檢查 prospec-upgrade 等他處描述, THEN 與新的事實一致（不殘留「archive service 會自動跑 knowledge-update」的描述）

**Independent Test:**
`grep` 生成的 `.claude/skills/prospec-archive/SKILL.md` 確認無 archive-service auto knowledge-update / raw-scan safety-net 宣稱；skill-generation 契約測試通過。

## Edge Cases

- 保留範圍：`generateProductSpec` 與 `syncFeatureMap`（product.md / feature-map.yaml）不在本次移除範圍——它們是 archive 的核心職責（bootstrap-once + no-clobber，不清空 curated），本變更不動。
- `feature-map` 於 `.hbs` line 118 的 safety-net 描述仍為真（`syncFeatureMap` 保留），僅需移除「mirrors the raw-scan refresh below」這個已失效的交叉引用。
- 移除後，`sdd-workflow.md`/`ai-knowledge.md` 中描述此行為的 REQ 必須經 delta-spec graduate（REMOVED/MODIFIED），否則規格與程式碼漂移。

## Functional Requirements

- **FR-001**：`archive.service.execute()` 移除自動 knowledge-update 區塊（`executeKnowledgeUpdate` 迴圈與相關變數）。
- **FR-002**：`archive.service.execute()` 移除同段 raw-scan refresh 區塊（`generateRawScan` 呼叫與相關變數）。
- **FR-003**：`ArchiveResult` 移除 `knowledgeUpdated`、`knowledgeWarnings`、`rawScanRefreshed` 欄位；移除因此變 orphan 的 import。
- **FR-004**：`prospec-archive.hbs` 移除 archive-service auto knowledge-update / raw-scan 的「safety net / no-op」反向宣稱；regen `SKILL.md`。
- **FR-005**：同步調整受影響的單元測試（移除已失效的 mock 與測試案例）。

## Success Criteria

- **SC-001**：`grep` `src/services/archive.service.ts` 無 `executeKnowledgeUpdate`、`generateRawScan` 呼叫；`ArchiveResult` 無三欄位。
- **SC-002**：`grep` 生成的 `SKILL.md` 無 archive-service auto knowledge-update / raw-scan safety-net 宣稱。
- **SC-003**：`pnpm test`、`pnpm typecheck`、`pnpm lint` 全綠；coverage 不倒退。

## Related Modules

- **services**：`archive.service.ts` 為主要修改對象（移除兩段 auto side effect 與 `ArchiveResult` 欄位）。
- **templates**：`prospec-archive.hbs` 為 SKILL.md 真實來源，需修正反向宣稱。
- **tests**：`archive.service.test.ts` 需移除已失效的 mock 與測試案例。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations identified：TDD（測試同步調整）、Atomic Commits（單一 refactor 關注點）、Language Policy（change artifacts 繁中、Knowledge/code 英文）皆遵守。

## UI Scope

**Scope:** none
