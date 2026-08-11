# Tasks: pin-windows-kill-semantics

**Input**: Design documents from `.prospec/changes/pin-windows-kill-semantics/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests

- [x] T1 `check.service.test.ts` 的 kill 斷言依 `process.platform` 分岔：POSIX 維持三條既有斷言；win32 斷言 `recorded === true`、`exitCode` 非零、metadata 含 `test_provenance` ~25 lines
- [x] T2 測試名稱改為描述規則（非單一平台結果），註解說明 Windows 為何是 fail-closed 而非缺陷 ~5 lines
- [x] T3 [V] macOS 上跑 `check.service.test.ts` 全綠（走 POSIX 分支）；確認 win32 分支非 skip 而是實質斷言 ~0 lines

## Phase 2: Lib（僅註解）

- [x] T4 `lib/test-runner.ts` 的 kill 相關註解補 Windows 無訊號事實，維持宣稱＝可觀測行為 ~6 lines
- [x] T5 [V] `git diff --stat src/` 確認僅註解行、無判定式改動（FR-003／SC-001） ~0 lines

## Phase 3: Ship

- [ ] T6 [V] `pnpm test` 全綠、`pnpm typecheck`／`pnpm lint` 綠、`prospec check` 13/13 ~0 lines
- [ ] T7 [M] commit 並推上 #110 分支，觀測 windows-smoke 的 vitest 步驟是否零失敗（SC-002） ~0 lines
- [ ] T8 [M] 把「移除 `continue-on-error`、列入 required checks」在 issue #101 指定為下一步並註明前提已滿足（ci.yml:74-76 的移除條件＝每條已列舉失敗都有結論，本 change 供出最後一條）——否則三條 win32 斷言永遠無法讓 PR 轉紅 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 8 |
| Code tasks | 3 (T1, T2, T4) |
| Manual `[M]` | 2 (T7, T8) |
| Verification `[V]` | 3 (T3, T5, T6) |
| Estimated lines | ~36 lines |

---

## Notes

- 不改任何判定式：Windows 上無訊號可讀，「被殺」與「套件失敗」不可區分，記錄它是唯一誠實選項
- timeout 半邊不動：它由 `ETIMEDOUT` 判定，與訊號無關
- T7 的觀測結果若與預期不符（例如 win32 上 `recorded` 為 false），即為新的真機事實，須據實回頭改斷言與 delta-spec，而非放寬措辭
