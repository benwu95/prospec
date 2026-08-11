# Tasks: report-dropped-req-bullets

**Input**: Design documents from `.prospec/changes/report-dropped-req-bullets/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> TDD 順序：先做 Tests 區的 T8–T11（RED），再回頭做 Services／CLI／Templates。

---

## Services

- [x] T1 `SpecSyncResult` 與 `ArchiveResult` 新增 `droppedBehavior: DroppedBehavior[]`（`{feature, reqId, bullets}`），與 `PendingConvergence` 並列宣告（REQ-SERVICES-073 AC1）~20 lines
- [x] T2 `mergeRequirementInPlace` 的 `skipping` 迴圈改為累積被跳過的舊 body 行，沿用既有 section 邊界規則不外溢（AC1）~15 lines
- [x] T3 抽出 `WHEN/THEN` bullet 並取集合差集（正規化前後空白、逐字比對），差集非空才回傳 `dropped`（AC1/AC3）~30 lines
- [x] T4 `syncToFeatureSpecs` 彙集各 route 的 `dropped` 進 `SpecSyncResult`；確認 `pendingConvergence` 的產生條件與內容一行未動（AC5）~15 lines

## CLI

- [x] T5 `formatters/archive-output.ts` 於 `pendingConvergence` 區塊後輸出丟棄清單，逐條列出 bullet 原文；空清單不輸出區塊（REQ-CLI-032 AC1/AC2）~25 lines

## Templates

- [x] T6 `prospec-archive.hbs` Phase 3.5 Gate 新增逐條確認項目（REQ-TEMPLATES-168 AC1）~5 lines
- [x] T7 於 `references/delta-spec-format.hbs` 的 `**Spec:**` 區塊說明補一句：必須陳述變更後的**完整需求**而非本次差異（作者側防線，與 CLI 偵測互補）~5 lines

## Tests

- [x] T8 [RED] unit：以 `add-harness-capability-flags` 的真實 REQ-TEMPLATES-066 before/after body 為 fixture，斷言回報恰好列出被丟棄的既有 bullet（REQ-TESTS-064 AC1）~45 lines
- [x] T9 [RED] unit：**數量相同、內容不同**的專屬案例仍完整回報——這是數量式判定會漏掉的唯一案例（AC2）~30 lines
- [x] T10 [RED] unit：新 body 為舊 bullet 超集（含新增）→ 回報為空；舊 body 無 bullet → 不回報（AC3 與刻意排除）~30 lines
- [x] T11 [RED] unit：dry-run 與實際執行的 `droppedBehavior` 一致，且 dry-run 零寫入；既有 `pendingConvergence` 斷言不受影響（AC4/AC5）~30 lines
- [x] T12 [RED] contract：`prospec-archive.hbs` Phase 3.5 Gate 含逐條確認項目，section-scoped ~20 lines
- [x] T13 unit：`archive-output` formatter 對非空／空清單的輸出（REQ-CLI-032）~25 lines
- [x] T14 [V] mutation-verify T8–T13 每個新斷言類別，特別是把差集實作換成數量比較須讓 T9 變紅 ~0 lines

## Deploy & Sync

- [x] T15 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync` 重新部署 ~0 lines
- [x] T16 [M] `pnpm counts` 重導測試計數 ~0 lines
- [x] T17 同步 services/cli/templates/tests 四個 module README ~20 lines
- [x] T18 [V] `pnpm test`、`pnpm typecheck`、`pnpm lint` 全綠 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 18 |
| Code tasks | 14 |
| `[M]` / `[V]` tasks | 2 / 2 |
| Estimated lines | ~315 lines |

---

## Notes

- 分層標題為架構分組；執行以 TDD 為序（Tests RED → Services → CLI → Templates → 部署同步）
- T9 是本變更的核心測試：若差集被實作成數量比較，只有它會變紅
- T7 是作者側的文件防線，與 T1–T4 的機器偵測互補，兩者都做才閉環
