# Tasks: measure-all-load-surfaces

**Input**: Design documents from `.prospec/changes/measure-all-load-surfaces/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 0: 基線證據

- [x] T1 [M] 記錄改動前 `prospec check --json` 的 15 個 check 判定與 `knowledge-size` finding 數（SC-005 的比較基準）~5 lines

## Phase 1: Types

- [x] T2 `KnowledgeSizeKind` 由 `lib/drift-sources.ts` 遷入 `types/config.ts` 並擴充為 6 個成員 ~10 lines
- [x] T3 `TokenBudgetSchema` ＋ `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 新增四個 optional 門檻欄位 ~15 lines
- [x] T4 新增 `KnowledgeSizeRule` 與 `KNOWLEDGE_SIZE_RULES`（`satisfies Record<KnowledgeSizeKind, …>`）~40 lines

## Phase 2: Lib

- [x] T5 `resolveKnowledgeTokenBudget` 逐鍵覆寫擴充至七個欄位 ~10 lines
- [x] T6 `evaluateKnowledgeSize` 改為登記表驅動的單一迴圈，detail 帶 label＋remedy ~35 lines
- [x] T7 `collectSpecItems` — `specs/product.md` ＋ `specs/features/` 遞迴 `.md` ~35 lines
- [x] T8 `collectDemandKnowledgeItems` — `DEMAND_KNOWLEDGE_FILES` 三檔 ~20 lines
- [x] T9 `collectAuthoredSkillItems` — authoring-mode 閘門、跨 `skillPath` 逐名取最大 ~55 lines
- [x] T10 三個列舉器接進 `collectKnowledgeSize`（簽章不變）~10 lines

## Phase 3: Templates & Docs

- [x] T11 [P] `init/prospec.yaml.hbs` 補四個鍵＋各一行載入面說明 ~12 lines
- [x] T12 [P] `references/config-example.yaml.hbs` 補四個鍵（REQ-TESTS-051 會當場紅）~12 lines
- [x] T13 `prospec/index.md` 的 Progressive Loading 表補新量測面與 shipped default 數字 ~15 lines
- [x] T14 [P] `README.md` ＋ `README.zh-TW.md` 同步 `knowledge-size` 量測面描述 ~16 lines
- [x] T15 [M] `pnpm bundle` ＋ `npx tsx src/cli/index.ts agent sync`（改了 shipped `.hbs`）~2 lines

## Phase 4: Tests

- [x] T16 [P] `evaluateKnowledgeSize` 逐 kind：over／inclusive boundary／override／無 `lineKey` 不出行數 finding ~90 lines
- [x] T17 [P] finding detail 帶正確 remedy（三條指向各自不同）~30 lines
- [x] T18 `collectSpecItems` real-temp-dir：遞迴子目錄、`specs/` 缺席不報錯 ~55 lines
- [x] T19 `collectDemandKnowledgeItems`：三檔齊備／部分缺席 ~30 lines
- [x] T20 authoring-mode 差集斷言：同一 fixture 只切換 `src/templates/skills/` 存否，差集恰為 skill／reference ~50 lines
- [x] T21 跨 `skillPath` 去重：同 skill 兩份取最大且只出一個 item ~40 lines
- [x] T22 單一來源測試擴充：`prospec/index.md` 的 shipped default 數字 == 七個欄位 ~25 lines
- [x] T23 [V] mutation-verify 新斷言 —— 改用**逐點手工變異**（7 個，各指名應被哪一條斷言殺掉），非整檔 `pnpm mutate`：本變更的新邏輯散在 drift-checker／drift-sources／config 三檔，Stryker 逐檔跑的成本是分鐘到小時級，而逐點變異能直接證明「哪個守衛由哪個斷言守住」~5 lines

## Phase 5: 收尾

- [x] T24 [M] `pnpm typecheck`／`pnpm lint`／`pnpm test` 全綠 ~2 lines
- [x] T25 [M] `pnpm counts` 後 `pnpm counts:check` 綠 ~2 lines
- [x] T26 [V] 跑 `prospec check` 比對 T1 基線：`knowledge-size` 新增 finding 清單符合 SC-001；其餘 check 判定逐項不變，**除了** `knowledge-health`（source 已改而知識同步押在 archive）與 `test-provenance`（`--record-tests` 押在 verify）兩個流程必然差異 ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 26 |
| Code tasks | 18 |
| Manual `[M]` | 5 |
| Verification `[V]` | 3 |
| Parallelizable | 6 |
| Estimated lines | ~611 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- T15 的順序不可調換：改 shipped `.hbs` 必須先 `pnpm bundle` 再從 source 跑 agent sync，`pnpm exec prospec` 會用到已安裝的舊執行檔
- T1／T26 成對存在：SC-005 需要改動前後的逐 check 對照，事後補不回來
- T23 的第一版 harness 用 `--reporter=basic`（vitest 4 已移除），整個 run 在載入 reporter 時就失敗 → 7 個變異全報「0 killed」的**假綠**。變異 harness 必須先斷言「變異真的落到檔案上」且解析真正的測試計數，不能只看 exit code 或 grep 不到的樣式
- T23 揪出一個真存活變異：`markdownFilesUnder` 裡的 `isArchivedSpec(entry.name)` 是不可達死碼（`ARCHIVED_PREFIX = '_archived'` 必以 `_` 開頭，`isSafeResourceName` 的 `^[A-Za-z0-9]` 已先拒絕）。已移除死碼並把測試改指向真正生效的守衛，重測後該變異被殺
