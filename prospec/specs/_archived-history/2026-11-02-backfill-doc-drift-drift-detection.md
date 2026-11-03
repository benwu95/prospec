# backfill-doc-drift-drift-detection — Archive Summary

- **Archived**: 2026-11-02
- **Original Created**: 2026-11-02T18:10:36.990Z
- **Quality Grade**: A

## User Story

As a 維護 README 與 code 一致性的開發者，
I want 讓 check 比較 module README 的可解析 MCP resource/tool 註冊計數與指定 source 的註冊，
So that factual-count drift 可在 CI 由機械檢查攔截。

本次依使用者核准的 audit／draft，修正既有文件對現行行為的描述；不新增功能、REQ 或 Story 身分，不修改程式邏輯。

## Affected Modules

| Module | Impact | Description |
| --- | --- | --- |
| lib | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| services | Documentation | 核對既有 source／Knowledge，保持執行行為 |
| types | Documentation | 核對既有 source／Knowledge，保持執行行為 |

## Requirements

| REQ ID | Status | Description |
| --- | --- | --- |
| REQ-TESTS-074 | MODIFIED | REQ-heading matcher and spec-counters tests |
| REQ-LIB-079 | MODIFIED | Phase-Level Skill Reference Drift Enforcement |
| REQ-TYPES-034 | MODIFIED | Drift Report mcp-readme-counts Check Id |
| REQ-TYPES-052 | MODIFIED | Drift Report review-provenance Check Id |
| REQ-TESTS-045 | MODIFIED | metadata-completeness engine tests |
| REQ-LIB-027 | MODIFIED | knowledge-size Collector + Evaluator |
| REQ-LIB-033 | MODIFIED | Test provenance snapshot and attempt adjudication |
| REQ-SERVICES-068 | MODIFIED | check.service collector injection + the --record-tests write path |

## Completion

- **Tasks**: not-applicable — backfill 不建立 plan.md／tasks.md。
- **Acceptance Criteria**: per-REQ fidelity 8/8 PASS；原始實作前 baseline 無法重建，aggregate 保留 not-adjudicated。

## Review & Verify

- **Review**: no review round — proven backfill 的 review provenance 豁免；未捏造 critical／major counts。
- **Verify**: CLI Grade A；task-completion=not-applicable · knowledge=PASS · tests=PASS · delta-spec-compliance=not-adjudicated · constitution=WARN · design=not-applicable。
- **Tests**: CLI tests 維度 PASS 來自 proven-backfill applicability，沒有 test_attempt，不代表完整 suite 通過。共用文件契約由 Node 直接執行 Vitest 4.0.18 子集 8/8 files、146/146 tests PASS；pnpm --version 6 秒逾時，完整 CI 未執行。
- **Quality Log**: prospec-test-gate / WARN；tests: not-adjudicated (implemented): no test run recorded for change "backfill-doc-drift-drift-detection" — run `prospec check --record-tests` before prospec-verify

## Knowledge Update

已經過 prospec-knowledge-update；CLI worklist 與 related_modules 聯集所需的六個 modules 已核對並由 knowledge verify 蓋章。

## Deferred

保留原 audit 的執行邏輯／資料保留／grading 缺口與 measure/token-measurement 退休；兩份來源模板耦合 Knowledge 文件及 feature 邊界重整另案處理。未將缺口改寫為已允許的行為。
