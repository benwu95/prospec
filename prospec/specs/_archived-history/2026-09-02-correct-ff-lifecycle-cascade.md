# correct-ff-lifecycle-cascade — Archive Summary

- **Archived**: 2026-09-02
- **Original Created**: 2026-09-02
- **Quality Grade**: S
- **Issue**: #253

## User Story

### US-1: 修正 lifecycle 對 ff cascade 的描述 [P1]

As a 依循 SDD workflow 的開發者（讀 `_status-lifecycle.md` 判斷路由），
I want lifecycle 文件對 `prospec-ff` 的描述與 ff Skill 的 cascading mode 一致，
So that 我不會因為那句過時的「planning-only, stops at tasks」而誤判自己在 ff 之後無權續行 implement → review → verify。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Low | 更正出貨模板 `src/templates/init/status-lifecycle.md.hbs` 的 `prospec-ff` bullet |
| tests | Low | 新增 `tests/contract/skill-format.test.ts` 雙副本回歸 pin |
| ai-knowledge (dogfood) | Low | 同步 `prospec/ai-knowledge/_status-lifecycle.md` 鏡像 |

## Requirements

無 delta-spec REQ（`scale: quick`）。Entry Gate 的 quick spec-impact 判斷：本變更僅更正 lifecycle 文件使其符合**既有**的 `prospec-ff` cascading 行為（Phase 5 早已出貨），未新增/修改/移除任何 spec-covered 需求 → 無 spec impact，跳過 Phase 3.5 graduation。

## Completion

- **Tasks**: 3/3 code (100%)；[M] 1/1、[V] 1/1
- **Acceptance Criteria**: 3/3（US-1 三個 WHEN/THEN scenario）

## Review & Verify

- **Review**: 1 round（fresh-subagent），0 critical / 0 major — review-clean（lens：correctness、security、spec-architecture、docs-claims、parallel-site、test-quality）
- **Verify**: Grade S；machine 1/5 task-completion·4/5 knowledge·5/5 tests 皆 PASS，judgment 3/5 constitution PASS（fresh-subagent），2/5 delta-spec-compliance·6 design = not-applicable；test suite `pnpm test` exit 0（4668 passed / 4 skipped）
- **Quality Log**: 無 WARN/FAIL

## Knowledge Update

- `templates`、`tests` 的 `last_verified` 已 stamp（折進 feature commit）；兩模組 README 描述無需異動（模板數與測試套件結構未變，+1 test 的事實計數已由 `pnpm counts` 同步）
- 雙副本 `_status-lifecycle.md`（dogfood）與 `status-lifecycle.md.hbs`（出貨模板）逐字一致
