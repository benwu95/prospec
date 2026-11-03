# backfill-doc-drift-agent-integration — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02T18:10:30.838Z
- **Quality Grade**: A

## User Story

**Feature:** agent-integration
**Story:** US-400
As a 開發者，
I want 讓 Prospec 在初始化時偵測已安裝的 AI CLI tools，並為我設定的 agents 產生配置，
So that 讓 AI Agents 能立即在 SDD framework 中工作。

本次依使用者核准的 audit／draft，修正既有文件對現行行為的描述；不新增功能、REQ 或 Story 身分，不修改程式邏輯。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| lib | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| services | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| templates | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| tests | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| types | Documentation | 核對既有 source／Knowledge，保持執行行為 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-AGNT-001 | MODIFIED | Detect Installed AI CLI |
| REQ-AGNT-006 | MODIFIED | Specify Specific CLI |
| REQ-AGNT-005 | MODIFIED | Skill Progressive Disclosure Guidance |
| REQ-TEMPLATES-073 | MODIFIED | Templates English Baseline |
| REQ-AGNT-020 | MODIFIED | Entry Config Language Declaration |
| REQ-TYPES-033 | MODIFIED | CHANGE_SCALES enum Includes backfill |
| REQ-TEMPLATES-151 | MODIFIED | Entry Config Renders the Shared Language Scope |
| REQ-TEMPLATES-160 | MODIFIED | Shared Required-CLI Probe Partial |
| REQ-TEMPLATES-218 | MODIFIED | Trimming and Table Simplification for Over-Budget References |

## Completion

- **Tasks**: not-applicable — backfill 不建立 plan.md／tasks.md。
- **Acceptance Criteria**: per-REQ fidelity 9/9 PASS；原始實作前 baseline 無法重建，aggregate 保留 not-adjudicated。

## Review & Verify

- **Review**: no review round — proven backfill 的 review provenance 豁免；未捏造 critical／major counts。
- **Verify**: CLI Grade A；task-completion=not-applicable · knowledge=PASS · tests=PASS · delta-spec-compliance=not-adjudicated · constitution=not-adjudicated · design=not-applicable。
- **Tests**: CLI tests 維度 PASS 來自 proven-backfill applicability，沒有 test_attempt，不代表完整 suite 通過。共用文件契約由 Node 直接執行 Vitest 4.0.18 子集 8/8 files、146/146 tests PASS；pnpm --version 6 秒逾時，完整 CI 未執行。
- **Quality Log**: prospec-test-gate / WARN；tests: not-adjudicated (implemented): no test run recorded for change "backfill-doc-drift-agent-integration" — run `prospec check --record-tests` before prospec-verify

## Knowledge Update

已經過 prospec-knowledge-update；CLI worklist 與 related_modules 聯集所需的六個 modules 已核對並由 knowledge verify 蓋章。

## Deferred

保留原 audit 的執行邏輯／資料保留／grading 缺口與 measure/token-measurement 退休；兩份來源模板耦合 Knowledge 文件及 feature 邊界重整另案處理。未將缺口改寫為已允許的行為。
