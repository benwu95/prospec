# Tasks: name-change-history-rows

**Input**: Design documents from `.prospec/changes/name-change-history-rows/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> **TDD 執行順序**：T1 先讓「列含變更名」的斷言變紅再做 T2。

---

## Tests

- [x] T1 RED：`archive.service.test.ts` 既有 `| archive-sync |` 斷言改為期待變更名，並加負向斷言（輸出不含固定佔位字串） ~15 lines

## Services

- [x] T2 `appendToChangeHistory` 增 `changeName` 參數並寫入 Change 欄；唯一呼叫端（`archive.service.ts:398`）傳入既有的變更名 ~10 lines

## Docs（信任區，英文）

- [x] T3 依 delta-spec 的對應表回填 15 列的 Change 欄；只改第 2 欄，日期／Impact／REQ Refs／列序逐位元不動 ~15 lines

## Verification

- [x] T4 [V] 腳本重新推導 15 列歸屬並與檔案內容比對（15/15 相符）；`grep -c "| archive-sync |"` 全為 0 ~10 lines
- [x] T5 [V] mutation-verify：移除變更名傳遞（改回固定字串）→ T1 的正向與負向斷言至少一條轉紅 ~5 lines
- [x] T6 [M] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm counts:check` 全綠；由 source CLI 跑 `prospec check` 14/14 0 warn ~2 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 6 |
| Code tasks | 3 |
| Manual `[M]` / Verification `[V]` | 1 / 2 |
| Parallelizable | 0 |
| Estimated lines | ~57 lines |

---

## Notes

- 回填屬信任區寫入，但只動 Change History 的既有列、不觸碰任何 REQ body，因此與 REQ 畢業時序無衝突
- 本變更自己 archive 時，新寫入的那一列將是第一列帶真實名稱的自動產物——可作為 US-1 的落地證據
- 任一列若非唯一解就保留 `archive-sync` 並說明理由（本輪 15/15 皆唯一解，無此情況）
