# fix-index-category-grouping — Archive Summary

- **Archived**: 2026-08-09
- **Original Created**: 2026-08-09T14:23:00.544Z
- **Quality Grade**: A
- **Issue**: 155

## User Story

As a 系統維護者,
I want `buildIndexTable` 能根據模組的 `category` 屬性正確產出分組子表,
So that 恢復 US-340 帶來的主要價值主張，並消除 skill/測試與實際行為間的矛盾.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | High | Add category?: string[] to IndexRowModule |
| lib | High | Implement buildIndexTable category grouping |
| templates | High | Remove AI grouping instructions from handlebars |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-018 | MODIFIED | Knowledge Index 支援按 Category 分組渲染 |

## Completion

- **Tasks**: 7/7 (100%)
- **Acceptance Criteria**: 4/4

## Review & Verify

- **Review**: 1 round(s), 0 critical / 0 major — 本次審查未發現任何問題，所有變更皆符合預期。
- **Verify**: Grade A, 2/5 PASS (fresh context) · 3/5 PASS (7/7 rules, mixed) · 6 not-applicable; PASS
- **Quality Log**: 2/5 graded in-session — fresh context unavailable

## Knowledge Update

The following module documentation may need updating:
- `prospec/ai-knowledge/modules/types/README.md`
- `prospec/ai-knowledge/modules/lib/README.md`
- `prospec/ai-knowledge/modules/templates/README.md`
