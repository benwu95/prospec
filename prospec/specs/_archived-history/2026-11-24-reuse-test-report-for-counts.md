# reuse-test-report-for-counts — Archive Summary

- **Archived**: 2026-11-24
- **Original Created**: 2026-11-24T03:17:53.687Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/463
- **Plan Decision**: plan (graded_by: human)

## User Story

As a prospec contributor running the local change flow,
I want `pnpm counts` and `pnpm run counts:check` to reuse the report my last full test run wrote when that report still matches the repository content,
So that a change no longer pays for two extra full suite runs just to count tests.

（US-2：無可用報告時，counts 的後備執行排進 repository 測試佇列。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Medium | 新增 counts 報告來源、stamped reporter、本機選路與接線的 unit 測試；README 的 counts 列改寫 |
| cli | Low | `exclusive-output.ts` 抽出 `exclusiveRunCause`／`exclusiveFailureLine` 供 counts 共用（stamp-only） |
| `scripts/`（無模組） | Medium | `report-source.ts`、`stamped-json-reporter.ts`、`local-source.ts` 新增；`sync-counts.ts` 改預設來源 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TESTS-150 | ADDED | 本機 counts 重用帶工作樹戳記的報告，否則經測試佇列執行；忙碌或中斷時以對應 exit code 結束且不改寫文件 |
| REQ-TESTS-070 | MODIFIED | `--from` 行為不變；無 `--from` 時改依 REQ-TESTS-150（Dropped：原「自己執行測試」bullet） |

## Completion

- **Tasks**: 14/14 (100%), 4/4 [M]/[V] (not counted)
- **Acceptance Criteria**: 8/8（US-1.2、US-1.5 有已揭露並經 plan 簽核的範圍縮小，見 verify.md）
- **Commit**: c28b0472 `feat(scripts): reuse the stamped test report for local counts`

## Review & Verify

- **Review**: 5 輪＋break-glass 後 1 輪窄範圍確認，共 9 項：1 critical（R1-1 報告形狀未驗證即取值，已修並以 pin 與 mutation 驗證）／5 major（R1-2 結果判讀未共用 formatter、R1-3 接線無測試、R2-1 reporter 只以空輸入斷言、R4-1 中斷後仍改寫文件並 exit 0 等，皆已修）／其餘 minor（過時敘述、例外未接住、註解），全部 fixed
- **Verify**: Grade A — 1/5、4/5、5/5 PASS（machine）；2/5 WARN（US-1.2、US-1.5 範圍縮小，已於 REQ-TESTS-150 揭露）、3/5 WARN（proposal 情境以英文凍結，開發者決定）、design not-applicable（fresh-subagent）；完整測試 367 檔、9,916 passed + 4 skipped，exit 0
- **Quality Log**: plan verifier r1 FLAWS（未追蹤檔不在 digest、CLI 選項縮小執行被視為完整、未命名 readTestCounts owner）→ r2～r4 WARN；tasks verifier WARN；review 第 5 輪觸發 fix_induced_threshold_exceeded，開發者 break-glass 後窄範圍確認 0 項；new-story WARN（Language Policy，開發者決定維持）

## Knowledge Update

- `prospec/ai-knowledge/modules/tests/README.md`（已更新並蓋章）
- `prospec/ai-knowledge/modules/cli/README.md`（stamp-only）

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 1. Overrides: 1. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:5 | prospec-review | 熔斷由 minor 註解措辭觸發，critical 自第 1 輪後為 0、設計未被推翻（開發者 2026-11-24 選擇 break-glass 修 R5-1，跑一輪窄範圍確認） | consumed by prospec-review:ef0de51ddeead1ebf85f1c12667afa6f4767b9a6daf3d7cd382e2650146409a1 |
<!-- prospec:escalation-history-end -->
