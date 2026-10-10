# remove-stale-spec-claims — Archive Summary

- **Archived**: 2026-10-10
- **Original Created**: 2026-10-10T05:16:32.787Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/368
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1**：身為以 Feature Spec 對照實作的 verify 評審者，我希望描述 skill 是否帶 reference 的 REQ 不再把 `hasReferences` 寫成 skill 註冊表的欄位，也不再說 reference 對應存在 agent-sync 自己的表，這樣對照 `SKILL_DEFINITIONS` 與 `STATION_REFERENCES` 時不必每次重新判斷。
- **US-2**：身為以 agent-integration Feature Spec 對照 `prospec agent sync` 產出的 verify 評審者，我希望 REQ-AGNT-023 與 US-440 情境不再宣稱 entry config 少於 100 行，REQ-AGNT-023 也不再宣稱 `CLAUDE.md` 有 skill 清單。
- **US-3**：身為晉升或退休 playbook entry 的 prospec 維護者，我希望 REQ-TESTS-024 以不含數量的通稱描述 active entry。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types（Feature Spec） | Low | REQ-TYPES-023／024／032／035：刪除 `hasReferences` 欄位、referenceMap 與過時的 skill 數 |
| services（Feature Spec） | Low | REQ-AGNT-015／022／023／037／039～042、REQ-SERVICES-030：刪除 agent-sync 登錄、旗標翻轉、行數與 MANDATORY 等不成立子句 |
| templates（Feature Spec） | Low | REQ-TEMPLATES-111／211：刪除旗標與「Phase 2」載入階段 |
| tests（Feature Spec） | Low | REQ-TESTS-024／030／127：刪除寫死的 playbook 條目數與 `referenceFiles`=24 |

`src/**`、`tests/**` 與 shipped template 皆未變動。

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-024 | MODIFIED | 刪除 `hasReferences: true` 與 referenceMap 子句 |
| REQ-TYPES-023 | MODIFIED | 刪除 referenceMap、metadata schema 子句與「12 skills」bullet |
| REQ-TYPES-032／035 | MODIFIED | 刪除 `hasReferences` 元素 |
| REQ-SERVICES-030 | MODIFIED | 刪除 `getReferenceMap()` 子句與 bullet |
| REQ-AGNT-015 | MODIFIED | 刪除「via the referenceMap」與不成立的「so the MANDATORY reads resolve」 |
| REQ-AGNT-022／037 | MODIFIED | 刪除旗標翻轉括號 |
| REQ-AGNT-023 | MODIFIED | 刪除「CLAUDE.md/AGENTS.md」、L0 穩定與「<100 lines」因果子句；「contract test」改為「a test」 |
| REQ-AGNT-039～042 | MODIFIED | 標題刪除「Register … in agent-sync」，刪除本文 |
| REQ-TEMPLATES-111／211 | MODIFIED | 刪除「Phase 2」載入階段（實為 Phase 1）；211 另刪旗標、entry config 與中文 alias 子句 |
| REQ-TESTS-024 | MODIFIED | 「all 20 active entries」「seven mechanized」改為不含數量的通稱 |
| REQ-TESTS-030 | MODIFIED | 刪除 `hasReferences dependency` 標題與 `referenceFiles`=24 |
| REQ-TESTS-127 | MODIFIED | 刪除 24／20／4 數字與「five untouched skills」bullet |

Phase 3.5 Manual Convergence：`agent-integration/us-439.md:96`（US-440 情境）刪除「(L0 stays lean, <100 lines)」。

## Completion

- **Tasks**: 0/0 code；[M]/[V] 9/10（不計入完成率），T9 archive 後驗證結果見 Notes；T10（開 follow-up issue）在 archive 後進行
- **Acceptance Criteria**: 8/8（US-1.1–1.3、US-2.1–2.3、US-3.1–3.2）

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean（fresh-subagent；lenses：correctness、security、spec-architecture、docs-claims、parallel-site）。
- **Verify**: Grade S — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance PASS（18/18 REQ、8 個凍結情境皆滿足）、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7750 passed／4 skipped）。
- **Quality Log**:
  - prospec-plan FAIL ×2：第 1 輪漏列 REQ-SERVICES-030，REQ-TEMPLATES-211（Phase 2）與 REQ-TYPES-023（只經 `quality_log`）照抄了不成立的子句；第 2 輪漏列 REQ-AGNT-039～042 與 REQ-TESTS-127。字串 grep 連兩輪漏列，改用逐行機械列舉後收斂。
  - prospec-plan WARN ×2：第 3、4 輪只剩措辭問題。開發者選擇以一次性逐子句稽核收斂，只修不成立的子句與本 change 改寫出的句子，一律只刪不加；第 5 輪 PASS 後簽核。
  - prospec-tasks WARN：證據基準、dry-run 時點、SC 編號等建議，已在 tasks.md 修正。

## Notes

- archive 後驗證（T9）：`prospec/specs/features/`（排除 Change History 表格列）中 `hasReferences`、不分大小寫的 `referenceMap`、「<100 lines」、寫死的 playbook 數量與「Phase 2 pointer」皆為 0 命中；REQ-AGNT-003 未變動（SC-001～SC-003）。
- 照抄但「不精確但成立」的舊子句（例如 REQ-AGNT-039／041 的 `*/references/` glob、REQ-AGNT-022「a second reference」）不在本 change 範圍，逐句分類見 change 目錄的 `evidence/clause-audit-baseline.md`。
- 範圍外 follow-up（T10）：`sdd-workflow/us-12.md:133`「skill count 12」、`agent-integration.md:166` SC-4「All 13 Skills」、`src/types/skill.ts:409-410` 註解、`tests/contract/skill-format.test.ts:770` 與 `tests/integration/skill-generation.test.ts:78`、`:84-85` 的測試註解、REQ-TESTS-029（`agent-integration/us-431.md:31-34`）的「contract test」措辭。
- 同一工作樹中另有 `unify-review-lenses`（#369）在進行中，與本 change 無關。

## Knowledge Update

- 無：本 change 只改 Feature Spec 文字，module README 沒有描述受影響的宣稱（`prospec/ai-knowledge/` 中沒有 `hasReferences` 或 referenceMap 命中）；archive 的 knowledge sync 閘門已通過。
