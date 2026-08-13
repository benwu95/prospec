# clarify-commit-staled-provenance — Archive Summary

- **Archived**: 2026-08-13
- **Original Created**: 2026-08-13
- **Quality Grade**: A

## User Story

As a downstream prospec developer,
I want review/test-provenance 的 stale finding 在工作區已 clean 時,說清楚 staleness 來自 commit 位移、且點名對應的重錄指令,
So that 我不把「只需刷新 baseline」誤判為程式碼退化或程式 bug,並選對成本最低的修法。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `drift-sources`:抽 `digestScope()` 共用常數、新增 `computeWorkingTreeClean` tri-state、source 加 `working_tree_clean`、兩 collector 收訊號;`drift-checker`:兩 evaluator stale 分支依 clean 訊號切換訊息 |
| services | Medium | `check.service` 一次算出 `workingTreeClean` 並傳入兩個 provenance collector |
| tests | Medium | `computeWorkingTreeClean` 三態、兩 evaluator clean/dirty/unknown 訊息切分、collector threading、revert-red mutation pin |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-024 | MODIFIED | review/test-provenance stale finding 在 working tree clean 時給出 commit-induced remedy(re-record),否則維持 code-changed 訊息;新增共用 working-tree-clean 訊號 |
| REQ-TESTS-042 | MODIFIED | 補 clean/dirty/unknown 訊息切分(review+test)、`computeWorkingTreeClean` 三態與 revert-red mutation 覆蓋 |

## Completion

- **Tasks**: 11/11 code tasks (100%) — 1 `[M]` + 1 `[V]` reminder 皆已執行
- **Acceptance Criteria**: 4/4(US-1 的 4 條 WHEN/THEN 皆有測試對應)

## Review & Verify

- **Review**: 1 round, 0 critical / 1 major — F-1(efficiency, advisory):`computeChangeDigest` 與 `computeWorkingTreeClean` 每次 check 各跑一遍 whole-tree git diff + ls-files,屬刻意 byte-stability 取捨,未自動修
- **Verify**: Grade A — machine 1/5 task-completion PASS · 4/5 knowledge WARN(既有 README 時間戳漂移,非本變更)· 5/5 test-provenance PASS;judgment 2/5 delta-spec-compliance PASS(fresh context)· 3/5 constitution PASS(8/8)· 6 design not-applicable;`pnpm test` exit 0(3799 passed / 4 skipped)
- **Quality Log**: 1 WARN(F-1 advisory major,承載至 verify);無 FAIL

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md` — Public API 加入 `computeWorkingTreeClean`(已隨 feature commit 同步)
