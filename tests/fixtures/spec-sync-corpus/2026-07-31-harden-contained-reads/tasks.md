# Tasks: harden-contained-reads

**Input**: Design documents from `.prospec/changes/harden-contained-reads/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> **TDD 執行順序**：T1 的 RED 測試先以 EISDIR 變紅再做 T2；T3 的收斂由既有測試全綠 ＋ T5 的 grep 斷言把關。

---

## Tests

- [x] T1 RED：`modules/lib/README.md` 指向知識樹內部目錄的 symlink → `collectKnowledgeSize` 不拋錯、該模組無 l2 item、其他模組照常量測 ~30 lines
- [x] T4 樹外 symlink 仍回 null（containment 先攔，安全語意未放寬）＋ 可讀檔案 items 與變更前一致 ~30 lines
- [x] T5 委派斷言：contained-read 的 `readFileSync` 只出現在 `knowledge-reader` 的該 helper 內，`drift-sources.readContainedFile` 內為 0 ~15 lines
- [x] T6 `loadModuleMap`／`loadFeatureMap`：讀不到→**loud**（治理檔案的缺席不中性，會靜默換 ruleset）、raw 內容讀取→graceful、schema 無效→仍拋 ~25 lines

## Lib

- [x] T2 `knowledge-reader.ts`：`readTextIfExists` 的 `readFileSync` 包 try/catch 回 null（註解沿用 `readContainedFile` 的理由），並匯出為單一 helper `readContainedText` ~15 lines
- [x] T3 `drift-sources.ts`：`readContainedFile` 改為 resolve 後委派該 helper；移除自帶 try/catch 與重複 containment（`existsContained` 先 grep 呼叫端再決定移除或保留） ~20 lines

## Verification

- [x] T7 [V] mutation-verify：移除 T2 的 try/catch → T1 轉紅；把委派改回本地實作 → T5 轉紅 ~10 lines
- [x] T8 [M] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm counts:check` 全綠 ~2 lines
- [x] T9 [V] 由 source CLI 跑 `prospec check` 14/14 0 warn；並以 f14 fixture 實測「整場不再中止」 ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 9 |
| Code tasks | 6 |
| Manual `[M]` / Verification `[V]` | 1 / 2 |
| Parallelizable | 0 |
| Estimated lines | ~152 lines |

---

## Notes

- 任務編號依「測試先於實作」的執行順序排列，因此 Tests 區塊列在 Lib 之前；T1→T2，T4/T5/T6 在 T3 之後補完
- REQ 於 archive Phase 3.5 才畢業：本階段不得改寫 `prospec/specs/features/` 的 REQ 本文
- `readContainedFile` 的委派會把讀取對象由 `abs` 改為 realpath（內容等價），既有 drift-sources 測試全跑確認
