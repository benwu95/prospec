# Tasks: stop-clobbering-product-spec

**Input**: Design documents from `.prospec/changes/stop-clobbering-product-spec/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests (RED)

- [x] T1 [P] 寫紅燈：既有 product.md splice 後除 Feature Map 區段與 `last_updated` 外逐 byte 不變（含 `version`/`feature_count`/Vision/Target Users/自訂節）~70 lines
- [x] T2 [P] 寫紅燈：Feature Map 條目描述句保留、標題與連結更新、消失的 feature 移除、新 feature 帶 TBD ~60 lines
- [x] T3 [P] 寫紅燈：無 `## Feature Map` 節時檔尾附加；fenced code block 內的 `## ` 不得被當作區段結尾 ~40 lines
- [x] T4 [P] 寫紅燈：缺檔 bootstrap 產出格式規範全部節 ~30 lines
- [x] T5 [P] 寫紅燈：清單 `.sort()`＋`isArchivedSpec`／`isSafeResourceName` 過濾（亂序目錄含 active 的 `_archived-*.md`）~40 lines
- [x] T6 [P] 寫紅燈：dry-run detail 依檔案存在與否分流為 bootstrap／splice ~30 lines
- [x] T7 契約測試：`product-spec-format.hbs` fenced block 的 h2 集合 == bootstrap 產出的 h2 集合（雙向）~50 lines

## Phase 2: Services (GREEN)

- [x] T8 `scanActiveFeatures()`：sort + 兩個過濾 + `status: active`，供 splice／bootstrap 共用 ~30 lines
- [x] T9 `findSectionRange()`：以 `withoutFencedBlocks` 遮蔽後判定 `## Feature Map` 起訖 ~30 lines
- [x] T10 `parseFeatureMapEntries()` + `renderFeatureMap()`：slug（退回標題）比對、保留描述句 ~70 lines
- [x] T11 `spliceProductSpec()`：替換區段／檔尾附加，frontmatter 區塊內刷新 `last_updated` ~50 lines
- [x] T12 `bootstrapProductSpec()`：格式規範全部節骨架 + TBD 佔位 ~50 lines
- [x] T13 `generateProductSpec()` 改為 splice/bootstrap 分流，維持 non-fatal 與單一 `atomicWrite` 寫入點 ~30 lines
- [x] T14 `execute()` dry-run detail 依 `fs.existsSync(productSpecPath)` 分流 ~20 lines

## Phase 3: Templates & Docs

- [x] T15 `product-spec-format.hbs`：frontmatter 所有權（`product`/`last_updated` 由 prospec 寫；`version`/`feature_count` 由人維護、逐 byte 保留）＋「Feature Map 是唯一機器擁有區段」~35 lines
- [x] T16 `prospec-archive.hbs`：Phase 3.6 檢查項與 Phase 3.6 Gate checkbox 改為可誠實勾選的措辭 ~10 lines
- [x] T17 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（不可用 `pnpm exec prospec`）~0 lines
- [x] T18 兩份 root README 若觸及使用者可見面則同步（archive 行為敘述）~10 lines

## Phase 4: Dogfood & Verification

- [x] T19 補回本 repo `prospec/specs/product.md` 的 `version`、`## Vision`、`## Target Users` 與每項 Feature Map 描述句 ~45 lines
- [x] T20 [V] 實跑 `prospec archive --dry-run` 與實跑，確認 T19 補回的內容仍在且 diff 只落在 Feature Map／`last_updated` ~0 lines
- [x] T21 [V] mutation-verify：刪除區段邊界判定、描述句保留、契約集合斷言各一處，確認測試轉紅 ~0 lines
- [x] T22 [M] `pnpm counts` 重導機器擁有計數並跑 `pnpm test` / `pnpm typecheck` ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 22 |
| Code tasks | 17 |
| Manual `[M]` | 3 |
| Verification `[V]` | 2 |
| Parallelizable | 6 |
| Estimated lines | ~700 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- Verify functionality after completing each Phase
- ~N lines are estimates; actual numbers may vary with requirements
