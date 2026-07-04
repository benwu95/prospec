# harden-feature-prefixed-req-sync — Archive Summary

- **Archived**: 2026-06-20
- **Original Created**: 2026-06-20
- **Quality Grade**: A

## User Story

四個獨立修正硬化 feature-prefixed REQ 的 knowledge-sync（BL-043，發現於 BL-042 archive）：
- US-1：feature-prefix REQ（prefix ∈ feature-map req_prefixes）永不 mint phantom `modules/<prefix>/`
- US-2：standard/full 改由 `related_modules`/feature-map 推導受影響模組（Entry Gate 與 service auto-update 一致）
- US-3：修正並保護 `feature-map.yaml` 的 feature→module 完整性（no-clobber）
- US-4：drift 新增 README 事實計數真實性檢查

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | knowledge-update feature-prefix-aware resolution + mint 守衛；archive 轉發 related_modules；check.service 注入 readme-counts collector |
| lib | Medium | drift-sources `collectReadmeCounts`；drift-checker `evaluateReadmeCounts` + runChecks 8 checks；knowledge-reader loadFeatureMap 過濾 unsafe module 名 |
| types | Low | drift-report `DRIFT_CHECK_IDS` append `readme-counts`（8 ids） |
| templates | Medium | prospec-archive Entry Gate + Phase 4 standard/full feature-prefix fallback |
| tests | High | mint 守衛 / 推導 / count check / feature-map 完整性 + no-clobber / 端到端 wiring |

## Requirements

| REQ ID | Status | Feature | Description |
|--------|--------|---------|-------------|
| REQ-SERVICES-032 | ADDED | ai-knowledge | feature-prefix-aware resolution + mint guard |
| REQ-SERVICES-033 | ADDED | sdd-workflow | archive 轉發 related_modules 入 auto knowledge-update |
| REQ-TEMPLATES-120 | ADDED | sdd-workflow | Entry Gate standard/full feature-prefix fallback |
| REQ-TESTS-035 | ADDED | sdd-workflow | 端到端 wiring + feature-map 不變量測試 |
| REQ-TYPES-034 | ADDED | drift-detection | readme-counts check id |
| REQ-LIB-020 | ADDED | drift-detection | readme-counts collector + evaluator |
| REQ-SERVICES-034 | ADDED | drift-detection | check.service 注入 readme-counts collector |

## Completion

- **Tasks**: 16/16 code (100%) + T9 `[M]` + T17 `[V]`
- **Acceptance Criteria**: 5+1 verify 維度全 PASS（Grade A）
- **Tests**: 1717 passed；`prospec check` 0 fail / 0 warn / 0 skipped
- **Review**: 0 critical；4 majors fixed in-round；3 advisory majors（quality_log，非阻塞）

## Review & Verify

- **Review**: 0 critical；4 majors in-round fixed；3 advisory majors（非阻塞，移交 quality_log）——同源於「安全/格式邏輯複製於平行站點、缺單一真相」（ledger refactor/duplicated-helper-parallel-sites，PB-006）
- **Verify**: Grade A；5+1 維度全 PASS；1717 passed、`prospec check` 0 fail / 0 warn / 0 skipped
- **Quality Log**: 3 advisory majors（`readContainedFile`↔`readTextIfExists` 去重、`existsContained` 抽共用 predicate、`README_COUNT` 詞彙 single-source）
- **Source**: summary 內文 + _lessons-ledger

## Knowledge Update

Synced at archive Entry Gate（committed in archive commit）:
- `prospec/ai-knowledge/modules/{services,lib,types,templates,tests}/README.md`
- `prospec/ai-knowledge/_index.md`

## Notes

3 個 advisory review majors 留作非阻塞 follow-up（見 review.md / quality_log）：`readContainedFile`↔`readTextIfExists` 去重、`existsContained` 抽共用 predicate、`README_COUNT` 詞彙 single-source。
