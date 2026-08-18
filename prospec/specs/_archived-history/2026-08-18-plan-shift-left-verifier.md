# plan-shift-left-verifier — Archive Summary

- **Archived**: 2026-08-18
- **Original Created**: 2026-08-18T16:04:12.721Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/179

## User Story

### US-1: 獨立架構驗證者與通用正交規約 [P1]
作為使用 Prospec 的開發者，
我希望在 `/prospec-plan` 產出 `plan.md` 與 `delta-spec.md` 後由獨立架構驗證者進行正交維度審查，
以便在實作前及早攔截架構分層違規、波及效應遺漏、狀態安全隱患與規格缺漏。

### US-2: 快取保護、環境降級與手動覆蓋機制 [P1]
作為在不同 AI 環境工作的開發者，
我希望架構驗證者具備快取保護、環境自動降級與人工裁決覆蓋機制，
以便在維持高效 Prompt 快取的同時，適應不同 Harness 支援度並避免誤報阻斷。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新增 plan-verifier-rubric.hbs，更新 prospec-plan.hbs 與 prospec-ff.hbs 整合獨立架構驗證與降級路徑 |
| services | Medium | 在 agent-sync.service.ts 註冊 plan-verifier-rubric.hbs 至 prospec-plan 與 prospec-ff |
| lib | Low | 重新編譯 bundled-templates.ts 內嵌範本 |
| tests | Medium | 在 skill-format.test.ts 建立專屬契約測試群組，鎖定快取隔離與預算不變量 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-182 | ADDED | Plan Architecture Verifier Rubric Reference 範本定義四維度正交標準與動態專案解析 |
| REQ-TEMPLATES-183 | ADDED | Shift-Left Architecture Verifier 流程整合至 prospec-plan Phase 6 與 prospec-ff |
| REQ-AGNT-039 | ADDED | 在 agent-sync.service.ts 註冊 plan-verifier-rubric 參考文件 |
| REQ-TESTS-083 | ADDED | Architecture Verifier 契約測試（集合等值、Token 預算 $\le 2500$、Startup Loading 快取隔離） |
| REQ-TEMPLATES-059 | MODIFIED | Plan Call Chain 與正交架構審查規格升級 |

## Completion

- **Tasks**: 11/11 (100%)
- **Acceptance Criteria**: 5/5

## Review & Verify

- **Review**: 1 round(s), 0 critical / 2 major — F-1 (templates/README 計數同步) 與 F-2 (skill-format 集合等值契約測試強化) 皆已完成修復。
- **Verify**: Grade A, 1/5 Task Completion=PASS, 2/5 Delta Spec Compliance=PASS (fresh context), 3/5 Constitution Full Audit=PASS (8/8 rules), 4/5 Knowledge Health=WARN (5 pre-existing stale timestamp), 5/5 Test Provenance=PASS (3880/3880 passed, exit 0), 6 Design=not-applicable.
- **Quality Log**: 1 quality warning (WARN on pre-existing stale timestamps outside modified module scope).

## Knowledge Update

The following module documentation has been updated:
- `prospec/ai-knowledge/modules/templates/README.md`
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`
- `prospec/ai-knowledge/modules/tests/README.md`
- `prospec/ai-knowledge/module-map.yaml`
