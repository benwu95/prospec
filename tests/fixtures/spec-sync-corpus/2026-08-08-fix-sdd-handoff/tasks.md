# Tasks: fix-sdd-handoff

**Input**: 來自 `.prospec/changes/fix-sdd-handoff/` 的設計文件
**Prerequisites**: proposal.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: 可平行執行 (不同檔案，無互相依賴)
- **[M] / [V]**: 任務種類 — 手動 (manual) / 驗證 (verification)；無標示者 = 程式碼任務 (定義凍結於 tasks-format 參考指南)
- **~N lines**: 預估更動行數

---

## Phase 1: Templates

- [x] T1 [P] 將入口技能中客製化的 handoff 語句替換為 `{{> next-step-handoff}}`
- [x] T2 [P] 在樣板中強制使用祈使句的確認節點與對應的 NEVER 規則
- [x] T3 [P] 執行 `prospec agent sync` 來產生更新後的技能

## Phase 2: Tests

- [x] T4 [P] 更新 skill-format.test.ts 以動態從 `SDD_STATIONS` 取得 (PB-001)
- [x] T5 [V] 執行合約測試以確保合規

---

## Summary

| 項目 | 數量 |
|------|-------|
| 總任務數 | 5 |
| 可平行執行 | 4 |
| 預估行數 | ~50 lines |

---

## Notes

- [P] = 不同的檔案，無相依關係，可平行執行
- [M]/[V] 標示手動/驗證任務；無標示者為程式碼任務 (請見 tasks-format 參考指南)
- 完成每個 Phase 後需驗證功能
- ~N lines 僅為預估；實際行數可能隨需求而變
