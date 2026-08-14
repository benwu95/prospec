# unify-spec-read-resolution — Archive Summary

- **Archived**: 2026-08-14
- **Original Created**: 2026-08-14
- **Quality Grade**: S
- **Issue**: 151

## User Story

As a prospec maintainer,
I want the CLI `spec show` service and the MCP `get_spec_requirements` tool to route feature-name resolution, contained read, selector expansion, and slice selection through one shared library entry,
So that the parsing and messaging layers cannot answer one question two ways, while each surface keeps its own no-selector policy.

（延伸 US-3：`knowledge://module/{name}` 讀得到 `## Sub-Modules` 連結的 sub-module 檔——對稱於 sliced feature spec 的整份讀取。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `spec-read.ts`（`readSpecSlices` ＋ `assembleWholeSpec` 共用入口）；`knowledge-reader.ts` 加 `parseSubModuleLinks` ＋ `loadModuleKnowledge` |
| services | High | `spec-show.service` 與 `mcp.service` 改接共用入口；MCP module resource 改用 `loadModuleKnowledge` 回 README＋sub-modules |
| tests | Medium | 新 `spec-read.test.ts`、`knowledge-reader.test` sub-module 區塊、mcp-server 契約 sliced-spec＋module-with-sub-modules、強化 single-source 契約 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-055 | ADDED | One shared entry resolves, reads and selects a feature spec for both surfaces |
| REQ-LIB-056 | ADDED | Assemble a module's README with its linked sub-modules |
| REQ-SERVICES-084 | MODIFIED | `spec show` service routes through the shared entry, keeps only its no-selector policy |
| REQ-MCP-009 | MODIFIED | `get_spec_requirements` routes through the same shared resolution entry |
| REQ-TESTS-080 | MODIFIED | Single-source contract pins both surfaces route through the shared entry |
| REQ-MCP-002 | MODIFIED | `knowledge://module/{name}` returns README plus its linked sub-modules |

## Completion

- **Tasks**: 12/12 code tasks (100%)（另 [M]×1 / [V]×2 / 審視×1 皆完成）
- **Acceptance Criteria**: US-1/US-2/US-3 全數 WHEN/THEN 場景由測試覆蓋

## Review & Verify

- **Review**: 2 round(s), 0 critical / 1 major — review-clean；三位獨立審查者交叉驗證（correctness/spec-architecture/PB-007、test-quality/PB-001、security/docs-claims）；唯一 major B1（`parseSubModuleLinks` DRY，reuse 共用 fence primitive、無行為 bug、可降級、advisory）
- **Verify**: Grade S — machine ledger 1/5 task-completion PASS · 4/5 knowledge PASS · 5/5 tests PASS；judgment ledger 2/5 delta-spec-compliance PASS（fresh context）· 3/5 constitution PASS（8/8 rules）· 6 design not-applicable；test:coverage 94% 全綠
- **Quality Log**: prospec-review WARN×2（B1 major 攜帶，advisory）；無 FAIL

## Knowledge Update

已於 verify S/A commit 同步：
- `prospec/ai-knowledge/modules/lib/README.md`（＋`spec-reading.md`）
- `prospec/ai-knowledge/modules/services/read-only-queries.md`
