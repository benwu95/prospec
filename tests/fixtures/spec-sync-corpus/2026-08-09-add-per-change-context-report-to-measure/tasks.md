## Types

- [x] 在 `src/types/measurement.ts` 新增 `ProjectWorkflowScale` 型別
- [x] 在 `src/types/measurement.ts` 新增 `ProjectionReportSchema` 定義投影報告結構

## Services

- [x] 在 `src/services/measure.service.ts` 的 `MeasureOptions` 新增 `projectWorkflow` 與 `change` 參數
- [x] 於 `src/services/measure.service.ts` 實作讀取並解析 `metadata.yaml` 以取得 `related_modules` 與 `scale`
- [x] 於 `src/services/measure.service.ts` 實作讀取並解析 `delta-spec.md` 提取 `Feature:` 欄位
- [x] 於 `src/services/measure.service.ts` 實作核心投影邏輯（加總 L1、L2、SKILLs、references 與 feature specs 的 tokens）
- [x] 更新 `MeasureService.execute()` 在傳入 `projectWorkflow` 參數時回傳 `ProjectionReport`

## CLI

- [x] 於 `src/cli/commands/measure.ts` 新增 `--project-workflow [scale]` 與 `--change <name>` 命令列參數
- [x] 更新 `src/cli/formatters/measure-output.ts` 以渲染並格式化 `ProjectionReport` 輸出結果

## Tests

- [x] 在 `tests/unit/types/measurement.test.ts` 增加新 schema 的單元測試
- [x] 在 `tests/unit/services/measure.test.ts` 撰寫投影模式邏輯的單元測試
- [x] 在 `tests/e2e/measure.test.ts` 新增 `prospec measure --project-workflow` 的端到端測試
- [ ] [V] 執行全部測試確保無破壞性變更

## Summary

- **Total Tasks:** 13
