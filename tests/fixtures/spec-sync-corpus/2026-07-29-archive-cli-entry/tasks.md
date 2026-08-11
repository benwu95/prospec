# Tasks: archive-cli-entry

## Services

- [x] T1 讀 `skill-format.test.ts` 對 prospec-archive 的既有 pin 與 `archive.service.test.ts` 現況，確認可動範圍 ~0 lines
- [x] T2 `ArchiveOptions` 加 `dryRun`；`ArchiveResult` 加 `dryRun`/`planned`/`refused`/`notFound` 型別 ~40 lines
- [x] T3 `execute()`：具名目標的 refused（存在但非 verified）與 notFound 回報，取代靜默過濾 ~30 lines
- [x] T4 dry-run 貫穿：搬檔路徑計算拆出、summary 讀取源切換（dry=change.dir）、寫入點短路並記入 planned ~60 lines
- [x] T5 `syncToFeatureSpecs`/`generateProductSpec`/`syncFeatureMap` 增 `dryRun` 參數守住寫入 ~30 lines

## CLI

- [x] T6 `commands/archive.ts`：`prospec archive <name...>` + `--dry-run`，名稱必填 ~50 lines
- [x] T7 `formatters/archive-output.ts`：dry-run 預定 mutation 清單／real run 結果摘要，`sanitizeTerminal()` ~70 lines
- [x] T8 `index.ts` 註冊命令；跑 `pnpm counts` 同步計數生成物 ~10 lines

## Templates

- [x] T9 `skills/prospec-archive.hbs`：決定論步驟收斂為 `prospec archive`（先 `--dry-run`）＋fallback ladder；判斷面（Entry Gate/REQ 畢業/summary 敘事/Review & Verify/lessons/_archived-history/raw-scan）保留 ~80 lines
- [x] T10 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync` 重生成 `.claude/skills/` ~0 lines

## Tests

- [x] T11 unit：dry-run 零寫入（memfs 快照前後相等）＋ planned 內容斷言 ~80 lines
- [x] T12 unit：dry-run 預測 ≡ real run 實際 mutation 等價測試（同 fixture、日期正規化） ~90 lines
- [x] T13 unit：refused/notFound 回報；名稱必填錯誤路徑 ~50 lines
- [x] T14 unit：command/formatter 測試（含 dry-run 輸出格式） ~80 lines
- [x] T15 e2e：`archive --dry-run` + real run happy path（tmpdir、compiled CLI） ~60 lines
- [x] T16 contract：skill-format 對收斂後 phase 文案的 pin 調整（section-scoped） ~40 lines
- [x] T17 [V] mutation-verify 新增的 contract 斷言（改壞模板應轉紅） ~0 lines
- [x] T18 [V] 既有 archive.service 測試全綠、`pnpm test` + `pnpm typecheck` + `pnpm lint` 全過 ~0 lines

## Docs

- [x] T19 root README.md（＋README.zh-TW.md 雙語同步）命令清單加 `archive` ~20 lines

## Summary

- **Total Tasks:** 19
- **Parallelizable Tasks:** 0
- **Total Estimated Lines:** ~790 lines

## Notes（實作偏差記錄）

- T5 偏差：`generateProductSpec`/`syncFeatureMap` 未加 dryRun 參數——dry-run 下 spec 檔尚未寫入、無法掃出正確內容，改在 `execute()` 以同一組守門條件預測 ACTION（附註解）；`syncToFeatureSpecs` 依計畫加參數。等價性由 replay 測試釘住。
- 邊界偏差：名稱打錯時不 inline 列出現有 change，改指向 `prospec status`（該命令即清單真相層，避免 Result 添加展示用欄位）。
- 設計決定：service 的 scaffold summary 語義不變；skill Phase 3 在 CLI 跑完後以 Phase 2 的 enriched summary（含 Review & Verify）覆寫 scaffold。
