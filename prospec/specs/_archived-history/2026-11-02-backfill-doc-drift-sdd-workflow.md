# backfill-doc-drift-sdd-workflow — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02T18:10:28.762Z
- **Quality Grade**: A

## User Story

**Feature:** sdd-workflow
**Story:** US-1

身為使用 Prospec 的開發者，我希望透過 `/prospec-new-story` 建立結構化的 change request，以便依 INVEST 格式清楚描述 User Story、Acceptance Criteria 與 Functional Requirements。

本次依使用者核准的 audit／draft，修正既有文件對現行行為的描述；不新增功能、REQ 或 Story 身分，不修改程式邏輯。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| cli | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| lib | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| services | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| templates | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| tests | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| types | Documentation | 核對既有 source／Knowledge，保持執行行為 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-CHNG-011 | MODIFIED | Decompose Plan into Tasks |
| REQ-CHNG-012 | MODIFIED | Architecture Layer Ordering |
| REQ-CHNG-013 | MODIFIED | Estimate Task Complexity |
| REQ-CHNG-014 | MODIFIED | Checkbox Task Format |
| REQ-CHNG-015 | MODIFIED | Task Summary Statistics |
| REQ-SERVICES-091 | MODIFIED | Cascade Orchestration Service and Transition Evaluator |
| REQ-TYPES-026 | MODIFIED | ChangeMetadata Scale Field |
| REQ-TEMPLATES-209 | MODIFIED | New-Story Complexity Assessment Phase |
| REQ-TEMPLATES-088 | MODIFIED | Verify Kind-Aware Completion and Quick Dimension Reduction |
| REQ-TEMPLATES-130 | MODIFIED | prospec-review records per-round counts and a convergence baseline |
| REQ-TESTS-043 | MODIFIED | gate template contract test |
| REQ-CLI-025 | MODIFIED | Change Lifecycle Write Commands (log / status / scale / progress) |
| REQ-TEMPLATES-161 | MODIFIED | Workflow Skills Delegate Scaffold, Status and quality_log |
| REQ-TEMPLATES-199 | MODIFIED | Judgment-station model-tier routing guidance (model/harness-agnostic) |
| REQ-TYPES-098 | MODIFIED | Typed CLI help registry with escaping disclosure |
| REQ-CLI-054 | MODIFIED | Agent-facing commands mount registry-driven help |
| REQ-CLI-058 | MODIFIED | `prospec constitution show --station <s> \| --rule <name>` |
| REQ-TESTS-127 | MODIFIED | Slice, catalog and Startup Loading contracts |
| REQ-TEMPLATES-251 | MODIFIED | The test-quality lens grades weakened tests and relaxed test gates as critical |
| REQ-CLI-024 | MODIFIED | `prospec archive` command with dry-run preview and post-judgment `finalize` |

## Completion

- **Tasks**: not-applicable — backfill 不建立 plan.md／tasks.md。
- **Acceptance Criteria**: per-REQ fidelity 20/20 PASS；原始實作前 baseline 無法重建，aggregate 保留 not-adjudicated。

## Review & Verify

- **Review**: no review round — proven backfill 的 review provenance 豁免；未捏造 critical／major counts。
- **Verify**: CLI Grade A；task-completion=not-applicable · knowledge=PASS · tests=PASS · delta-spec-compliance=not-adjudicated · constitution=PASS · design=not-applicable。
- **Tests**: CLI tests 維度 PASS 來自 proven-backfill applicability，沒有 test_attempt，不代表完整 suite 通過。共用文件契約由 Node 直接執行 Vitest 4.0.18 子集 8/8 files、146/146 tests PASS；pnpm --version 6 秒逾時，完整 CI 未執行。
- **Quality Log**: prospec-test-gate / WARN；tests: not-adjudicated (implemented): no test run recorded for change "backfill-doc-drift-sdd-workflow" — run `prospec check --record-tests` before prospec-verify

## Knowledge Update

已經過 prospec-knowledge-update；CLI worklist 與 related_modules 聯集所需的六個 modules 已核對並由 knowledge verify 蓋章。

## Deferred

保留原 audit 的執行邏輯／資料保留／grading 缺口與 measure/token-measurement 退休；兩份來源模板耦合 Knowledge 文件及 feature 邊界重整另案處理。未將缺口改寫為已允許的行為。
