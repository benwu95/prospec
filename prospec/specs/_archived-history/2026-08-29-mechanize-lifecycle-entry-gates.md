# mechanize-lifecycle-entry-gates — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29T09:23:06.607Z
- **Quality Grade**: S
- **Issue**: #227

## User Story

As a prospec SDD workflow 的執行代理（含弱模型）與維護者，
I want verify record／archive／status implemented 三站原本只靠 skill 文字的 Entry Gate 由 CLI 決定性拒絕，
So that 未真跑 review、metadata/provenance/knowledge 未同步、或 code task 未完成的變更無法被記為通過或封存（PB-003：checker without executor is not a gate）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | verify-record 加 Gate A/D1；archive 加 Gate B；change-status 加 Gate C；status.service 改用抽出的 checkKnowledgeSync |
| lib | Medium | 抽 checkKnowledgeSync 到 knowledge-sync（單一來源）；新增純 archive-gate evaluateArchiveEntryGate；status-router gate 宣告文字 |
| cli | Low | archive --allow-incomplete flag |
| templates | High | verify/archive/review Entry Gate 文字收斂＋dual-copy _status-lifecycle.md gate 段 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-100 | ADDED | verify record refuses on failed review-provenance |
| REQ-SERVICES-101 | ADDED | verify record floors a judgment dimension against its machine counterpart |
| REQ-LIB-071 | ADDED | archive Entry-Gate evaluator + shared knowledge-sync helper |
| REQ-SERVICES-102 | ADDED | prospec archive refuses on failed Entry-Gate conditions |
| REQ-CLI-047 | ADDED | archive --allow-incomplete flag |
| REQ-SERVICES-103 | ADDED | change status implemented requires all code tasks checked |
| REQ-TEMPLATES-131 | MODIFIED | prospec-verify Entry Gate blocks absent/stale review |
| REQ-TEMPLATES-171 | MODIFIED | archive Entry Gate consumes all three provenance checks |
| REQ-TEMPLATES-142 | MODIFIED | archive Entry Gate consumes metadata-completeness |
| REQ-TEMPLATES-173 | MODIFIED | review and verify are re-enterable from verified |
| REQ-LIB-035 | MODIFIED | Pure Route Evaluator (gate declarations name the CLI refuser) |

## Completion

- **Tasks**: 20/20 code tasks (100%), 2 [M]/[V] tasks（不計分母）
- **Acceptance Criteria**: AC-1~AC-4、AC-6、AC-7 達成；AC-5（byte 減量）未達目標（見 Notes）

## Review & Verify

- **Review**: 1 round, 1 critical / 1 major — 皆已修（F-1 Gate C 零 code-task 死結＋回歸 pin；F-2 archive quick knowledge-sync 文字宣稱），fix_induced_ratio 0%
- **Verify**: Grade S — machine 1/5·4/5·5/5 PASS；judgment 2/5·3/5 PASS（fresh-subagent）、6 not-applicable；全測 4406 pass / 4 skip
- **Quality Log**: prospec-plan WARN（plan-verifier 兩 WARN 已於 plan/delta-spec 修正）、prospec-review round1 WARN→round2 PASS、prospec-verify S

## Notes

- **Gate D2 撤除**（原 issue option 3）：proven-backfill 的 not-applicable 短路刻意忽略 repo-wide task-completion 值，報表值與 not-applicable 本就解耦、無一致性可比；且 machine 維度呼叫端無法申報、無弱模型攻擊面。最終為 D1-only。
- **AC-5 byte 減量未達目標**：verify −558B（目標 2000）／archive −1243B（目標 3000）／review −3B（目標 800）。根因：`skill-format.test.ts` 逐字釘死待刪 prose；保留全部 pinned marker（792 contract test 全綠），僅能刪周邊解釋。達標需連同放寬 assertion＋縮 REQ body，與「別刪被 contract test 釘的 prose」原則衝突——經 Tastemaker 裁決採 modest 減量、保留 tested 設計。
