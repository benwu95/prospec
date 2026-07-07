# cli-print-template — Archive Summary

- **Archived**: 2026-07-08
- **Original Created**: 2026-07-08
- **Quality Grade**: S

## User Story

作為一位 AI 程式碼代理（AI Coding Agent），
我想要 Prospec 技能都不再需要呼叫 Node.js 指令，而能直接透過 `prospec` CLI 原生取得所需要的樣板內容，
以便於在沒有安裝 Node.js 或只安裝 `prospec` 獨立執行檔的環境中也能順利執行升級與維護。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 修改 prospec-upgrade.hbs 技能樣板，移除 node 執行指令 |
| lib | Medium | 調整 template.ts 導出 readTemplateSource |
| services | Low | 新增 print-template.service.ts 業務邏輯 |
| cli | Medium | 註冊 print-template 指令與對應的輸出格式化工具，並加入至 INIT_COMMANDS 免檢測列表 |
| tests | Medium | 新增單元測試與 E2E 測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-020 | ADDED | 新增 print-template 子命令 |
| REQ-SERVICES-015 | ADDED | 實現 Print-Template 業務邏輯 |
| REQ-TEMPLATES-005 | MODIFIED | 更新 prospec-upgrade.hbs 中的樣板讀取邏輯 |
| REQ-LIB-008 | MODIFIED | 導出 readTemplateSource 函數 |

## Completion

- **Tasks**: 10/10 (100%)
- **Acceptance Criteria**: 5/5

## Review & Verify

- **Review**: no review round (recorded directly via CLI)
- **Verify**: Grade S, Task Completion PASS, Delta Spec Compliance PASS, Constitution Full Audit PASS, Knowledge ↔ Implementation Consistency PASS, Test Verification PASS; Vitest E2E/unit suite 100% PASS (2096/2096)
- **Quality Log**: no WARN/FAIL

## Knowledge Update

The following module documentation may need updating:
- `prospec/ai-knowledge/modules/templates/README.md`
