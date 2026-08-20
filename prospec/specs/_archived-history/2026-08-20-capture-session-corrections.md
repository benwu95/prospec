# capture-session-corrections — Archive Summary

- **Archived**: 2026-08-20
- **Original Created**: 2026-08-20
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/184

## User Story

作為使用 Prospec 的開發者，我要 L0 agent config 在自然反思節點回顧本 session 的糾正並自動沉澱，
讓我不必記得手動跑 `/prospec-learn`，糾正也不會遺失（把 Type III「Stay Silent」延伸到教訓捕獲）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | entry.md.hbs 新增 L0 Checkpoint Correction Capture 協議；promotion-format.hbs 新增 Generalizability Heuristic 段並併入單一定義列舉 |
| tests | Medium | skill-format.test.ts 新增 4 個契約測試（協議正向+harness-neutral 反向、heuristic 兩份副本） |

（cli / services / lib / types 零改動——復用既有 `prospec learn upsert` 寫入器。）

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-197 | ADDED | entry config L0 Checkpoint Correction Capture 協議 |
| REQ-TEMPLATES-198 | ADDED | promotion-format 的 Generalizability Heuristic（收錄/排除單一定義） |
| REQ-TESTS-095 | ADDED | 協議的契約測試（section-scoped + harness-neutral 反向） |
| REQ-TEMPLATES-072 | MODIFIED | promotion-format 單一定義列舉納入 Generalizability Heuristic |
| REQ-TESTS-024 | MODIFIED | pipeline 契約增 pin heuristic（兩份副本） |

## Completion

- **Tasks**: 5/5 code tasks (100%)；另 3 個 `[M]` + 2 個 `[V]` 皆完成
- **Acceptance Criteria**: US-1 + US-2 驗收情境全數滿足

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — major 為 advisory（Collect folding 未顯式指向新 heuristic，經全讀 promotion-format 繼承，設計可辯護；不修，需 MODIFY REQ-069 + cascade）
- **Verify**: Grade S — 1/5 task-completion PASS · 2/5 delta-spec PASS · 3/5 constitution 8/8 PASS · 4/5 knowledge PASS · 5/5 tests PASS · 6 design not-applicable；`pnpm test` 3972 passed / 4 skipped
- **Quality Log**: plan WARN（Architecture Verifier 3 findings 已於 plan 站消解：REQ-197 改歸 agent-integration、補 MODIFY 072/024、移除 before-commit checkpoint）；review WARN（上述 advisory major）

## Knowledge Update

已於 verify S/A commit-prompt 同步並 stamp freshness：
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/tests/README.md`

promotion-format ref 本已超 2500-token 預算（pre-existing WARN），本變更 +~11 行（~150 tokens）為既有壓力常態的邊際增加，如實揭露、非阻擋。
