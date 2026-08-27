# fix-loop-discipline — Archive Summary

- **Archived**: 2026-08-27
- **Original Created**: 2026-08-27T14:42:35.511Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/205

## User Story

### US-1: Full-Lens 重審預設與 Per-Critical Regression Pin [P1]
As a 執行自動化程式碼審查與修復的開發者／Agent,
I want `/prospec-review` 預設以 full-lens 執行重審，並要求所有 confirmed critical 必須具備 fail-then-pass regression pin,
So that 修復引入的新缺陷能被及時攔截，且已修復的 critical 不會再次回歸或消耗重複裁決 token。

### US-2: Review Merge CLI 記帳機械化與雙軸 Circuit Breaker [P1]
As a 開發團隊與審查流程維護者,
I want `prospec review merge` 由 CLI 機械化維護輪次、`origin_round`、`lens` 與 `spend` 記帳，並支援 fix-induced ratio 與 spend 雙軸跳閘,
So that Review 迴圈的震盪與成本消耗能被客觀量測，並在超出閾值時自動觸發 EscalationReport。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Modified | Circuit Breaker Ratio/Spend Config and Escalation Types |
| lib | Modified | Dual-Axis Circuit Breaker and Fix-Induced Ratio Calculation |
| services | Modified | Review Merge Service Dual-Axis Bookkeeping |
| cli | Modified | Review Merge CLI Flags and Dual-Axis Escalation Output |
| templates | Modified | Per-Critical Regression Pin and Full-Lens Re-Review Defaults in prospec-review |
| tests | Modified | Unit, Contract, and E2E Tests for Review Fix-Loop Discipline |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-089 | ADDED | Circuit Breaker Ratio/Spend Config and Escalation Types |
| REQ-LIB-063 | ADDED | Dual-Axis Circuit Breaker and Fix-Induced Ratio Calculation |
| REQ-LIB-064 | ADDED | Origin Round and Lens Tracking in Review Merge |
| REQ-SERVICES-098 | ADDED | Review Merge Service Dual-Axis Bookkeeping |
| REQ-CLI-043 | ADDED | Review Merge CLI Flags and Dual-Axis Escalation Output |
| REQ-TEMPLATES-202 | ADDED | Per-Critical Regression Pin and Full-Lens Re-Review Defaults in prospec-review |
| REQ-TEMPLATES-203 | ADDED | Review Format Reference and Circuit Breaker Reference Updates |
| REQ-TESTS-099 | ADDED | Unit, Contract, and E2E Tests for Review Fix-Loop Discipline |
| REQ-LIB-057 | MODIFIED | Oscillation Breaker and Circuit Breaker Logic |
| REQ-TEMPLATES-066 | MODIFIED | Adversarial Review→Fix Loop Skill |
| REQ-TEMPLATES-067 | MODIFIED | Review Severity Contract + review.md Format |
| REQ-CLI-028 | MODIFIED | `prospec review merge` Merges the Cumulative Findings Table |

## Review & Verify

- **Review Summary**: 經獨立審查者（`code-reviewer`）全維度複審，Round 1 發現之 1 個 critical 與 3 個 major 皆已全數修復（含回歸測試鎖定），Round 2 複審 0 critical / 0 major 順利收斂。
- **Verify Summary**:
  - Machine ledger: task-completion=PASS (15/15) · knowledge=PASS (6/6) · tests=PASS (4,261/4,261)
  - Judgment ledger: delta-spec-compliance=PASS (12/12 REQs) · constitution=PASS (8/8 principles) · design=not-applicable
  - **Quality Grade**: **S**

## Completion

- **Tasks**: 15/15 (100%), 2/2 [M]/[V] (not counted)

