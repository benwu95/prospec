# Tasks: converge-constitution-audit

> 層序 Templates → Tests（純 template + 契約測試，無 src）。TDD：契約斷言與模板編輯同步。kind schema 見 `references/tasks-format.md`。收斂對映見 plan.md「Constitution-Touch Convergence Map」。

## Templates

- [x] [P] `prospec-verify.hbs`：於 Key Difference / Verification 3/5 明載 verify 為**唯一** Constitution 全分級稽核、其餘站只做站點特定檢查（收斂權威句）；全審機制不動（REQ-TEMPLATES-133）~10 lines
- [x] [P] `prospec-new-story.hbs`：Phase 6 + Exit Gate 由「3+ relevant principles」→ 站點特定 INVEST；gate 措辭同步（REQ-CHNG-008 / REQ-TEMPLATES-065）~15 lines
- [x] [P] `prospec-plan.hbs`：Phase 6 + Exit Gate → 站點特定 dependency-direction/layering（保留 Call Chain layering 檢查）（REQ-CHNG-008 / REQ-TEMPLATES-065）~15 lines
- [x] [P] `prospec-tasks.hbs`：Phase 6（test-coverage）+ Exit Gate 確認為站點特定 TDD 範圍（REQ-CHNG-008 / REQ-TEMPLATES-065）~10 lines
- [x] `prospec-ff.hbs`：Phase 2/3 Constitution check → per-phase 站點特定；**移除「NEVER skip Constitution check at any phase」**；Exit Gate 收窄（REQ-TEMPLATES-133 / REQ-TEMPLATES-065）~20 lines
- [x] [P] `prospec-implement.hbs`：Phase 4「Constitution compliance」→ 站點特定 TDD/commit（不通用全掃）（REQ-CHNG-008）~8 lines
- [x] [P] `prospec-review.hbs` + `prospec-learn.hbs`：Exit Gate 收窄站點特定（review→dependency/layering、learn→promotion-approval），保留 quality_log 記錄（REQ-TEMPLATES-065）~18 lines
- [x] `prospec-archive.hbs`：移除 orphaned「prepare Constitution spot check」`[STABLE]` 載入（無 phase 消費）；Entry Gate 知識同步不動（REQ-TEMPLATES-133）~5 lines
- [x] [P] `prospec-design.hbs` / `prospec-backfill-spec.hbs` / `prospec-promote-backfill.hbs` / `prospec-knowledge-update.hbs`：移除載入後未消費的 Constitution `[STABLE]` 項（保留 Entry Gate constitution-exists 若有）（REQ-TEMPLATES-133）~12 lines
- [x] [M] `pnpm build` 後 `prospec agent sync` 重新部署 `.claude/skills/` + `.agents/skills/`（生成物）~5 lines

## Tests

- [x] `skill-format.test.ts`：正向斷言——verify 維持 full audit；new-story→INVEST、plan→dependency-direction、tasks→TDD 站點特定措辭存在（section-scoped）（REQ-TESTS-044）~40 lines
- [x] `skill-format.test.ts`：negative assertion——非 verify 站無「every principle / full audit / 3+ … principles」全審措辭、ff 無「NEVER skip Constitution check at any phase」、指定 skill 無 orphaned Constitution `[STABLE]` 載入（REQ-TESTS-044）~40 lines
- [x] [V] mutation-verify 收斂斷言（移除/還原任一目標措辭 → 對應斷言轉紅）（REQ-TESTS-044）~10 lines

## Summary

- **Total Tasks:** 13
- **Parallelizable Tasks:** 7
- **Total Estimated Lines:** ~208 lines
