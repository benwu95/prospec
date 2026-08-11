# Tasks: fix-issue-106-drift-engine-blindspots

**Input**: Design documents from `.prospec/changes/fix-issue-106-drift-engine-blindspots/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: lib 層面修復

- [x] T1 [P] 修復 `src/lib/markdown-fences.ts`，放寬 list item 縮排限制 ~5 lines
- [x] T2 [P] 修復 `src/lib/drift-sources.ts`，移除 `collectTestProvenance` 的 digest 早退 ~5 lines
- [x] T3 [P] 修復 `src/lib/drift-checker.ts`，修改 `evaluateTestProvenance` 避免 digest-less 紅燈被抑制 ~5 lines
- [x] T4 [P] 修復 `src/lib/drift-sources.ts`，防止 `gitLastCommit` 的 capture 失敗被錯誤折疊 ~5 lines
- [x] T5 [P] 修復 `src/lib/drift-sources.ts`，補齊 `computeChangeDigest` 中針對 `head === null` 的防護/註解 ~5 lines

## Phase 2: tests 層面修復與驗證

- [x] T6 擴展 `tests/contract/skill-format.test.ts` 中針對預算標註 guard 的 Regex ~5 lines
- [x] T7 [V] 執行所有測試與 `prospec check`，確保修改未破壞既有行為，並正確捕捉錯誤 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 7 |
| Parallelizable | 5 |
| Estimated lines | ~30 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- Verify functionality after completing each Phase
- ~N lines are estimates; actual numbers may vary with requirements
