# retire-legacy-index-migration — Archive Summary

- **Archived**: 2026-08-31
- **Original Created**: 2026-08-31
- **Quality Grade**: A

## User Story

As a prospec maintainer,
I want to remove the obsolete `_index.md` migration and compatibility behavior,
So that upgrade and Knowledge workflows only maintain the current root-level `index.md` contract.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 移除 upgrade 與 Knowledge Skill 中的 legacy migration 指引，並同步 generated surfaces。 |
| lib | High | 移除 convention scanner 與 init-doc context 的 legacy special case。 |
| services | Medium | 保留 baseline root-index 建立，移除 legacy migration contract 註解。 |
| tests | High | 將 legacy-specific assertions 收斂為 current root-index 與一般 convention contract。 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-034 | MODIFIED | Root-level `index.md` 為唯一 L1 entry point。 |
| REQ-KNOW-035 | MODIFIED | Non-core convention 一律依一般 load-on-demand 規則分類。 |
| REQ-TEMPLATES-121 | MODIFIED | Upgrade Skill 不再辨識或遷移 legacy `_index.md`。 |
| REQ-SETUP-024 | MODIFIED | Missing root index 僅建立 current baseline。 |
| REQ-TEMPLATES-124 | MODIFIED | Step 2 enrichment 僅涵蓋 current root index。 |
| REQ-MCP-002 | MODIFIED | Index resource 維持 root-only read/not-found contract。 |

## Completion

- **Tasks**: 13/13 code tasks (100%); 3/3 verification tasks complete，active-contract scan 為零命中
- **Acceptance Criteria**: 4/4

## Review & Verify

- **Review**: 3 round(s), 1 critical / 3 major — critical 與 1 major 已修復；2 個 test-quality majors 保持 proposed，runtime contract 正確。
- **Verify**: Grade A；task、Knowledge、tests、Constitution PASS，delta-spec compliance WARN，design not-applicable；`pnpm test` 4,601 passed / 4 skipped（4,605 total）。
- **Quality Log**: Review 曾記錄 1 critical fix-loop 與 2 個 remaining test-quality majors；Verify 記錄 REQ-TEMPLATES-121 Story routing 與兩個 regression-guard gaps 為 WARN。

## Knowledge Update

已同步並重新確認 `lib`、`services`、`templates`、`tests` 的 Knowledge；`module-map.yaml` freshness 已更新。
