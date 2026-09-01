# refresh-v2-documentation — Archive Summary

- **Archived**: 2026-09-01
- **Original Created**: 2026-08-31
- **Quality Grade**: S

## User Story

As a 準備安裝或升級 Prospec 的開發者,
I want README 與官網在 2.0 發布前描述相同且符合目前程式碼的產品行為,
So that 我能用正確的 host 語法、工作流程與升級步驟採用 2.0，而不必從 release notes 猜測相容性。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | High | 擴充 factual-count registry 與 public-document contract guards，涵蓋雙語官網。 |
| types | Low | 作為 lifecycle、Skill invocation 與 MCP frozen registries 的驗證來源。 |
| services | Low | 作為 status、upgrade、MCP 與 gate behavior 的驗證來源。 |
| cli | Low | 作為 command surface、handoff 與 standalone entry behavior 的驗證來源。 |
| templates | Low | 作為 host-aware Skill guidance 與 generated entry config 的驗證來源。 |
| lib | Low | 作為 count synchronization 與 shared document contract 的驗證來源。 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-070 | MODIFIED | Machine-owned test totals、passed 與 skipped counts 擴及英文官網與繁中 overlay。 |
| REQ-DOCS-001 | MODIFIED | 雙語 README／官網對齊 current lifecycle、runtime boundary、host invocation、MCP surface 與 upcoming 2.0 upgrade guidance。 |

## Completion

- **Tasks**: 12/12 code tasks (100%)
- **Acceptance Criteria**: 4/4
- **Verification Tasks**: 由 verify station 與 pre-archive gates 執行；`docs/og.png` 保留為已明示的 1.3 social preview，待 release 視覺素材處理。

## Review & Verify

- **Review**: 8 recorded rounds，5 critical / 9 major findings；全部 fixed 或 invalid，final fresh reviewer 確認 0 unresolved critical / 0 unresolved major。
- **Verify**: Grade S；task completion、Knowledge、tests、Delta Spec 與 Constitution 均 PASS，design 為 not-applicable；完整 suite 為 4,625 passed / 4 skipped。
- **Quality Log**: 8 筆 review WARN 記錄逐輪修正與 circuit-breaker 歷史；terminal entry 明載 fix-induced threshold exceeded，但 fresh reviewer 確認無 unresolved critical／major。

## Knowledge Update

- `tests` README 與 Contract Guards 已補入 website count／release-readiness recipes。
- `cli`、`lib`、`services`、`templates`、`types` README 與 linked sub-modules 已重確認符合實作。
- 6 個 affected modules 已由 `prospec knowledge verify` 更新 freshness stamp；`pnpm knowledge:check` 通過。
