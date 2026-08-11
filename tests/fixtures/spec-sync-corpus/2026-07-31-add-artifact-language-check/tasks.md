# Tasks: add-artifact-language-check

**Input**: Design documents from `.prospec/changes/add-artifact-language-check/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> TDD 順序：先做 Tests 區的 T7–T11（RED），再回頭做 Types／Lib／Services。
>
> **範圍變更（實作後）**：原設計的嚴重度分層（`_archived-history/**` 記 fail）已拿掉，本版一律 warn——理由見 proposal 的「嚴重度分層的取消」節。T3/T4/T7/T12 的描述已隨之更新。

---

## Types

- [x] T1 `DRIFT_CHECK_IDS` 附加 `artifact-language`，附行為註解（掃描範圍、WARN-only 嚴重度、skip 條件）；既有 13 個 id 順序不動（REQ-TYPES-072）~15 lines

## Lib

- [x] T2 腳本偵測表：語言名 → Unicode 範圍（CJK／Cyrillic／Arabic／Hebrew／Thai／Devanagari／Greek），表中無此語言回傳 undefined（REQ-LIB-037 AC4）~30 lines
- [x] T3 `ArtifactLanguageSource` 型別 ＋ `collectArtifactLanguage`：由 `resolveLanguageScope().nativePaths` 取範圍、以 `ARCHIVE_NATIVE_GLOB` 扣除 archive、containment 守衛、`scanDirSync` 安全走訪、去除 fenced block 後判定字跡（AC1/AC3/AC5）~70 lines
- [x] T4 `evaluateArtifactLanguage` 純函式：來源不可得→`skipped(reason)`；否則對缺字跡檔案逐一產 WARN-class finding（AC2/AC3）~30 lines
- [x] T5 `runChecks` 串接新 evaluator，`DriftCheckInputs` 加欄位 ~10 lines

## Services

- [x] T6 `check.service` 以 `resolveLanguageScope` 產生來源並傳入 `runChecks`；service 內不含任何語言判定（REQ-SERVICES-074）~10 lines

## Tests

- [x] T7 [RED] unit：evaluator 三種結果——帶字跡無 finding、缺字跡 warn（含「一律 warn」的釘死）、來源不可得 `skipped` 且 reason 非空（REQ-TESTS-065 AC1）~60 lines
- [x] T8 [RED] unit：collector 範圍規則——`.prospec/archive/**` 零 finding、非 `.md` 零 finding、無工件時 `available: true` 且樣本為空（AC2/AC3）~50 lines
- [x] T9 [RED] unit：腳本表——繁中/日文/俄文可判定；西班牙文回 undefined 並使 check `skipped`（AC1）~35 lines
- [x] T10 [RED] contract：`DRIFT_CHECK_IDS` 含新 id 且既有順序不變；drift-report schema 接受該 id ~20 lines
- [x] T11 以 `add-harness-capability-flags` 當時的英文 `review.md` 內容為 fixture，斷言產生 warn（SC-001）~25 lines
- [x] T12 [V] mutation-verify T7–T11 每個新斷言類別：severity 升為 fail、archive 未排除、腳本表回傳固定值、skip 改為 PASS、resolver 換成字面值、fence 未剝除、Serbian 誤判——各須轉紅 ~0 lines

## Docs & Sync

- [x] T13 root README 的 `prospec check` 檢查列舉補上新 id（PB-009，已三度復發）~5 lines
- [x] T14 `references/drift-report-format.hbs` 補該 id 的說明 ~8 lines
- [x] T15 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync` 重新部署 ~0 lines
- [x] T16 [M] `pnpm counts` 重導測試計數 ~0 lines
- [x] T17 同步 types/lib/services/tests 四個 module README ~20 lines
- [x] T18 [V] `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm counts:check` 全綠 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 18 |
| Code tasks | 14 |
| `[M]` / `[V]` tasks | 2 / 2 |
| Estimated lines | ~388 lines |

---

## Notes

- 分層標題為架構分組；執行以 TDD 為序（Tests RED → Types → Lib → Services → 文件同步）
- T9 與 T12 的「skip 改為 PASS 須轉紅」是本變更最關鍵的測試：一個回報 `skipped` 卻被讀成 PASS 的 check 比沒有這個 check 更糟
- T13 的 README 列舉是 PB-009 已三度復發的漏點，不可省
