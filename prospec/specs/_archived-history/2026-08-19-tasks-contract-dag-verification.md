# tasks-contract-dag-verification — Archive Summary

- **Archived**: 2026-08-19
- **Original Created**: 2026-08-19T07:17:27.408Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/181

## User Story

### US-1: 任務合約雙向覆蓋與 DAG 相依性左移驗證 (Shift-Left Task Verifier)
作為 Prospec SDD 開發者，
我希望在執行 `/prospec-tasks` 與 `/prospec-ff` 時，由獨立的 Task Verifier 審查生成的 `tasks.md`，
以便在進入實作階段前及早攔截合約遺漏、DAG 拓撲倒置、TDD 閉包不足與任務粒度問題。

### US-2: 通用下游架構適配與模型快取保護 (Universal Downstream & Cache Protection)
作為 Prospec 跨專案架構師，
我希望 Task Verifier 具備動態下游架構適配能力，且不在 Startup Loading 預載審查評分規準，
以便支援多樣下游架構分層，並最大化 LLM Prompt Prefix Cache 命中率。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新增 `tasks-verifier-rubric.hbs`、升級 `prospec-tasks.hbs`、`prospec-ff.hbs` 與 `tasks-format.hbs` |
| agnt (services) | Medium | 在 `agent-sync.service.ts` 註冊 `tasks-verifier-rubric` 映射 |
| tests | Medium | 在 `tests/contract/skill-format.test.ts` 新增契約測試鎖定評分標準、Token 預算與快取隔離 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-186 | ADDED | Task Architecture & Contract Verifier Rubric Reference |
| REQ-TEMPLATES-187 | ADDED | Shift-Left Task Contract & DAG Dependency Verifier in prospec-tasks and prospec-ff |
| REQ-TEMPLATES-188 | ADDED | tasks-format.hbs Bidirectional Contract & Verifier Self-Check Enhancement |
| REQ-AGNT-041 | ADDED | Register tasks-verifier-rubric Reference in Agent Sync |
| REQ-TESTS-091 | ADDED | Contract Tests for Task Verifier and Rubric |

## Completion

- **Tasks**: 9/9 (100%), 2/2 [M]/[V] (not counted)
- **Acceptance Criteria**: 10/10 met

## Review & Verify

- **Review**: 1 round(s), 0 critical / 0 major / 1 minor (F-1: REQ ID collision resolved to REQ-TESTS-091) — review-clean
- **Verify**: Grade A, task-completion=PASS · knowledge=WARN · tests=PASS · delta-spec-compliance=PASS · constitution=PASS · design=not-applicable; 155 test files passed (3,891/3,891 tests)
- **Quality Log**: skill: prospec-review (2026-08-19, PASS) · skill: prospec-verify (2026-08-19, result: PASS, Grade A, WARN: 2 pre-existing stale knowledge timestamps outside scope)

## Knowledge Update

The following module documentation was verified and synchronized:
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`
- `prospec/ai-knowledge/modules/tests/README.md`
- `prospec/ai-knowledge/module-map.yaml`
- `prospec/index.md`
