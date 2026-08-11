# Implementation Plan: report-dropped-req-bullets

## Overview

`mergeRequirementInPlace` 目前在取代 body 時把舊行內容丟進 `skipping` 迴圈直接捨棄。改為累積被跳過的行，抽出其 `WHEN/THEN` bullet，與新 body 的 bullet 取**集合差集**；差集非空即回報。判定必須是集合而非數量——實測案例舊 3 條新 3 條、數量相同而內容全異。

回報走**新欄位**而非既有 `pendingConvergence`。後者的語意是「body 被保留、待人工收斂」，塞進丟棄資訊會讓同一份清單同時代表兩件相反的事（保留 vs 取代），也會污染任何以其筆數判斷的消費者。新增 `SpecSyncResult.droppedBehavior` 與對應 formatter 輸出，並在 `/prospec-archive` Phase 3.5 Gate 新增逐條確認項目——沒有 gate 的回報等於沒人讀。

## Technical Summary

> Auto-synthesized from AI Knowledge for this change's context

### Affected Module Overview

| Module | Core Responsibility | Key API | Dependencies |
|--------|-------------------|---------|--------------|
| services | 一 command 一 `execute()` | `archive.service.ts`：`syncToFeatureSpecs` / `mergeRequirementInPlace` / `SpecSyncResult` | lib, types |
| cli | 薄 I/O 層，一 command 一 formatter | `formatters/archive-output.ts` | types, lib, services |
| templates | 純 `.hbs` 資源 | `skills/prospec-archive.hbs` Phase 3.5 | none |
| tests | 4 層 Vitest | `unit/services/archive.*.test.ts`、`contract/skill-format.test.ts` | 全部 |

### Existing Patterns (from module READMEs)

- **回報而非阻擋**：spec-sync 的既有慣例是「NEVER blank an authored body — 保留並回報」，`pendingConvergence` 走 stderr worklist、never fails；本變更沿用同一非致命回報姿態
- **FUNCTION replacer**：landed body 為未信任文字，既有實作以函式替換避免 `$&`/`$1` 展開——擷取舊 body 時不得引入字串替換
- **skill gate 有契約測試**：Phase gate 項目由 `skill-format.test.ts` section-scoped 釘住

### Architecture Constraints (from Constitution)

- 依賴方向 `cli → services`（[SHOULD]）：偵測邏輯留在 services，formatter 只顯示
- TDD（[MUST]）：先以真實 before/after body 寫 fixture 測試，確認變紅
- 變更工件繁中、模板與 spec 英文（[MUST]）

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| services | High | 累積被跳過的舊 body、抽 bullet、集合差集、`SpecSyncResult.droppedBehavior` 新欄位 |
| cli | Low | `archive-output.ts` 輸出丟棄清單（逐條，不折疊計數） |
| templates | Low | `prospec-archive.hbs` Phase 3.5 Gate 新增確認項目 |
| tests | Medium | services 單元測試（含數量相同/內容不同的釘死案例）＋ skill gate 契約測試 |

## Call Chain

```
prospec archive <name>
  → cli/commands/archive.ts: archiveCommand(name, opts)          [thin I/O]
  → services/archive.service.ts: execute({ name, dryRun })        [orchestration]
      → syncToFeatureSpecs(routes, ...)                           [per-REQ merge]
          → mergeRequirementInPlace(content, route)
              → collectSkippedBody()  → extractWhenThenBullets()  [純函式]
              → diffBullets(old, new) → DroppedBehavior?          [集合差集]
      → SpecSyncResult { files, pendingConvergence, droppedBehavior }
  → cli/formatters/archive-output.ts: formatArchive(result)       [display only]
```

## Implementation Steps

1. **測試先紅（RED）**
   - 以 `add-harness-capability-flags` 的真實 REQ-TEMPLATES-066 before/after body 建 fixture，斷言回報列出被丟棄的 3 條 bullet
   - 專屬案例：舊新 bullet **數量相同、內容不同** → 仍須完整回報（釘死「非數量」判定）
   - 反向案例：新 body 涵蓋全部舊 bullet（可含新增）→ 回報為空
   - 契約測試：Phase 3.5 Gate 含逐條確認項目

2. **services：擷取與差集**
   - `mergeRequirementInPlace` 的 `skipping` 迴圈改為累積被跳過的行
   - 抽出 `- WHEN … THEN …` bullet（正規化前後空白），與新 body 的 bullet 取差集
   - 差集非空 → 回傳 `dropped: DroppedBehavior { feature, reqId, bullets }`

3. **services：契約欄位**
   - `SpecSyncResult` 與 `ArchiveResult` 新增 `droppedBehavior: DroppedBehavior[]`
   - `pendingConvergence` 的產生條件與內容完全不動

4. **cli：輸出**
   - `archive-output.ts` 於 `pendingConvergence` 區塊之後輸出丟棄清單，逐條列出 bullet 原文
   - `--dry-run` 與實際執行走同一組資料，無分歧

5. **templates：Phase 3.5 Gate**
   - 新增 gate 項目：每條被回報丟棄的 bullet 都經確認為刻意，或已補回新 body

6. **部署與同步**
   - `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`
   - 同步 services/cli/templates/tests 四個 module README；`pnpm counts` 重導測試計數

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 措辭潤飾被判為丟棄造成噪音 | Medium | 刻意選擇「寧可多問」；回報為非致命 worklist 而非閘門式阻擋，且 Open Question 已記錄若噪音過高再引入相似度門檻 |
| 覆載 `pendingConvergence` 語意 | High | 改用獨立欄位；新增測試斷言既有 `pendingConvergence` 筆數與內容不受影響（SC-003） |
| 只有敘述段落被丟棄時偵測不到 | Medium | 明示為刻意排除（delta-spec 記錄），避免宣稱涵蓋率高於實作（PB-003） |
| 擷取舊 body 時誤吞下一個 REQ 的內容 | High | 沿用既有 section 邊界規則（任何 heading 或 `---`）；以「REQ 為區段最後一個 h4」的 fixture 釘死 |
| 新增測試造成 README/計數漂移 | Low | 同一 feature commit 執行 `pnpm counts`（PB-004） |
| 新不變式寫入 `services/README.md` 觸發 `knowledge-size` WARN | Medium | 依 REQ-TYPES-069 走申報式預算放寬（`l1_per_file` 2000→2500、`l2_per_module` 1500→1800，出貨預設不動），並還原先前為遷就舊上限而壓縮的 13 處措辭；申報全文見 proposal.md 的 Knowledge Budget Widening 節 |

## Knowledge Quality Gate

PASS — Brownfield；已讀 services/cli/templates/tests 四個 module README 與 `_playbook.md` 相關條目（PB-001/003/004）；已核對既有 REQ-SERVICES-072 的合併契約與 `PendingConvergence` 型別。

## Constitution Check (site-specific: dependency/layering)

PASS — Call Chain 為 `cli → services → 純函式`，formatter 僅顯示不判斷；偵測邏輯不外洩到 I/O 層，無反向匯入。
