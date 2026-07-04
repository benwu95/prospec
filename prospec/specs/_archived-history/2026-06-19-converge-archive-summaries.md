# converge-archive-summaries — Archive Summary

- **Archived**: 2026-06-19
- **Original Created**: 2026-06-19
- **Quality Grade**: S

## User Story

- **US-1**：Archive Summary 歸宿收斂到 date-prefixed `_archived-history/{YYYY-MM-DD}-{change-name}.md`（archive-format 約定 + prospec-archive skill 明確 copy 步驟；committed audit trail、drift-excluded、與 `.prospec/archive/` 資料夾名稱對齊）
- **US-2**：既有 37 份 summary 全面遷移 + date-prefix 改名（date 取自 `Archived:`／`Completed:`；`mvp-initial`=2026-02-04；`001-prospec-mvp-cli/` 目錄保留）；`specs/` root 只剩 `product.md` + `MIGRATION.md`

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | Modified | Archive Service（spec-history 目的地校正） |
| templates | Modified | Archive Skill Template（明列 spec-history copy 步驟） |
| tests | Modified | archive spec-history 目的地 contract pin |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-010 | MODIFIED | Archive Service（spec-history 目的地校正） |
| REQ-TEMPLATES-010 | MODIFIED | Archive Skill Template（明列 spec-history copy 步驟） |
| REQ-TESTS-033 | ADDED | archive spec-history 目的地 contract pin |

## Completion

- **Tasks**: 4/4 (100%), 1/1 [M]/[V] (not counted)

## Review & Verify

- **Review**: 明細不可回收（bundle 已失；摘要僅 task 計數，ledger 未記 review finding）
- **Verify**: Grade S；ledger 記 +1 contract test（1658→1659 / contract 502→503）、verify 補上 implement 漏更的 count、graduate commit 後 drift 0 stale
- **Quality Log**: 不可回收（bundle 已失）
- **Source**: summary（task 計數）+ _lessons-ledger（PB-004 / PB-005）
