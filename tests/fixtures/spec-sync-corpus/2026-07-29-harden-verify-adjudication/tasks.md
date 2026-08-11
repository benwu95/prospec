# Tasks: harden-verify-adjudication

> RED 任務（先寫在現行行為下轉紅的測試）緊接其 GREEN 實作任務；`test:` commit 先於或伴隨 `feat:`/`fix:`。

## Types

- [x] T1 `drift-report.ts` id 清單註解對齊 evaluator 行為（backfill 豁免 draft-gated、已記錄失敗永不豁免）(US-7) ~4 lines

## Lib

- [x] T2 RED：test-provenance ordering 測試——`exit_code: 1` 紀錄＋不可解析 command → 期望 FAIL（現行回 skipped）(US-1) ~40 lines
- [x] T3 `collectTestProvenance` 移除兩個 command early-return，source 增 `command_unavailable_reason`，照常枚舉（git/changesDir 缺失仍 unavailable）(US-1) ~40 lines
- [x] T4 `evaluateTestProvenance` 判序：recorded-failure → command-unavailable skip → no-record → stale；同步既有四象限測試 (US-1) ~35 lines
- [x] T5 RED：escaped-defects mixed-alias 測試——`passed=1`＋兩種拼法 blame → 現行丟 `EscapedDefectReportInvalid` (US-2) ~35 lines
- [x] T6 blamed 集合改 canonical change 身分 key；`drift-sources` quality_log `result` trim 後比對 (US-2) ~25 lines
- [x] T7 RED：unborn-HEAD fixture 命中 `diff === null` 分支＋ls-files 選擇性失敗測試（真 temp dir）(US-4) ~45 lines
- [x] T8 `computeChangeDigest` ls-files 擷取失敗 fail-closed 回 `null` (US-4) ~5 lines
- [x] T9 review-provenance source 補 `backfill_draft_present`；`drift-checker` 豁免改 draft-gated＋RED draft-less backfill 測試 (US-5) ~40 lines
- [x] T10 `markdown-fences` CommonMark 修正：縮排 ≥4 非 fence、含反引號 info string 非 opener (US-6) ~20 lines

## Services

- [x] T11 `recordTestProvenance`：post-run 重讀 metadata 並 merge 寫回（run 期間不可解析 → 失敗不寫回）；reason 拆「not a git repository」／「could not compute the change digest」(US-4, US-8) ~40 lines

## CLI

- [x] T12 `commands/check.ts` `--json` help 文字按模式寫對輸出檔名 (US-7) ~3 lines

## Templates

- [x] T13 `prospec-verify.hbs` WARN 豁免封閉列舉（三類＋統稱兜底）；`:287`／`:315` 裸述加指向 (US-3) ~30 lines
- [x] T14 `config-example.yaml.hbs` `test_command` 範例改 shell-free 值、與註解一致 (US-7) ~3 lines
- [x] T15 [M] `pnpm bundle` → `npx tsx src/cli/index.ts agent sync`（重生 bundle 與 `.claude/`／`.agents/` 鏡像）(US-3, US-7) ~5 lines

## Tests

- [x] T16 新 `tests/unit/lib/markdown-fences.test.ts`：縮排 fence／inline span／`~~~`／mixed-marker close 四類 (US-6) ~80 lines
- [x] T17 契約：豁免定義存在＋每處額度敘述帶指向（section-scoped）(US-3) ~40 lines
- [x] T18 契約：`after the Entry\nGate` 換行 pin 改 wrap-independent 斷言 (US-7) ~10 lines
- [x] T19 service 測試：run 期間並行編輯 metadata → 兩者共存；run 中損毀不寫回；reason 拆分斷言 (US-8) ~50 lines
- [x] T20 [V] mutation-verify：revert `:914`／`:915` 各轉紅；刪豁免定義轉紅（首輪 mutation 太弱經強化）；恢復舊判序轉紅 (US-1, US-3, US-4) ~10 lines

## Docs & Data

- [x] T21 `_lessons-ledger.md`：`kind` 封閉集合、`impact_modules` 模組名清理、疊字／全形符號修復（不動既有 status 結論）(US-7) ~15 lines
- [x] T22 `_archived-history/2026-07-28-split-verify-adjudication.md` Requirements 表補 REQ-TYPES-034 MODIFIED 列 (US-7) ~3 lines
- [x] T23 `sdd-workflow.md` REQ-TEMPLATES-157 宣稱收斂至契約測試實際釘住範圍（英文）(US-7) ~6 lines
- [x] T24 [M] `pnpm counts` 重導計數並同步 README／index／tests README ~5 lines
- [x] T25 [V] `pnpm test`＋`typecheck`＋`lint`＋`prospec check` 全綠；`--escaped-defects` 輸出含本 change 歸因樣本（SC-007／SC-008）~5 lines

## Summary

- **Total Tasks:** 25（code 21、[M] 2、[V] 2）
- **Parallelizable Tasks:** 0（RED→GREEN 配對與 bundle 同步有序）
- **Total Estimated Lines:** ~595 lines
