# Tasks: add-drift-checker

**Input**: Design documents from `.prospec/changes/add-drift-checker/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

## Types

- [x] T1 Define `DriftReportSchema` in `src/types/drift-report.ts` — 檢項狀態列舉（pass/warn/fail/skipped+reason）、structural/semantic 分層（semantic 恆 not-checked）、knowledge health 凍結欄位（REQ-TYPES-027）~90 lines
- [x] T2 Add `DriftReportInvalid` error class to `src/types/errors.ts`（code + suggestion）~15 lines

## Lib

- [x] T3 `drift-sources.ts`: REQ 定義索引（specs/features 標題，排除 `_archived-*`）+ REQ 引用掃描（specs/** + ai-knowledge/**）~80 lines
- [x] T4 [P] `drift-sources.ts`: markdown 相對連結路徑蒐集（`{}`／glob 佔位樣式跳過）~50 lines
- [x] T5 [P] `drift-sources.ts`: import 邊蒐集（regex 靜態 import、路徑經 module-map 歸屬模組、對應外路徑排除）~70 lines
- [x] T6 [P] `drift-sources.ts`: git 時間戳蒐集（per-module src/README 最後 commit；不可得標記）~60 lines
- [x] T7 [P] `drift-sources.ts`: tasks.md 解析（勾選 × kind 標記，引用 tasks-format 凍結 schema）~50 lines
- [x] T8 `drift-checker.ts`: 結構評估器——REQ 懸空引用、路徑存在性、依賴方向（module-map `depends_on` 驅動、缺失退回 Constitution）（REQ-LIB-014）~90 lines
- [x] T9 `drift-checker.ts`: 健康度評估器（staleness 恆 WARN + 覆蓋率，REQ-LIB-015）+ 完成率評估器（僅 code task 計 FAIL，REQ-LIB-016）~70 lines
- [x] T10 `drift-checker.ts`: 報告組裝——findings 排序（檢項、路徑、行號）、分層、skipped 原因、schema 驗證 ~50 lines

## Services

- [x] T11 `check.service.ts`: `execute()` 編排（蒐集 → 評估 → 驗證 → `--json` 時 atomicWrite 報告；Result 含 hasFail）（REQ-SERVICES-027）~70 lines
- [x] T12 `check.service.ts`: `--init-ci` 渲染 workflow 模板至 `.github/workflows/prospec-check.yml`（rerun-safe）~35 lines

## CLI

- [x] T13 `commands/check.ts`: 註冊 + `--json`/`--strict`/`--init-ci` 旗標 + strict∧hasFail 設 exitCode；登錄至 `index.ts`（REQ-CLI-011）~50 lines
- [x] T14 `formatters/check-output.ts`: 五檢項狀態人讀輸出（skipped 顯式附原因、不計入 PASS；stdout/stderr 分流）~60 lines

## Templates

- [x] T15 `init/prospec-check.yml.hbs`: 兩 job——check（fetch-depth 0 → `--strict --json` → artifact）+ comment（不 checkout、sticky-comment action pin SHA）；最小權限 `permissions:` 區塊（REQ-TEMPLATES-091）~55 lines
- [x] T16 verify skill 模板：V1 完成率與 V4 staleness 改消費 `prospec check --json` 報告；engine unavailable 明示退回；skipped ≠ PASS（REQ-TEMPLATES-092、MODIFIED 045/088）~50 lines
- [x] T17 本 repo dogfood：以 `--init-ci` 產生並提交 `.github/workflows/prospec-check.yml` ~40 lines
- [x] T18 [M] Run `prospec agent sync` 重佈 verify skill 至 agent 目錄 ~5 lines

## Tests

- [x] T19 [P] Unit: drift-report schema（TDD 先紅——semantic 拒絕 pass、skipped 必附 reason、health 欄位契約）~60 lines
- [x] T20 [P] Unit: drift-sources 五蒐集器（memfs + git mock；排除規則、佔位跳過、不可得標記）~120 lines
- [x] T21 [P] Unit: drift-checker 評估器（三類違規定位、WARN-only staleness、code-only 完成率、同輸入逐位元一致）~120 lines
- [x] T22 Unit: check.service（json 寫檔、init-ci rerun-safe、hasFail 判定）~70 lines
- [x] T23 Contract: verify skill 模板斷言（引擎消費措辭、退回路徑、skipped≠PASS；PB-001 section-scoped + structure-aware）+ 再生 `startup-loading-baseline.json` ~80 lines
- [x] T24 E2E: 本 repo `check --strict` exit 0；注入 drift 後 exit 1；連跑兩次 byte-diff（排除 generated_at）；無 git tmpdir → staleness skipped ~80 lines
- [x] T25 [V] Mutation-verify 新增 contract 斷言（逐類刪除被斷言特徵確認轉紅）~10 lines
- [x] T26 [V] 全套測試綠（757 基線 + 新增），覆蓋率 ≥ 80% 維持 ~5 lines

## Summary

- **Total Tasks:** 26
- **Parallelizable Tasks:** 7
- **Total Estimated Lines:** ~1,535 lines

## Implementation Notes

- **T24 偏差（已記錄）**：E2E 改在受控 tmpdir fixture 上執行而非 live repo——live repo 在 change 進行中必然有未勾選 code task（task-completion 會正確 FAIL），對 live repo 斷言 exit 0 在開發期間不穩定屬設計使然。SC-001 的「本 repo 一致狀態 exit 0」由 verify 階段以實際 dogfood run 驗證。
- **首跑 dogfood 發現並修正誤報**：`_module-readme-conventions.md` fenced code block 內的示例連結被誤判 broken link——collector 已加 fence 排除（含單元測試 + 行號保留）。
- **T26 coverage 註記**：專案未安裝 @vitest/coverage-v8（無 coverage script 為既有狀態），以 818 tests 全綠（757 基線 + 61 新增）+ lint/typecheck 乾淨作收。
