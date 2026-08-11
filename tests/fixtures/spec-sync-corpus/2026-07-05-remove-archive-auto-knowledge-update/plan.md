# Plan：移除 archive.service 自動 knowledge-update 死碼

## Overview

`archive.service.execute()` 在歸檔後自動觸發 `executeKnowledgeUpdate`（→ `updateIndex`，會清空 curated `index.md`）與 `generateRawScan` 兩段 safety net。因無 `prospec archive` CLI 指令，這兩段只被測試觸發，屬危險死碼；`prospec-archive` skill template 又把它們描述為「idempotent safety net / no-op」，是反向宣稱。

策略：外科式移除 `execute()` 內這兩段區塊與 `ArchiveResult` 對應欄位（`knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed`）＋ orphan import；修正 `.hbs` 模板反向宣稱並 regen SKILL.md；同步調整測試。`generateProductSpec` / `syncFeatureMap` 保留（archive 核心職責、bootstrap-once + no-clobber，不在本次止血範圍）。`knowledge-update.service` 本體保留（`/prospec-knowledge-update` 的機制），僅移除 archive 對它的呼叫。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview
| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| services | 業務邏輯（execute pattern） | `archive.execute()` | types, lib |
| templates | Handlebars skill 模板（SKILL.md 真實來源） | `prospec-archive.hbs` | — |
| tests | 4-layer 測試套件 | `archive.service.test.ts` | all |

### Existing Patterns (from _conventions.md)
- 非致命 side effect 以 try/catch 包裹（product.md / feature-map / raw-scan）——本次移除其中 knowledge-update + raw-scan 兩段。
- `ArchiveResult` 為 service 回傳契約；欄位變更需連動測試與（services README）prose。

### Architecture Constraints (from Constitution)
- 依賴方向 `cli → services → lib → types`：本次僅移除 services→services 的 sibling 呼叫（archive→knowledge-update / archive→raw-scan），不新增反向依賴。
- TDD：測試與程式碼同 commit。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | `archive.service.ts` 移除兩段 auto side effect + `ArchiveResult` 三欄位 + 兩個 import |
| templates | Medium | `prospec-archive.hbs` 移除反向宣稱；regen `.claude/skills/prospec-archive/SKILL.md` |
| tests | Medium | `archive.service.test.ts` 移除失效 mock 與測試案例；新增「execute() 兩者皆不觸發」regression |

## Call Chain

archive.execute(options)  [services orchestration]
  → moveToArchive(...)                              [檔案搬移]
  → generateProductSpec(...) / syncFeatureMap(...)  [保留：非致命，co-located]
  ✂ executeKnowledgeUpdate(...)  → REMOVED（原 services→knowledge-update sibling 呼叫）
  ✂ generateRawScan(...)         → REMOVED（原 services→raw-scan sibling 呼叫）
  → return ArchiveResult（不含 knowledgeUpdated/knowledgeWarnings/rawScanRefreshed）

無跨層違規：移除呼叫只減少 services→services sibling 依賴，方向不變。

## Implementation Steps

1. **移除 archive.service auto knowledge-update 區塊**
   - 刪除 `execute()` 中 `knowledgeUpdated`/`knowledgeWarnings` 變數與 `executeKnowledgeUpdate` 迴圈（含前導註解）。

2. **移除同段 raw-scan refresh 區塊**
   - 刪除 `rawScanRefreshed` 變數與 `generateRawScan` 呼叫（含註解）。

3. **收斂 `ArchiveResult` 型別與回傳**
   - 從型別與 return object 移除 `knowledgeUpdated`、`knowledgeWarnings`、`rawScanRefreshed`；移除 orphan import（`executeKnowledgeUpdate`、`generateRawScan`）。

4. **修正 skill 模板反向宣稱並 regen SKILL.md**
   - `prospec-archive.hbs`：移除 line 141 反向宣稱 blockquote、line 139/118 已失效的 raw-scan safety-net 交叉引用；`syncFeatureMap` 仍為真的描述保留。
   - 執行 `prospec agent-sync` 重生 `SKILL.md`（或等效手動同步）。

5. **調整測試**
   - 移除 raw-scan / knowledge-update 相關 mock 與測試案例（`rawScanRefreshed`、`knowledgeUpdated`、`knowledgeWarnings` 斷言）；新增 regression 斷言 `execute()` 後 `executeKnowledgeUpdate` 與 `generateRawScan` 皆未被呼叫且 `ArchiveResult` 無三欄位。

6. **驗證**
   - `pnpm typecheck`、`pnpm test`、`pnpm lint` 全綠；`pnpm counts:check` 不倒退。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 誤刪 `generateProductSpec`/`syncFeatureMap`（超出止血範圍） | High | 只刪 knowledge-update + raw-scan 兩段；review lens 檢查 diff |
| `ArchiveResult` 欄位被他處消費 | Medium | 已 grep 確認僅測試消費（無 CLI archive 指令）；typecheck 兜底 |
| 規格與程式碼漂移（safety-net REQ 殘留） | Medium | delta-spec 記 REMOVED/MODIFIED（SERVICES-031/033、KNOW-023、TESTS-034/035、US-6 條款），archive Phase 3.5 graduate |
| SKILL.md 與 `.hbs` 手改分歧 | Low | 以 `prospec agent-sync` regen，不手動雙改 |

## Knowledge Check

PASS — Brownfield；已讀 services README + index.md + sdd-workflow.md / ai-knowledge.md 相關 REQ；Technical Summary 已綜整；受影響 Feature Specs 已比對。
