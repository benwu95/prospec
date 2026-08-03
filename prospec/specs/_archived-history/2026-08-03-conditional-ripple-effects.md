# conditional-ripple-effects — Archive Summary

- **Archived**: 2026-08-03
- **Original Created**: 2026-08-03T14:49:59.421Z
- **Quality Grade**: S

## User Story

身為知識庫產生器，
我希望 `## Ripple Effects` 段落只有在模組有下游相依（`relationships.used_by.length` > 0）時才輸出，
以便節省 leaf 模組的 L2 README token 預算，並使其與現有慣例保持一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 將 Ripple Effects 區塊加上 `used_by.length` 判斷條件 |
| tests | High | 更新契約測試以反映條件式渲染行為 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-KNOW-004 | MODIFIED | 產出 README 時僅在有下游相依才包含 Ripple Effects |
| REQ-KNOW-010 | MODIFIED | 當模組無下游相依時，省略 Ripple Effects 區塊 |

## Completion

- **Tasks**: 4/4 (100%)
- **Acceptance Criteria**: 2/2

## Review & Verify

- **Review**: 1 round(s), 0 critical / 0 major — review-clean (本次審查未發現任何缺失)
- **Verify**: Grade S, 4/4 dimensions PASS (delta-spec-compliance not-applicable, design not-applicable); test-suite PASS
- **Quality Log**: 2 FAIL entries (Constitution FAIL 與 Tests FAIL 於早期驗證回合)

