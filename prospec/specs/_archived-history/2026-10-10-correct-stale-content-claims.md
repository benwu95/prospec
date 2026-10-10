# correct-stale-content-claims — Archive Summary

- **Archived**: 2026-10-10
- **Original Created**: 2026-10-10T15:50:38.816Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/373
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1**：身為對照 Feature Spec 稽核模板的 prospec 維護者，我希望 US-19 與 REQ-TEMPLATES-098 描述的 handoff 與現行模板及 contract 一致。
- **US-2**：身為對照 Feature Spec 稽核模板的 prospec 維護者，我希望 Knowledge Quality Gate 的描述不再綁定「Planning Skills」或每站的表格。
- **US-3**：身為依 REQ 找測試的 prospec 維護者，我希望 US-12 及其 REQ 描述的 gate 與測試集合與實際斷言一致。
- **US-4**：身為閱讀 Feature Spec 與 contract 測試的 prospec 開發者，我希望 US-18 情境與測試註解不再宣稱不存在的 phase 註記。
- **US-5**：身為對照 Feature Spec 稽核模板的 prospec 維護者，我希望 agent-integration 的 Edge Case 不再宣稱無 Constitution 時不阻擋。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Low | `tests/contract/skill-format.test.ts` US-18 註解刪不完整的 phase 列舉；`tests/unit/types/change.test.ts` 測試標題刪「every」（斷言不變） |
| services | Low | `src/services/status.service.ts` `unresolvedWarnings` docstring 刪「any result supersedes」句（行為不變） |
| Feature Spec（sdd-workflow、ai-knowledge、agent-integration） | Low | 14 個 MODIFIED REQ；13 處 story 文字、SC-4、Edge Case 走 Manual Convergence |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-098 | MODIFIED | 刪除 `(Y/n)` 與 Y／n 分支 |
| REQ-TEMPLATES-099 | MODIFIED | 刪除 CLI-less 手動掃描 fallback 子句 |
| REQ-TEMPLATES-092 | MODIFIED | 刪除「the fallback and」 |
| REQ-TEMPLATES-097 | MODIFIED | 刪除「and documented」 |
| REQ-TEMPLATES-205 | MODIFIED | 標題刪「Table」；本文只留「check items differ per Skill」 |
| REQ-TEMPLATES-139 | MODIFIED | 刪除「(recorded in `quality_log`)」 |
| REQ-TEMPLATES-040 | MODIFIED | 刪除「Planning Skill 顯示表格」bullet |
| REQ-TYPES-022 | MODIFIED | 刪除「never read as a verifier result」與 Note 的讀取方式、type contract |
| REQ-TEMPLATES-064 | MODIFIED | 刪除「/ prior unresolved WARN」 |
| REQ-TESTS-022 | MODIFIED | 刪除「5」與「all 6」 |
| REQ-TEMPLATES-145 | MODIFIED | 刪除「only」 |
| REQ-SERVICES-104 | MODIFIED | 改為只保留「plan sign-off entry is skipped」；刪除對應的 supersede bullet |
| REQ-TYPES-091 | MODIFIED | 刪除「absent when empty」與「the field is absent」bullet |
| REQ-TYPES-053 | MODIFIED | 刪除「a type contract」 |

Phase 3.5 Manual Convergence（13 處）：`sdd-workflow/us-15.md` :57（US-16 情境）、:91（US-18 情境）、:108／:112（US-19）；`sdd-workflow/us-7.md` :50／:54（US-8）；`ai-knowledge/us-310.md` :116／:120（US-320）；`ai-knowledge.md:106`（SC-4）；`agent-integration.md:154`（Edge Case）；`sdd-workflow/us-12.md` :4／:8／:10（US-12）。

## Completion

- **Tasks**: 3/3 code（100%）；[V] 4，T4／T5 為 archive 前後複驗
- **Acceptance Criteria**: 10/10（US-1.1–5.2；revision 2）

## Review & Verify

- **Review**: 5 rounds, 0 critical / 3 major（皆已修）— R1-1 同族 FALSE 未處理（US-16／REQ-TEMPLATES-092 fallback、REQ-TYPES-053 type contract）、R1-2 REQ-SERVICES-104 刪整句後自相矛盾、R2-1 plan／tasks 未隨修正同步；minor R1-3（量詞判讀不一致，逐輪補齊）、R1-4（測試標題「every」）已修；R4-1（`prospec-verify.hbs:346`「reads only grade」）移入 #375。fresh-subagent；lenses：correctness、security、spec-architecture、docs-claims、test-quality。
- **Verify**: Grade A — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance not-adjudicated（grader 14/14 REQ PASS，因 late-capture 不採計）、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7750 passed／4 skipped）。
- **Quality Log**:
  - prospec-plan FAIL ×1、WARN ×2：第 1 輪漏 US-19 宿主 story 的 REQ-TEMPLATES-099；第 2 輪 advisory（REQ-TEMPLATES-139、REQ-TYPES-091、Story 標頭、`_status-lifecycle.md:52` 同族）；全部併入或移入 #375。
  - prospec-tasks WARN ×1：任務數少、Summary 未列選填欄位（資訊性）。
  - prospec-review WARN ×5 輪：見上。
  - prospec-verify WARN：acceptance baseline 在 implement 後 amend（late-capture，開發者已同意，grade 上限 A）。

## Notes

- 開發者決定：new-story 站併入 agent-integration Edge Case（US-5）；plan sign-off 核准並明確同意 breaking-change 類別（REQ-TEMPLATES-098／099、REQ-TYPES-022、REQ-SERVICES-104 收回已不存在行為的承諾）；`_status-lifecycle.md:52` 另開 #375；review 第 1 輪全修含 R1-4（amend US-4 情境，接受 late-capture）；第 4 輪全修並以第 5 輪為最後一輪；第 5 輪 R4-1 併入 #375。
- 量詞判讀規則（review 收斂）：明確全稱量詞須在所述範圍內全部成立；不定主詞依 story 語境判讀。
- 同一 repo 主工作樹另有 `unify-review-lenses`（#369）進行中，本 change 在獨立 worktree `prospec-373` 進行。

## Knowledge Update

- tests、services 兩模組已 `prospec knowledge verify`；feature commit `01dfc86b` 後 `knowledge:check` 確認兩模組 confirmed。
