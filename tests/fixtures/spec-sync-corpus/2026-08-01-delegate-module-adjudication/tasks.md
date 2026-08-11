# Tasks: delegate-module-adjudication

**Input**: Design documents from `.prospec/changes/delegate-module-adjudication/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Types

_無型別檔變更 — 新欄位定義在 services 的 `RawScanResult` 介面上。_

## Lib

- [x] T1 匯出 `src/lib/module-detector.ts` 的 `isSourceFile`，JSDoc 標明它是原始碼分類的單一真相（REQ-LIB-038）~10 lines
- [x] T2 於 `module-detector.ts` 新增純函式 `collectNonSourceDirectories(files, options)` — 最上層祖先收斂、codepoint 排序、目錄上限 50／副檔名上限 5 並回報餘數、無副檔名記為 `(no extension)`（REQ-KNOW-038）~70 lines
- [x] T3 ~~刪除死條目 `'min'`~~ → 審查推翻前提後還原，改以測試釘住「拒絕清單只比對終端副檔名」（REQ-LIB-038）~1 line
- [x] T4 刪除 `MODULE_INDICATORS` 常數與 `detectFromDirectories` 的單檔繞過，改寫描述門檻的 JSDoc（REQ-LIB-038）~15 lines

## Services

- [x] T5 `raw-scan.service.ts` 串接 `collectNonSourceDirectories()`，擴充 `RawScanResult` 與模板 context（REQ-KNOW-038）~25 lines

## Templates

- [x] T6 `knowledge/raw-scan.md.hbs` 新增 `## Directories Without Source Files` — 說明句必須寫明零結果退回的例外、空集佔位行、截斷揭露（REQ-KNOW-038）~30 lines
- [x] T7 `skills/prospec-knowledge-generate.hbs` Step 3 新增 module-map 裁決授權（初稿定性＋提案→確認→回寫）（REQ-TEMPLATES-170）~25 lines
- [x] T8 [M] 執行 `pnpm bundle`，再 `npx tsx src/cli/index.ts agent sync` 部署改動後的模板（`pnpm exec prospec` 會打到舊執行檔）

## CLI

_無 CLI 變更 — 新區塊搭 `prospec knowledge init` 既有介面出貨。_

## Tests

- [x] T9 [P] unit `module-detector`：純非原始碼目錄入選、混合目錄不入選、巢狀收斂到最上層祖先、codepoint 排序、`(no extension)` 標記 ~70 lines
- [x] T10 [P] unit `module-detector`：上限行為 — >50 目錄揭露省略數、>5 副檔名揭露餘數 ~35 lines
- [x] T11 [P] unit `module-detector`：`isSourceFile` 可匯出；`jquery.min.js` 仍分類為原始碼（死條目移除後行為不變）~15 lines
- [x] T12 unit `module-detector`：門檻回歸 — 單一原始碼檔的 `utils/` 不再成為 module；≥2 檔目錄行為不變 ~35 lines
- [x] T13 unit `module-detector`：釘住「移除繞過後零結果 → 未過濾清單 fallback 觸發」路徑 ~30 lines
- [x] T14 unit `raw-scan.service`：斷言計算結果正確傳入模板 context 與 `RawScanResult` ~25 lines
- [x] T15 contract `knowledge-format`：新區塊 section-scoped + structure-aware 斷言（排序、空集佔位、截斷揭露、退回例外句）~80 lines
- [x] T16 contract `knowledge-format`：同一檔案清單兩次渲染逐位元一致 ~20 lines
- [x] T17 contract `skill-format`：Step 3 同時含「初稿」定性與「提案→確認」紀律 ~40 lines
- [x] T18 [V] 對每一類新斷言做 mutation 驗證（PB-001）：刪除／破壞被斷言的特徵，確認測試轉紅

## Manual & Verification

- [x] T19 [V] 零回歸實測：prospec 自身與 `../olfparser` 在移除繞過前後的 module 名稱集合比對，結果記入 `.tasks/feat/delegate-module-adjudication/`
- [x] T20 [V] `prospec knowledge init --raw-scan-only` 連跑兩次，`diff` 無輸出
- [x] T21 [M] 同步 lib／services／templates／tests 四份 module README（PB-011：逼近預算先壓縮既有敘述）
- [x] T22 [M] 檢查根 `README.md` 與 `README.zh-TW.md` 是否描述 raw-scan.md 區段結構，有則雙語同步更新
- [x] T23 [V] `pnpm counts`、`pnpm typecheck`、完整測試套件、`prospec check` 全數通過

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 23 |
| Code tasks | 16 |
| Manual `[M]` | 3 |
| Verification `[V]` | 4 |
| Parallelizable | 3 |
| Estimated lines | ~526 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- TDD 順序：Lib／Services／Templates 任務的對應測試（T9-T17）先寫失敗版，再回頭實作
- US-1（T1-T2、T5-T6）必須早於 US-2（T7-T8）— 承接 new-story 的 INVEST Independent WARN
