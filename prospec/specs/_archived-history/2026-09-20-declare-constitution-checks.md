# declare-constitution-checks — Archive Summary

- **Archived**: 2026-09-20
- **Original Created**: 2026-09-19
- **Quality Grade**: S
- **Issue**: 276

## User Story

作為 prospec Constitution 的維護者與執行 `/prospec-verify` 的開發者，我要讓 Constitution 規則能宣告 `check: <id>[; covers: <scope>]`，由 CLI 從 drift report 直填該規則的機械 verdict，並移除無消費者的 1–5 score，讓 fresh-context grader 不再複述機械結果、只審未機械化規則與覆蓋缺口。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `constitution-audit.ts` 純引擎（fill / anti-flip / requiredStatements）；`change-gate.ts` 抽共用 `mapCheckStatusToVerdict`；`constitution-parser.ts` 解析 `check:`/`covers:` |
| types | Medium | `ConstitutionRuleEntry` 加 `check_id`/`coverage`；`JudgmentDimensionInput` 加 `constitution_rules`＋`.superRefine` |
| services | Medium | `verify-record.service` 併入 constitution machine sub-ledger、set-based 逐規則驗、flag-form 可遵循 refuse、忽略 stale score |
| templates | Medium | `prospec-verify.hbs` 刪 1–5 score、改 statement 規則、machine sub-ledger；`drift-report-format.hbs` 記 `check_id`/`coverage` |
| tests | High | constitution-audit / change-gate mapper / verify-record / skill-format / station / e2e 覆蓋 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-102 | ADDED | `JudgmentDimensionInput` 攜帶 per-rule `constitution_rules`（限 constitution 維度） |
| REQ-LIB-083 | ADDED | `constitution-audit` 純引擎：fill / anti-flip / requiredStatements 去重集 / isLegalCheckId |
| REQ-SERVICES-113 | ADDED | verify record 併入 machine sub-ledger、逐規則 refuse-and-name、flag-form 訊息 |
| REQ-LIB-032 | MODIFIED | parser 額外解析 `check:`/`covers:`，隨 inventory 出 `check --json` |
| REQ-TEMPLATES-063 | MODIFIED | 3/5 宣告規則 CLI 填 verdict、grader 只可追加 WARN、刪 score |
| REQ-TEMPLATES-154 | MODIFIED | 3/5 消費 per-rule check_id/coverage、填 machine sub-ledger |
| REQ-TEMPLATES-157 | MODIFIED | drift-report-format 參考記 `check_id`/`coverage` |
| REQ-TESTS-057 | MODIFIED | 契約：statement 規則、machine sub-ledger、check_id 合法性、score 移除 |

## Completion

- **Tasks**: 18/18 code tasks (100%); ＋1 `[M]`＋1 `[V]` 非碼任務
- **Acceptance Criteria**: AC-1..AC-6 全數滿足

## Review & Verify

- **Review**: 2 round(s)，round 1 = 0 critical / 5 major，round 2 = 0 critical / 0 major（fresh-subagent 兩個 lens 群）。5 個 major 依使用者裁定全修：F-1 statement 門檻改 set-based 逐規則、F-5 抽共用 mapper、F-6 flag-form 可遵循＋補測試、F-7 公式補 not-adjudicated 第三項、F-8 移除失效 pnpm-gate allowlist；round 2 僅 1 minor（stale prose，已修）。
- **Verify**: Grade S；machine 全 PASS（task-completion / knowledge / tests）、judgment 全 fresh-subagent PASS（delta-spec-compliance / constitution 8/8 rules / design N/A）；測試套件 5,855（5,851 passed / 4 skipped、exit 0）。dogfood：本變更用自家新 sub-ledger 驗自家 4 條宣告規則。
- **Quality Log**: new-story PASS；plan WARN（Architecture Verifier delta_spec，已處置）；tasks WARN（Task Verifier，已處置）；review round1 WARN → round2 PASS；verify PASS（S）。

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（constitution-audit / mapCheckStatusToVerdict、檔數 56→57）已同步；其餘 affected 模組 last_verified 已 stamp。
