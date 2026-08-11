# Tasks: slim-knowledge-l1-l2

**Input**: Design documents from `.prospec/changes/slim-knowledge-l1-l2/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Types (US-2 預算校準)

- [x] T1 改 `src/types/config.ts` `DEFAULT_KNOWLEDGE_TOKEN_BUDGET.l1_per_file` 1500→1800（僅值，schema/註解語意保持 per-file）~3 lines
- [x] T2 [V] `grep -rn "1500\|1,500"` 全 repo（src/tests/templates/prospec 知識文件），列出所有 budget 相關殘留並逐一判定需否改 ~0 lines

## Knowledge-Base 宣告值 (US-2)

- [x] T3 改 `prospec/index.md` Progressive Knowledge Loading 表 L1 列「≤ 1,500 tokens per file」→「≤ 1,800 tokens per file」+ 表下說明段同步 ~4 lines
- [x] T4 檢查 `src/templates/knowledge/index.md.hbs`（及相關 hbs / knowledge skills）有無硬編 1500 budget 字樣；若為動態注入則免動、若硬編則同步 1800（改 _knowledge-loading-rules.hbs + prospec-knowledge-generate.hbs + prospec.yaml.hbs seed + _glossary.md + agent sync 重生 5 skills）~5 lines

## Tests (US-2)

- [x] T5 更新斷言 `l1_per_file === 1500` 的單元測試為 1800（config.test.ts DEFAULT 斷言；drift-checker/drift-sources 的 1500 為 evaluator fixture，維持不動）~10 lines
- [x] T6 [V] 確認 REQ-TESTS-048 single-source 測試（讀 index.md 宣告值斷言 == DEFAULT）在 T1+T3 後通過（config.test.ts 51 tests 綠）~0 lines

## Knowledge-Base index 瘦身 (US-1, REQ-KNOW-037)

- [x] T7 把 `module-map.yaml` 6 個 `description` 逐一壓成 routing-only（tests/templates 保留 COUNT_REGISTRY anchor 語句；其餘去除 REQ 編號/函式名/逐變更細節）~60 lines
- [x] T8 同步改 `prospec/index.md` auto-block 的 6 個 Description cell 與 module-map 一致（腳本替換第 5 欄，保留其餘欄）~30 lines
- [x] T9 [V] index.md 1702 tokens ≤ 1800；`check` 的 knowledge-size 對 index.md 不再 WARN ~0 lines

## Knowledge-Base README 綠化 (US-3, REQ-KNOW-011 compliance)

- [x] T10 services README：改為自足精簡地圖，≤1000 tok（實測 knowledge-size PASS）/≤100 lines（budget 校準到 1000 後不需 sub-module）~120 lines
- [x] T11 lib README：自足精簡地圖 918 tok/62 lines（knowledge-size PASS，不需 sub-module）~110 lines
- [x] T12 templates README：自足精簡地圖 ≤1000 tok/52 lines（保留 `library — 61 .hbs files across` count anchor）~110 lines
- [x] T13 tests README：自足精簡地圖 733 tok/50 lines（保留 memfs count anchor）~80 lines
- [x] T14 types README：自足精簡地圖 977 tok/65 lines ~70 lines
- [x] T15 cli README：自足精簡地圖 921 tok/55 lines ~40 lines
- [x] T16 [V] 未建任何 sub-module（budget 校準到 1000 後 6 README 皆單檔達標）；index.md/module-map.yaml 無 sub-module 檔名 ~0 lines

## 收斂驗證

- [x] T17 [V] `check`：knowledge-size PASS（index.md + 6 README + 全 core convention 皆進預算）；其餘 10 check 全綠（task-completion 於全打勾後自清）~0 lines
- [x] T18 [V] `pnpm counts:check` 無 drift（factual counts in sync）~0 lines
- [x] T19 [V] `pnpm build && pnpm test` 全綠（2079 tests / 85 files）~0 lines

## 條件

- [x] T20 trim `_status-lifecycle.md` 至 1791 tok（≤1800）讓 knowledge-size 完全 PASS；同步 trim shipped 模板 `status-lifecycle.md.hbs`（1750 tok，防下游 WARN）；§What each gate checks 兩檔逐字一致（no-dual-copy-drift 測試綠）~30 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 20 |
| Code tasks | 11 |
| [V] tasks | 8 |
| Conditional | 1 (T20) |

---

## Notes

- 主要編輯對象是知識庫（docs = code kind，產生 diff）：`module-map.yaml`、`index.md`、6 README + 新 sub-module 檔、`_status-lifecycle.md`。
- 唯一 src 程式變更是 T1（types 常數值），其測試覆蓋由 T5 對齊 + T6 single-source [V]。
- US-1/US-3 為知識文件重構（非新公開函式），以 knowledge-size drift check + token 計數（T9/T16/T17）驗證。
- T1+T3 必須綁定：改預設值同時改 index.md 宣告字樣，否則 REQ-TESTS-048 single-source 測試 FAIL。
