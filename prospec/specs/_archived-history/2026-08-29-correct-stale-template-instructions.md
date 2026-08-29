# correct-stale-template-instructions — Archive Summary

- **Archived**: 2026-08-29
- **Original Created**: 2026-08-29
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/226

## User Story

As a downstream AI agent（尤其弱模型）與 downstream project maintainer,
I want 出貨 skill 模板不再含與 cli-first 現況矛盾或洩漏本專案的指令,
So that 模板逐字落到下遊時不會誤導模型照做錯事，並維持單一來源。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | 6 個 `.hbs` 修正：implementation-guide 對齊 cli-first、tasks-format 中性層級、upgrade 去套件名短路、knowledge-update 引用 canonical、near-miss 兩處引用 CLI |
| tests | Medium | `skill-format.test.ts` 新增/擴充 project-agnostic 負向守衛；刪 topology allowlist |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 重生（stamp-only） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-188 | MODIFIED | tasks-format 層級範例中性化；sweep 無 allowlist |
| REQ-TEMPLATES-212 | ADDED | implementation-guide 對齊 cli-first（CLI 完成、無條件 TDD、project-test-runner） |
| REQ-TEMPLATES-213 | ADDED | 出貨模板 project-agnostic 與單一來源，以 contract 守衛釘死 |

## Completion

- **Tasks**: 15/15 code（100%）；另 2 `[M]` + 2 `[V]` 完成
- **Acceptance Criteria**: 6/6（AC-1～6）

## Review & Verify

- **Review**: 1 round，0 critical / 0 major（3 minor 全修：§2 斜線層級殘留、§4 `tasks.md` 措辭衝突、§7 `test_command` 鍵路徑），graded_by fresh-subagent
- **Verify**: Grade S，machine 1/5·4/5·5/5 PASS ＋ judgment 2/5·3/5（8/8）PASS（fresh-context）＋ 6 n/a；test suite 4368 passed / 4 skipped
- **Quality Log**: 無 WARN/FAIL（review PASS、verify S）

## Knowledge Update

templates/lib/tests 已 `knowledge verify` stamp；index.md、module-map.yaml、雙 root README 計數同步（4369→4372、contract 977→980）。
