# make-spec-collectors-slice-aware — Archive Summary

- **Archived**: 2026-08-13
- **Original Created**: 2026-08-13
- **Quality Grade**: A

## User Story

作為維護 prospec 自身 feature spec 的開發者，
我要 drift-check 的 `collectReqDefinitions` / `collectSpecCounters` / `collectFeatureMapGovernance` 三個 collector 能看見 `features/{feature}/` slice 裡的 REQ 定義與計數，
以便把超標 feature spec 拆成 slice（工具自己 knowledge-size 檢查的補救建議）時 `prospec check` 不會由綠翻紅、且與 `archive finalize` 的計數一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 三個 drift 收集器改走 `listFeatureSpecs` + `loadFeatureSpecContent` 組裝 main+slices，餵既有 `indexSpec`/`readSpecCounters`/`matchReqHeading` |
| tests | Low | 新增 slice-aware 收集器測試＋no-slice 回歸；`spec-heading-single-source` 契約 pattern 更新 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-042 | MODIFIED | spec-counters 收集器組裝 slice，計數 sum main+slices、名符其實對齊 archive finalize writer |
| REQ-LIB-053 | ADDED | reqDefinitions＋featureMapGovernance 組裝 slice，使 slice REQ 進定義索引與 feature-map／prefix 檢查 |
| REQ-TESTS-086 | ADDED | slice-aware 收集器測試＋no-slice 回歸＋mutation 契約 |

## Completion

- **Tasks**: 8/8 code (100%)；[M]×2、[V]×2 皆完成
- **Acceptance Criteria**: US-1 四個 WHEN/THEN 全數滿足（graduated 為 feature US-20）

## Review & Verify

- **Review**: 1 round，0 critical / 0 major — review-clean（2 nit 依契約 drop：slice REQ 的 finding 行號錨點、非 safe 名稱 spec 的等價性邊角）
- **Verify**: Grade A；machine 1/5 task-completion PASS · 4/5 knowledge WARN · 5/5 tests PASS，judgment 2/5 delta-spec-compliance PASS（fresh context）· 3/5 constitution PASS（8/8 原則）· 6 design not-applicable；test suite `pnpm test` exit 0
- **Quality Log**: verify 4/5 knowledge-health WARN（`cli` 模組既存 git 時間戳、源自 1.2.0 發版、與本變更無關）；其餘站別皆 PASS

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md`（已反映——README 述共用走訪 now traverses slice links seamlessly）
