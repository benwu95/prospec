# remove-stale-skill-count-claims — Archive Summary

- **Archived**: 2026-10-10
- **Original Created**: 2026-10-10T09:29:29.751Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/372
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1**：身為對照 Feature Spec 稽核實作的 prospec 維護者，我希望 Feature Spec 與 AI Knowledge 不再寫死與現行不符的 skill／template／reference 數。
- **US-2**：身為對照 Feature Spec 稽核測試的 prospec 維護者，我希望 REQ-TESTS-029 描述的測試種類與斷言範圍與實際守護它的測試一致。
- **US-3**：身為閱讀 `src/types` 與測試程式的 prospec 開發者，我希望註解與測試標題不再描述已移除的 `hasReferences` 欄位、agent-sync 的 referenceMap、錯誤的 reference 數量，或「CLAUDE.md 列出 skill」。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `src/types/skill.ts:410` 註解刪「CLAUDE.md/」 |
| tests | Low | 三個測試檔的註解與三個測試標題（斷言不變） |
| AI Knowledge | Low | `modules/tests/contract-guards.md` 刪 reference 數；`modules/templates/README.md`、`skill-authoring.md` 的 `skills/references/*.hbs` (31)→(32) |
| Feature Spec（sdd-workflow、agent-integration） | Low | 五個 MODIFIED REQ；SC-4 與 US-18 story 文字走 Manual Convergence |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-023 | MODIFIED | 刪除「skill count 12」，改為「the skill count」 |
| REQ-TESTS-029 | MODIFIED | 標題刪「Contract」；本文改指實際守護：contract 斷言排除集合與長度 17，agent-sync unit tests 斷言 quickstart 排除與 SKILL.md 產出，filter mutation 由 entry-config unit test 抓到；刪除「section-scoped, structure-aware」與 upgrade 被斷言的宣稱 |
| REQ-TEMPLATES-060 | MODIFIED | 刪除「11」 |
| REQ-TEMPLATES-097 | MODIFIED | 「The 8 numbered-phase skills」改為點名 `NUMBERED_PHASE_SKILLS` 的 8 個 skill；刪除「2-3 item」與「Single-phase skills are exempt」 |
| REQ-TEMPLATES-143 | MODIFIED | 刪除 6／15／17、「md5-identical」與「promote-backfill handoff」 |

Phase 3.5 Manual Convergence：`agent-integration.md` SC-4 刪「13」；`sdd-workflow/us-15.md` US-18 的 I want（:87）、so that（:88）與情境（:92）縮到 REQ-TEMPLATES-097 點名的 skill，刪除「2-3 item」、Entry/Exit gate 括號與「skill-end Exit Gate」子句。

## Completion

- **Tasks**: 7/7 code（100%）；[V] 5/5；[M] T11（follow-up issue）待開發者同意後於 archive 後進行
- **Acceptance Criteria**: 10/10（US-1.1–1.5、US-2.1–2.2、US-3.1–3.3）

## Review & Verify

- **Review**: 3 rounds, 0 critical / 2 major（皆已修）— R1-1 `NUMBERED_PHASE_SKILLS` 註解的「8／other 5」不成立、R1-2 測試標題引用不存在的 `SKILL_REFERENCE_MAP`；minor R1-3（REQ-TESTS-029 主詞）、R1-4（US-18 story 文字預設 skill 層級 Exit Gate）、R2-1（REQ-AGNT-023 測試標題宣稱落盤）皆已修。第 3 輪 review-clean（fresh-subagent；lenses：correctness、security、spec-architecture、docs-claims、test-quality、parallel-site）。
- **Verify**: Grade A — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance not-adjudicated（grader 5/5 REQ PASS，因 late-capture 不採計）、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7750 passed／4 skipped）。
- **Quality Log**:
  - prospec-plan FAIL ×2：第 1 輪逐族掃描漏列相鄰族（REQ-TEMPLATES-143 等），改為整類稽核；第 2 輪誤列 `_conventions.md:128`（經核實成立），撤回。
  - prospec-tasks FAIL ×1、WARN ×2：`knowledge verify` 需模組參數、`knowledge:check` 須於 commit 後重跑、AI Knowledge (31)→(32) 漏列，已修正並併入。
  - prospec-review WARN ×2：R1 兩個 major 與 R2 兩個 minor，開發者皆選全修。
  - prospec-verify WARN：acceptance baseline 在 story 站之後 amend（late-capture，開發者已同意，grade 上限 A）。

## Notes

- archive 後驗證（T10）：五個 REQ 的本文與標題皆為新版，REQ-TESTS-023、REQ-TEMPLATES-060、REQ-TEMPLATES-143 不含與現值不符的數字；REQ-TEMPLATES-097 點名集合與 `NUMBERED_PHASE_SKILLS` 相同（腳本比對）；`agent-integration.md:166` SC-4 與 `sdd-workflow/us-15.md:87`、`:88`、`:92` 等於 delta-spec 的替換句。
- 開發者決定：併入同族項目並 amend 凍結情境（接受 late-capture）；核准縮小 REQ-TESTS-029（breaking-change 類別）；併入 (31)→(32)；review 兩輪皆全修。
- REQ-TESTS-029 的 mutation 宣稱已實跑：刪除或反轉 `agent-sync.service.ts` 的 entry-config filter，只有 REQ-AGNT-023 unit test 轉紅，contract `Skill definitions` 維持綠。
- 範圍外內容類失真（T11 follow-up）：REQ-TEMPLATES-098 的 `(Y/n)`、REQ-TEMPLATES-205 與 ai-knowledge SC-4 的「Planning Skills」集合、REQ-TESTS-022 的測試集合讀法、`sdd-workflow/us-15.md:91` 的「annotated as deliberate insertions」。
- 同一 repo 主工作樹另有 `unify-review-lenses`（#369）進行中，本 change 在獨立 worktree 進行，與其無關。

## Knowledge Update

- types、tests 兩模組已 `prospec knowledge verify`；feature commit 後 `knowledge:check` 確認兩模組 confirmed。templates 模組 README 與 skill-authoring.md 的檔案數已修正。
