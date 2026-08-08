# fix-sdd-handoff — Archive Summary

- **Archived**: 2026-08-08
- **Original Created**: 2026-08-08T14:47:23.228Z
- **Quality Grade**: S

## User Story & Acceptance Criteria

- **Background**: 身為一個執行 prospec 的 AI 代理人，我希望 SDD 流程節點能使用標準的 `_next-step-handoff.hbs` 合約以及祈使句的等待步驟，這樣一來，當我在 Claude Code 以外的環境執行時，就不會默默略過這些步驟，或在需要使用者確認的檢查點 (confirmation gates) 沒有停下來。
- **Feature**: Refactor templates to use `{{> next-step-handoff}}` and imperative gates ("STOP. Ask the user..."). Update tests to dynamically derive skills from `SDD_STATIONS`.
- **Value**: Standardizes the CLI/skill interaction and avoids brittle tests when new skills are added.
- **Acceptance Criteria**: 
  1. `next-step-handoff` is used by all SDD stations.
  2. Tests pass and dynamically check SDD stations.
  3. No passive voice confirmation wait points.

## Quick Scale Spec Impact Check
- Does this change affect behavior documented in Feature Specs? **No**. This is a pure template standardisation refactor and test stability fix. No product-level Feature Spec behavior is changed.

## Review & Verify

- **Quality Grade**: S
- **Review Criticals**: 0
- **Review Majors**: 0
- **Verify Digest**: 
  - `task-completion=PASS`
  - `knowledge=PASS`
  - `tests=PASS`
  - `delta-spec-compliance=not-applicable`
  - `constitution=PASS`
  - `design=not-applicable`
