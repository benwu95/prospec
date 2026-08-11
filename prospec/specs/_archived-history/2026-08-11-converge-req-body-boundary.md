# converge-req-body-boundary — Archive Summary

- **Archived**: 2026-08-11
- **Original Created**: 2026-08-11
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/150

## User Story

**US-1**：身為開發者，我希望將 REQ 內容的邊界邏輯收斂到單一擁有者（`indexSpec`），以便文件封存過程具備確定性、被移除的項目能被正確回報，並確保信任區保持純淨，不會有重複的舊文本。

**US-2**：身為系統，我希望合約測試的語料庫能被提交到版本庫中並且無條件執行，以便未來任何 REQ 邊界邏輯的回歸問題都能阻擋 CI 通過。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `spec-headings.ts` 的 `indexSpec` 成為 REQ body 邊界的唯一擁有者；邊界述詞改以 active REQ 標題為準，比 REQ 更深的刪除線標題視為 body 文本 |
| services | High | `archive.service.ts` 的 `mergeRequirementInPlace` 改向 `indexSpec` 取用 `start`/`end`，移除自有的行內邊界迴圈 |
| tests | High | 合約語料庫改讀已提交的 `tests/fixtures/spec-sync-corpus/`、移除 `skipIf` 防護；新增 4 條經 mutation 驗證的邊界行為測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-072 | MODIFIED | Non-destructive Feature-Spec REQ merge — 替換區段的邊界改由 `indexSpec` 定義 |
| REQ-TESTS-085 | ADDED | Execute Spec-Sync Corpus on CI — 語料庫入版控且無條件執行 |

## Completion

- **Tasks**: 8/8 code tasks (100%)，另有 3 個 `[V]` 驗證任務亦已完成
- **Acceptance Criteria**: 5/5（US-1 三項、US-2 兩項）

## Review & Verify

- **Review**: 4 round(s)，6 critical / 12 major。第三輪以平行多鏡頭（correctness／spec-architecture／test-quality）加對抗式 verifier 找出 5 個 critical：F-18（`**Spec:**` 落地區塊丟掉信任區既有的 8 條 authored bullet，fail-closed guard 導致封存寫入 0 檔）、F-4（`indexSpec` 邊界在更深的刪除線標題處提早截斷，與 delta-spec 條款矛盾並使 loss guard 失效）、F-5（ADDED 的 REQ 編號與既有 `REQ-TESTS-001` 撞號）、F-8（`counts:check` 14 筆不同步）、F-9（`lint` 孤兒 import）。第四輪全數修復。未解決的 7 個 major 為 advisory，其中 F-3（寫入路徑目標選取含 struck）與 verify 2/5 的 WARN 同源。
- **Verify**: Grade A。Machine ledger 1/5 `task-completion` PASS、4/5 `knowledge-health` PASS、5/5 `test-provenance` PASS；Judgment ledger 2/5 WARN（fresh context）、3/5 PASS（8/8 條 Constitution 規則）、6 not-applicable。測試套件 `pnpm test` exit 0：150 檔 / 3771 passed / 4 skipped；覆蓋率 Statements 94.47%、Branches 89.54%、Functions 95.09%、Lines 95.02%。
- **Quality Log**: review 四輪皆 WARN（分別攜帶 1、0、5、4 個 critical 與 1、0、12、3 個 major）；verify 第一輪 FAIL/grade C（Language Policy 違規）、第二輪 PASS/grade S、第三輪 PASS/grade A（2/5 WARN：`**Spec:**` 仍寫成以 `matchReqHeading` 識別合併目標，實際為 `indexSpec(content, { includeStruck: true })`）。

## Knowledge Update

本變更的知識同步已折入 verify S/A 的 feature commit：

- `prospec/ai-knowledge/modules/lib/spec-reading.md` — 移除「boundary 有 TWO owners」的過時宣稱，改述單一擁有者與現行邊界規則
- `prospec/ai-knowledge/modules/services/spec-sync.md` — 補記替換區段的 extent 不再由該 writer 決定，改向 `indexSpec` 取用
- `prospec/ai-knowledge/modules/tests/README.md` — 測試計數由 `pnpm counts` 同步
