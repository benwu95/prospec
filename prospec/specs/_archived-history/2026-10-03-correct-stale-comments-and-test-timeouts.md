# correct-stale-comments-and-test-timeouts — Archive Summary

- **Archived**: 2026-10-03
- **Original Created**: 2026-10-03T11:39:45.696Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/327

## User Story

As a 閱讀 prospec 原始碼的維護者,
I want 每一句註解只陳述它所在元件可由程式驗證的事實,
So that 已在信任區修正過的錯誤說法不會再從註解長回來。

另兩則：memfs 測試不啟動真實子程序（US-2）；在執行期產生子程序的測試檔都宣告 file-level `testTimeout`（US-3，PB-010）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Low | `git-read.ts`、`spec-headings.ts`、`knowledge-reader.ts` 只改註解，刪除被程式推翻的宣稱 |
| tests | Medium | 新增 `tests/helpers/no-child-process.ts`（`withoutSpawns`）與其單元測試；7 個 memfs suite 改用它；7 個檔補 file-level timeout；tests README 同步 |

## Requirements

quick scale，無 delta-spec。Spec impact 判定：diff 只改註解、測試 helper 與測試設定，未改變任何 Feature Spec REQ 涵蓋的執行期行為，略過 graduation。

延後：`prospec/specs/features/drift-detection/us-15.md:16`（REQ-LIB-041 本文）重述了本 change 在 `spec-headings.ts` 修正的兩個宣稱，屬 #318 Feature Spec 分批稽核範圍。

## Completion

- **Tasks**: 11/11 (100%), 3/3 [M]/[V] (not counted)
- **Acceptance Criteria**: 11/11
- **盤點**：執行期攔截 `node:child_process` 跑全套件，58 個檔產生子程序、13 個缺 timeout；收尾後 51 個產生子程序的檔全數宣告 timeout，7 個 memfs 檔子程序數為 0。

## Review & Verify

- **Review**: 3 round(s)，0 critical / 2 major（皆已修）— R1-1 tests README 的 timeout 取值判準被實測推翻（改為只寫可觀察事實）、R1-2 `archive-dry-run` 取值與凍結情境 US-3.2 不符（改 90_000）；3 個 minor（hoisting pitfall 措辭、helper 測試缺 `exec` 斷言、T10 敘述）亦已修；round 3 review-clean，graded_by fresh-subagent
- **Verify**: Grade S — task-completion／knowledge／tests 機器維度 PASS，constitution PASS（8/8 規則，fresh-subagent），delta-spec-compliance 與 design not-applicable；`pnpm test` exit 0（269 檔，6977 passed／4 skipped）
- **Quality Log**: prospec-tasks WARN（task verifier 7 條建議，已採納 5 條）；prospec-review round 1 WARN（R1-1、R1-2 major，使用者選全修）；其餘 PASS
