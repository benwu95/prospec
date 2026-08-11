# Tasks: filter-nonsource-modules

**Input**: Design documents from `.prospec/changes/filter-nonsource-modules/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Tests

- [x] T1 RED：頂層平鋪型 fixture（`docs/*.md`、`samples/*.json`、`spec/*.pdf`、`cache/*.json` + `src/pkg/*.py`、`tests/*.py`、`scripts/*.sh`）跑 `architecture` 策略，斷言 module 名稱集合恰為含原始碼者，且純文件目錄逐一負向斷言（REQ-LIB-038 AC1/AC2）~40 lines
- [x] T2 RED：混合目錄門檻——`dll/` 5 個 `.py` + 20 個 `.md` 仍入選；`tools/` 只有 1 個 `.py` 不入選（門檻看原始碼數量，不看文件數量）~20 lines
- [x] T3 RED：副檔名大小寫不敏感（`native/a.H` + `native/b.c` 成為 module）；無副檔名檔案不算原始碼（`bin/foo` + `bin/bar` 不成為 module）（AC3）~20 lines
- [x] T4 RED：template／樣式副檔名視為原始碼——`templates/*.hbs`、`ui/*.vue`、`styles/*.scss` 各自成為 module（AC4）~20 lines
- [x] T5 RED：空子集退回——純 `.md`／`.txt` 清單的偵測結果非空，且與同清單在過濾前的結果一致（AC5）~20 lines
- [x] T6 RED：`domain` 與 `package` 策略同樣吃子集——純文件的 `features/{name}/` 與純文件 workspace package 皆不成為 module（REQ-KNOW-014 新增 WHEN/THEN）~30 lines
- [x] T7 RED：既有 `module-map.yaml` 命中時不套用過濾（curated 清單含純文件目錄仍原樣回傳）（AC6）~15 lines
- [x] T8 RED：src-集中型回歸——`src/{cli,lib,services,types}/*.ts` + `tests/**` 的 module 集合與 `paths` 與變更前逐項相同 ~20 lines

## Lib

- [x] T9 `module-detector.ts`：新增 `NON_SOURCE_FILE_EXTENSIONS` 拒絕清單常數（`Set<string>`，全小寫，按非原始碼族群分組並註明極性理由）+ 私有 `isSourceFile()`／`filterSourceFiles()` ~55 lines
- [x] T10 `module-detector.ts`：`detectModules()` 於 `loadExistingModuleMap` early return 之後以子集跑 `detectByStrategy`，零結果則把範圍換成完整 `files` 重跑（註解寫明判準為何是「找不到 module」而非「子集為空」），並把該範圍貫穿 `detectArchitecturePattern`／`detectRelationships`；`detectEntryPoints` 維持完整清單並註明其與子集今日一致是巧合非依賴 ~30 lines

## Docs（信任區，英文）

- [x] T11 依 PB-005 更新 `prospec/ai-knowledge/modules/lib/README.md`：`module-detector.ts` 一列補上 source-file gating，Pitfalls 記載「過濾住在 detector 而非 scanner」的理由 ~6 lines

## Verification

- [x] T12 [V] mutation-verify：把 `filterSourceFiles` 改為恆等（不過濾）→ T1/T2/T6 轉紅；把空子集 fallback 改為直接用空陣列 → T5 轉紅；把副檔名比對改為大小寫敏感 → T3 轉紅 ~5 lines
- [x] T13 [V] 對真實 `../olfparser` git-tracked 清單重跑偵測，確認 module 數 16 → 9，且被移除的 7 個逐一確認為零原始碼目錄（SC-002）~5 lines
- [x] T14 [M] `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm counts` / `pnpm counts:check` 全綠；由 source CLI 跑 `prospec check` 無新增 FAIL（SC-003/SC-004）~2 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 14 |
| Code tasks | 11 |
| Manual / Verification | 1 [M] + 2 [V] |
| Estimated lines | ~268 lines |

---

## Notes

- 測試先行（T1–T8 RED）→ 實作（T9–T10）→ 知識同步（T11）→ 驗證（T12–T14），符合 Constitution 的 TDD [MUST]。
- T9/T10 皆動同一檔案，不標 `[P]`；T1–T8 同動一個測試檔，亦不標 `[P]`。
- `pnpm mutate <path>` 不加 `--`（pnpm 不吃該分隔符，加了必失敗）。
