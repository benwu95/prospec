# fix-abandon-guidance — Archive Summary

- **Archived**: 2026-10-09
- **Original Created**: 2026-10-09T14:00:07.949Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/363

- **Plan Decision**: option-a (graded_by: human)

## User Story

開發者可在同日以相同名稱多次 abandon，各次歷史與 retry linkage 均保留；完成後看見保存數、工作樹未還原狀態，並自行決定是否授權還原。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Low | result 新增 manifest entry count |
| lib | Medium | 安全目的地依序使用 base、-2、-3，保持原有拒收邊界 |
| services | Low | 回傳保存時捕捉的 manifest entries 數 |
| cli | Medium | human／JSON 保存數及未還原指引，quiet 保持靜默 |
| templates | Medium | 八個 shared-partial consumers、metadata、lifecycle 與公開文件同步 |
| tests | Medium | allocator、real-Git service／CLI、section-scoped mutation contracts |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-TYPES-112 | MODIFIED | captured manifest entry count，不含 gitlink pins |
| REQ-SERVICES-128 | MODIFIED | 同日同名首個安全可用目的地，保留 incomplete／競態拒收 |
| REQ-CLI-061 | MODIFIED | count、未還原聲明與通用還原決策指引 |
| REQ-TEMPLATES-246 | MODIFIED | 還原由人決定且需授權，文件同步 collision suffix |
| REQ-TESTS-132 | MODIFIED | 重複 abandon、history／retry、count 與指引 regression |

## Completion

- **Tasks**: 10/10 code tasks（100%）；2/2 verification tasks 完成。
- **Acceptance Criteria**: 6/6 frozen scenarios，0 deviations。
- 同一 baseline 腳本三次 abandon：原版本 1/3 成功，方案 A 3/3 成功，先前保存資料不變。

## Review & Verify

- **Review**: 2 rounds，0 critical／0 major／0 minor；七個 lenses 完整審查累積 diff，所有 delegation receipts 的 facets 相符。
- **Verify**: 最終 Grade S；machine tasks／Knowledge／tests PASS，fresh-context spec compliance 5/5 REQ、Constitution 8/8 PASS，design not-applicable。完整測試 296/296 files，7,564 passed、4 skipped（7,568 total）；獨立最終 grader snapshot 66/66 tests。
- **Quality Log**: plan 首輪 WARN 漏列兩個 reference consumers，補齊八個 consumers 後 PASS；tasks 首輪 FAIL 將 archive 編為 manual，修正 kind／handoff 後 PASS；Verify 首輪 C 因 metadata reference 缺保存／還原邊界，補上 section-scoped RED/GREEN 與六個 mutations，重新 review／tests／verify 後 S。
- **Validation**: lint、typecheck、build、coverage、counts:check、agents:check PASS。Statements coverage 14,647/15,183（96.46%）；所有 token ceilings 維持原值。原八個 consumers 的 64 個 mutations 與 metadata 的六個 mutations 均被拒收。
- **Limitations**: 本機驗證為 Node 24.20.0／Vitest 4.0.18／pnpm 11.3.0、macOS arm64；既有 knowledge-size WARN 保留。Verify 當時 knowledge:check 為 pre-commit SKIP；feature commit f2872687 後已實際確認 6/6 source-touched modules。

## Knowledge Update

六模組 README、counts、bundle 與 150 個生成產物在最終 review／tests／verify 前同步。types／services／cli／templates／tests 各反映一項修改 REQ；lib 反映目的地配置實作，沿用既有 preservation 與 retry 契約。
