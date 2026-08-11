# exclude-generated-from-staleness — Archive Summary

- **Archived**: 2026-08-02
- **Original Created**: 2026-08-02T12:38:30.906Z
- **Quality Grade**: A

## User Story

As a developer who reads `prospec check` 的 knowledge-health 判定,
I want 模組的 `last_src_commit` 只計入人寫的原始碼、排除建置產物,
So that stale WARN 一律對應「有真實原始碼變動但知識未同步」，每一則都有據實的處置方式。

（另含 US-2 生成檔清單與產生者單一來源、US-3 digest 涵蓋範圍不受影響。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | 新增 `generated-artifacts.ts` 註冊表；`gitLastCommit` 加 `excludes` 參數與失敗降級；`collectGitTimestamps` 只在 `last_src_commit` 傳入排除清單 |
| tests | Medium | 兩方向 staleness 測試、digest 邊界釘住、pathspec 失敗 fault injection、產生者同源契約測試 |
| —（`scripts/`，非 module） | Low | `bundle-templates.ts` 匯出 `OUTPUT_FILE`，輸出路徑改由常數推導 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-039 | ADDED | Generated-source-artifact registry |
| REQ-TESTS-071 | ADDED | Generated-artifact exclusion and digest-boundary coverage |
| REQ-LIB-015 | MODIFIED | Knowledge health check — 生成檔排除在 `last_src_commit` 之外，digest 涵蓋不變 |

## Completion

- **Tasks**: 11/11 code (100%)、5/5 `[M]`/`[V]`（不計入分母）
- **Acceptance Criteria**: SC-001~SC-005 全數達成（SC-001 以本 repo 真實歷史實測：只重生 `bundled-templates.ts` 的 commit `e4d7fab` 之後，lib 由 stale 轉 not stale）

## Review & Verify

- **Review**: 1 round，0 critical / 2 major —— F-1（`GENERATED_SOURCE_ARTIFACTS` 把本 repo 路徑寫死進會在每個使用者專案執行的引擎，未解／proposed，已改為在 REQ-LIB-039 明文揭露此範圍限制）、F-2（契約測試未釘住產生者實際寫入目標，已修並具名 mutation 驗證）
- **Verify**: Grade A —— 機器維 1/5 task-completion PASS、4/5 knowledge-health PASS、5/5 test-provenance PASS（`pnpm test` exit 0，3,013 passed / 4 skipped）；判斷維 2/5 delta-spec PASS、3/5 Constitution PASS（6/6 rules）、6 design not-applicable
- **Quality Log**: `prospec-review` WARN（F-1 未解＋reviewer 走降級路徑）、`prospec-verify` PASS 帶 1 WARN（2/5 與 6 在實作自身 context 內評分 —— subagent 可用但使用者裁決不走 fresh-context reviewer；S 因此不可達）

## Mutation 驗證（4 個，全部依預期轉紅）

1. 移除 `collectGitTimestamps` 的排除傳參 → 「只重生生成檔」測試轉紅（收到 `2026-06-12` 而非 `2026-06-10`）
2. 把生成檔加進 `computeChangeDigest` 的 denylist → digest 邊界測試轉紅（前後 digest 相同）
3. 移除 `gitLastCommit` 的未排除降級 → fault-injection 測試轉紅（`expected null to be truthy`）
4. 在 `scripts/bundle-templates.ts` 重打一次路徑字面值 → 同源契約測試的負面斷言轉紅

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/README.md` —— 已於 verify commit 前同步（新增註冊表、`進 digest／不進 staleness` 界線、Modification Guide 第 6 條）
- `prospec/ai-knowledge/modules/tests/README.md` —— 已列入新契約測試並更新計數
