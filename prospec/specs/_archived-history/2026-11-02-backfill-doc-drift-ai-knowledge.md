# backfill-doc-drift-ai-knowledge — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02T18:10:32.886Z
- **Quality Grade**: A

## User Story

As a 開發者，
I want 以 project-scoped git index members、共用 exclusions 與 working-tree file checks 產生 raw-scan.md，
So that AI 可從來源快照產生 module 文件。

本次依使用者核准的 audit／draft，修正既有文件對現行行為的描述；不新增功能、REQ 或 Story 身分，不修改程式邏輯。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| cli | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| lib | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| services | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| templates | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| types | Documentation | 核對既有 source／Knowledge，保持執行行為 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-KNOW-001 | MODIFIED | Resolve Raw-Scan Membership and Exclusions |
| REQ-KNOW-011 | MODIFIED | Module README Token Budget |
| REQ-SERVICES-023 | MODIFIED | Knowledge Update Coordinator |
| REQ-CLI-026 | MODIFIED | `prospec knowledge update` Wires the Service, Scoped to What Is Safe |
| REQ-TEMPLATES-041 | MODIFIED | Plan Brownfield/Greenfield Detection |
| REQ-TEMPLATES-207 | MODIFIED | Verify Knowledge-Implementation Freshness |
| REQ-KNOW-024 | MODIFIED | Archive Auto-Refresh (Non-Fatal) |
| REQ-TYPES-069 | MODIFIED | Per-project knowledge budget override, declared not silent |
| REQ-TEMPLATES-141 | MODIFIED | Language Policy Exempts the Trust Zone |

## Completion

- **Tasks**: not-applicable — backfill 不建立 plan.md／tasks.md。
- **Acceptance Criteria**: per-REQ fidelity 9/9 PASS；原始實作前 baseline 無法重建，aggregate 保留 not-adjudicated。

## Review & Verify

- **Review**: no review round — proven backfill 的 review provenance 豁免；未捏造 critical／major counts。
- **Verify**: CLI Grade A；task-completion=not-applicable · knowledge=PASS · tests=PASS · delta-spec-compliance=not-adjudicated · constitution=WARN · design=not-applicable。
- **Tests**: CLI tests 維度 PASS 來自 proven-backfill applicability，沒有 test_attempt，不代表完整 suite 通過。共用文件契約由 Node 直接執行 Vitest 4.0.18 子集 8/8 files、146/146 tests PASS；pnpm --version 6 秒逾時，完整 CI 未執行。
- **Quality Log**: prospec-test-gate / WARN；tests: not-adjudicated (implemented): no test run recorded for change "backfill-doc-drift-ai-knowledge" — run `prospec check --record-tests` before prospec-verify

## Knowledge Update

已經過 prospec-knowledge-update；CLI worklist 與 related_modules 聯集所需的六個 modules 已核對並由 knowledge verify 蓋章。

## Deferred

保留原 audit 的執行邏輯／資料保留／grading 缺口與 measure/token-measurement 退休；兩份來源模板耦合 Knowledge 文件及 feature 邊界重整另案處理。未將缺口改寫為已允許的行為。
