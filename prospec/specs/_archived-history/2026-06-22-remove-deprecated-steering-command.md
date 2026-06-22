# remove-deprecated-steering-command — Archive Summary

- **Archived**: 2026-06-22
- **Original Created**: 2026-06-22
- **Quality Grade**: A

## User Story

身為 prospec maintainer，我希望移除已 deprecated 的 `prospec steering` 指令與其專屬死碼（command／formatter／service／architecture.md.hbs 與專屬測試），以便 codebase 不再背負與 `prospec knowledge init` 重疊、較舊較弱的平行掃描路徑。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| cli | High | 解除 steering 註冊、刪 command+formatter、parse-options 註解、指令/formatter 計數修正 |
| services | High | 刪 steering.service、knowledge/mcp 提示字串改 `knowledge init`、module-readme.hbs 路徑改 `knowledge/` |
| templates | High | 移除 `steering/` 目錄、module-readme.hbs 移至 `templates/knowledge/`、proposal/feature-spec-format 模板 |
| tests | High | 刪 3 專屬測試、修 index/cli-output/e2e/mcp 斷言、22 模板路徑字串 |
| lib | Low | module-detector 註解（共用函式不動）|
| types | Low | 知識同步（無 steering 專屬型別）|

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SETUP-008 | REMOVED | 掃描專案架構（steering；`.prospec.yaml` 回寫刻意捨棄）|
| REQ-SETUP-009 | REMOVED | 生成架構報告與模組映射（`architecture.md` 刻意捨棄）|
| REQ-SETUP-010 | REMOVED | 掃描控制（隨指令退役）|

> 同步（in-place，非 delta REQ）：REQ-MCP-006 提示字串、REQ-SERVICES-025 敘述 → `prospec knowledge init`（避免 archive MODIFIED merge 塌 body）。

## Completion

- **Tasks**: 24/24 code tasks (100%)；[M] 3 / [V] 1 完成
- **Acceptance Criteria**: SC-001..005 met（`prospec --help` 無 steering、typecheck/test/build 綠、drift 0 fail、無殘留、module-readme.hbs 存於 knowledge/）
- **Verify**: Grade A — 5/5 維度 PASS、test 73 檔 1748、coverage 96.04%、drift 0 fail
- **Review**: 0 critical、4 major（3 修＝services 計數對齊 14；1 resolved＝Deprecated Requirements 於本次 archive 以富格式填入）

## Knowledge Update

本變更已同步：`_index.md`、`_glossary.md`、`module-map.yaml`、`modules/{cli,services,templates,tests,lib,types}/README.md`；`raw-scan.md` 已 refresh。Deprecated Requirements 與 Change History 已於 project-setup.md graduate。
