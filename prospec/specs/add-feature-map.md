# add-feature-map — Archive Summary

- **Archived**: 2026-06-19
- **Original Created**: 2026-06-19
- **Quality Grade**: S

## User Story

- **US-1**：feature→module 索引（`feature-map.yaml` 物件 + archive 單一 writer，bootstrap-once + no-clobber、modules 由 module-prefix REQ 自種、req_prefixes 不自動補）
- **US-2**：兩條決定性 drift（`dangling-prefix` warn + `feature-modules` self-validating fail，僅 `feature-map.yaml` 存在時執行）
- **US-3**：啟用 backfill Phase 4 決定性覆蓋掃描（REQ-TEMPLATES-107 既有條件式）+ `prospec-archive` skill feature-map 再生指引

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Modified | feature-map.yaml Schema（feature→module 索引） |
| templates | Modified | feature-map.yaml.hbs 知識模板（單一格式權威） |
| services | Modified | archive 唯一 writer `syncFeatureMap`（bootstrap-once + no-clobber） |
| lib | Modified | dangling-prefix drift（REQ-prefix 合法性 lint，warn-class） |
| tests | Modified | feature-map drift collector/evaluator 測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TYPES-031 | ADDED | feature-map.yaml Schema（feature→module 索引） |
| REQ-TEMPLATES-113 | ADDED | feature-map.yaml.hbs 知識模板（單一格式權威） |
| REQ-SERVICES-029 | ADDED | archive 唯一 writer `syncFeatureMap`（bootstrap-once + no-clobber） |
| REQ-TEMPLATES-114 | ADDED | prospec-archive skill feature-map 再生指引 |
| REQ-LIB-018 | ADDED | dangling-prefix drift（REQ-prefix 合法性 lint，warn-class） |
| REQ-LIB-019 | ADDED | feature-modules self-validating drift（驗 modules 邊，fail-class） |
| REQ-TESTS-031 | ADDED | feature-map drift collector/evaluator 測試 |
| REQ-TESTS-032 | ADDED | feature-map schema/format/archive writer 測試 |
| REQ-TYPES-027 | MODIFIED | Drift Report Schema（擴充兩個 check id） |

## Completion

- **Tasks**: 16/16 (100%), 1/2 [M]/[V] (not counted)
