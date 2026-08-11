# Tasks：量測解鎖（unlock-measurement）

> TDD：每個 code 任務先寫/改對應測試（RED）再實作（GREEN）。層序 `types → lib → scripts → services → cli → templates → tests`。

## Types

- [x] T1 `measurement.ts`：新增 `SizeReportSchema`（corpus/git_commit/generated_at/estimator + 每 task 每 strategy cold input 估算 + baseline size saving ratio）與 `DEFAULT_SIZE_REPORT_FILENAME`；不動 `MeasurementReportSchema`（REQ-MEASURE-010）
- [x] T2 `change.ts`：`QualityLogEntrySchema` 加 optional `grade`(S/A/B/C/D)、`dimensions`(`{name,result}[]`)、`criticals_found`/`criticals_fixed`/`majors`(int≥0)；`result` 維持三態（REQ-TYPES-022）
- [x] T3 `change.ts`：`ChangeMetadataSchema` 加 `introduced_by: z.string().optional()`（REQ-TYPES-058）

## Lib

- [x] T4 `drift-sources.ts`：`hasVerifyGrade` 優先讀 `entry.grade ∈ {S,A}`，保留 legacy `entry.result ∈ {S,A}` fallback（REQ-LIB-025）
- [x] T5 `token-accounting.ts`：size 聚合以既有 `estimateTokens`/`savingRatio` 組合供 harness/formatter 共用（如需 thin helper 則單一來源，避免 hand-copy — PB-006）

## Scripts（harness，runtime 分層外）

- [x] T6 `measure-tokens.ts`：加 `--offline`，跳過所有 provider adapter，複用 `measure/assemble.ts` 組裝三策略 + `estimateTokens` 計 size，`atomicWrite('size-report.json')`（REQ-MEASURE-011）
- [x] T7 `measure-tokens.ts`：離線輸出明示「keyless size estimate；cache/cost 需 key（deliberate exclusion）」；無 key 硬退訊息追加 `--offline` 指引（PB-003）

## Services

- [x] T8 `measure.service.ts`：加 `offline` 分支——讀 `size-report.json`、`SizeReportSchema.parse`、缺檔 `PrerequisiteError` 指引 `pnpm measure:tokens --offline`（REQ-MEASURE-012）

## CLI

- [x] T9 `commands/measure.ts`：加 `--offline` 旗標，傳入 `measure.service.execute`
- [x] T10 `formatters/measure-output.ts`：加 size 表呈現（per-strategy size + saving ratio，無 cache/cost 欄、無門檻判定 — REQ-MEASURE-006 誠實邊界）

## Templates

- [x] T11 `prospec-verify.hbs`：Exit/Status 段寫入結構化 `grade` + `dimensions`（5+1 維度 PASS/WARN/FAIL），`result` 仍記閘門三態（REQ-TEMPLATES-145）
- [x] T12 `prospec-review.hbs`：每輪 quality_log entry 寫 `criticals_found`/`criticals_fixed`/`majors`（REQ-TEMPLATES-145）
- [x] T13 `_status-lifecycle.md`（+ 必要時 `_conventions.md`）：新增 `introduced_by` 格式約定＋範例（issue #48 → `fix-init-clobber-add-upgrade`）（REQ-TYPES-058 AC2）

## Tests

- [x] T14 `types/measurement.test.ts`：`SizeReport` accept/reject 缺欄；斷言 `MeasurementReport` 形狀不變（REQ-MEASURE-010）
- [x] T15 `types/change.test.ts`：新欄位 accept/omit、`grade` 限 S/A/B/C/D、`result` 仍限三態不被 grade 取代（REQ-TESTS-022）
- [x] T16 `lib/drift-sources.test.ts` + `drift-checker.test.ts`：`hasVerifyGrade` 新 `grade` 分支 + legacy `result` fallback、metadata-completeness verified-有grade/無grade
- [x] T17 `services/measure.service.test.ts`：offline 分支（讀 size-report、缺檔 PrerequisiteError、invalid schema）
- [x] T18 `cli/measure-output.test.ts`：size 表輸出（無 cache/cost/門檻字樣）
- [x] T19 `tests/unit/scripts/`：harness `--offline` 產 size-report、無 provider fetch（清空 env）
- [x] T20 contract test：verify 段含 `grade`+`dimensions`、review 段含 criticals/majors 寫入指令（section-scoped，PB-001）
- [x] T21 [V] mutation-verify：刪/改 `hasVerifyGrade` 的 grade 分支、`result` 三態守衛、SizeReport 必欄，確認測試轉紅

## Knowledge / Docs

- [x] T22 同步受影響模組 README（types/lib/services/cli/templates）+ `index.md`（PB-005 避免 knowledge-health stale）
- [x] T23 [M] 跑 `pnpm counts` 重新生成事實計數；跑 `pnpm test`/`tsc`/`prospec check` 確認全綠

## Summary

- **Total Tasks:** 23（code 21、[V] 1、[M] 1）
