# instruct-prospec-knowledge-verify — Archive Summary

- **Archived**: 2026-08-19
- **Original Created**: 2026-08-19T03:48:24.232Z
- **Quality Grade**: A
- **Issue**: #187

## User Story

身為 Prospec 技能使用者，
我希望在 `/prospec-knowledge-update` 完成 README 內容編寫後，以及在 `/prospec-verify` 達到 S/A 準備 commit 前，技能明確指引執行 `prospec knowledge verify <modules...>`，
以便自動在 `module-map.yaml` 蓋上 `last_verified` 新鮮度戳記，避免後續 `prospec check` 時因新鮮度落後而產生 `knowledge-health` 警告。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| templates | High | 在 prospec-knowledge-update 與 prospec-verify 加入 prospec knowledge verify 指引 |
| tests | Medium | 在 skill-format.test.ts 建立契約測試與 backfill 例外斷言 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TEMPLATES-162 | MODIFIED | knowledge-update Skill 在 Phase 3e 明確指引執行 prospec knowledge verify |
| REQ-TEMPLATES-129 | MODIFIED | Verify S/A Commit Prompt 加入 prospec knowledge verify 知識同步指引 |
| REQ-TESTS-090 | ADDED | Contract Tests 鎖定 prospec knowledge verify 指引與 backfill 斷言 |

## Completion

- **Tasks**: 4/4 (100%)
- **Acceptance Criteria**: 8/8

## Review & Verify

- **Review**: 1 round(s), 0 critical / 2 major — REQ ID collision resolved (REQ-TESTS-090), metadata.related_modules synced, backfill contract assertion added
- **Verify**: Grade A, 5/5 dimensions PASS (delta-spec-compliance=PASS, constitution=PASS, tests=PASS, task-completion=PASS, knowledge=WARN, design=not-applicable); pnpm test green (3884 passed)
- **Quality Log**: 2 WARN from pre-existing cli and types knowledge-health staleness
