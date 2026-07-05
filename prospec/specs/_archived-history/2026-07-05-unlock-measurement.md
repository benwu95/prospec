# unlock-measurement — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: S

## User Story

As a prospec 維護者 / 品質趨勢分析者 / gate 漏接率追蹤者,
I want 離線 token size 估算、結構化 quality_log 計數欄位、以及 introduced_by escaped-defect 登記,
So that 量測成本與品質在無 API key 下仍可追蹤、可機器聚合、可回溯漏接率。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | `SizeReportSchema` + `DEFAULT_SIZE_REPORT_FILENAME`；`QualityLogEntry` 結構化 grade/dimensions/criticals 欄位；`ChangeMetadata.introduced_by`（皆 optional） |
| lib | Medium | `hasVerifyGrade` grade-first + legacy `result` fallback；`TOKEN_ESTIMATOR_LABEL` 單一來源 |
| scripts | Medium | harness `--offline` 產 size-report.json（複用 assemble + estimateTokens） |
| services | Medium | `measure.service` offline 分支（`executeOffline` + `loadReport`） |
| cli | Medium | `measure --offline`；`formatSizeOutput` size 表（無 cache/cost/門檻） |
| templates | Medium | verify/review 寫結構化 quality_log；shipped `introduced_by` 慣例 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-MEASURE-010 | ADDED | SizeReportSchema（離線 size 報告，獨立於 MeasurementReport） |
| REQ-MEASURE-011 | ADDED | harness `--offline` 無 key size 產出 |
| REQ-MEASURE-012 | ADDED | `prospec measure --offline` 唯讀 size 顯示 |
| REQ-TYPES-058 | ADDED | ChangeMetadata `introduced_by` escaped-defect 登記欄位 |
| REQ-TEMPLATES-145 | ADDED | verify/review 寫結構化 quality_log 欄位 |
| REQ-TYPES-022 | MODIFIED | QualityLogEntry 加 optional grade/dimensions/criticals 計數 |
| REQ-LIB-025 | MODIFIED | hasVerifyGrade 讀結構化 grade（legacy result fallback） |
| REQ-TESTS-022 | MODIFIED | quality_log 測試涵蓋新欄位 + result 三態不變式 |

## Completion

- **Tasks**: 21/21 code tasks (100%)；T21 [V] + T23 [M] 完成
- **Acceptance Criteria**: SC-001~005 全達成（無 key size 報告、schema 驗證、introduced_by 慣例+範例、向後相容、全綠+drift 清）

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean（5 獨立 fresh-context lens：correctness/spec-architecture/docs-claims/parallel-site+DRY/test-quality）；就地硬化 4 個 nit + 修 P5 README `--offline` doc 缺口
- **Verify**: Grade S，5/5 維度全 PASS（design N/A ui_scope:none）；全套件 2056/2056、tsc/eslint 乾淨、`prospec check` 10/10 0 fail
- **Quality Log**: 無 WARN/FAIL（new-story 一則 advisory：US-2 附帶收斂既有 hasVerifyGrade/result-enum 落差、略擴張 Small——非阻擋；plan/tasks/review/verify 全 PASS）

## Knowledge Update

Module READMEs（types/lib/services/cli/templates）已於 verify S/A feature commit 同步。
