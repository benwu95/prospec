# add-lens-yield-statistics — 變更封存摘要

- **Archived**: 2026-08-28
- **Original Created**: 2026-08-28
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/205

## User Story

As a 維護審查流程效能的開發者,
I want `/prospec-learn` 能從封存語料中統計各 review lens 的 confirmed yield（有至少一筆 confirmed finding 的變更數 / lens 啟動次數；`confirmed_per_invocation` 為輔助密度欄）,
So that 零產出或極低產出的 conditional lens 能被數據驅動地識別並退場，減少每輪審查的 token 消耗。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | 新增 LensYieldStat、LensYieldThresholds、LensYieldReport 型別與 Schema |
| lib | Medium | 新增 lens-yield 模組計算 invocation、confirmed yield 與退場建議 |
| services | Medium | learn.service.ts 新增 executeYield 整合函式 |
| cli | Low | 註冊 prospec learn yield 子命令與格式化輸出 |
| templates | Low | prospec-learn 技能範本新增 Staleness Sweep 統計說明 |
| tests | Medium | 新增單元、服務層、CLI 與 E2E 測試覆蓋 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-090 | ADDED | LensYieldStat, LensYieldThresholds, LensYieldReport schemas |
| REQ-LIB-065 | ADDED | calculateLensYield, recommendLensRetirement, buildLensYieldReport pure functions |
| REQ-SERVICES-099 | ADDED | executeYield in learn.service.ts |
| REQ-CLI-044 | ADDED | prospec learn yield command with formatting |
| REQ-TEMPLATES-204 | ADDED | lens yield staleness sweep guidance in prospec-learn.hbs |
| REQ-TESTS-100 | ADDED | unit, service, cli, and e2e test suite |

## Completion

- **Tasks**: 13/13 (100%)
- **Acceptance Criteria**: 5/5

## Review & Verify

- **Review**: 1 round(s), 0 critical / 0 major — review-clean
- **Verify**: Grade S, all 5+1 dimensions PASS; 170 test files passed (4,322 tests, 4 skipped)
- **Quality Log**: 1 WARN (knowledge-size pre-existing headroom) / 0 FAIL
