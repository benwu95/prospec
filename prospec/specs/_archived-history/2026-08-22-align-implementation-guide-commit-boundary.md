# align-implementation-guide-commit-boundary — Archive Summary

- **Archived**: 2026-08-22
- **Original Created**: 2026-08-22
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/207

## User Story

作為一位遵循 `prospec-implement` 站點作業的實作者（含被自動路由的弱模型），
我要 `implementation-guide` reference 的 §5 Commit Strategy 段與 implement 站 SKILL 的
「implement 期間不提交、提交邊界在 verify S/A 之後」邊界一致，
以便模型不會照著段內的 `git commit` worked example 在 implement 期間逐組提交，
破壞 atomic-by-feature 與 PB-016 的 provenance 順序（內容定案 → commit → record → archive）。

## Affected Modules

（`scale: quick` 無 delta-spec，模組由實際 diff 檔案路徑經 module-map.yaml 推導）

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | 改寫 `implementation-guide.hbs` §5 Commit Strategy：延後提交邊界、移除 in-implement commit 範例、引用目標專案 Constitution 提交規則 |
| tests | Low | `skill-format.test.ts` 於 `Commit boundary after verify(S/A)` 區塊新增 §5 延後提交契約測試（section-scoped、mutation-verified） |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 重新生成（生成檔，非手寫邏輯） |

## Requirements

`scale: quick` 無 delta-spec REQ。**Spec-impact 診斷（archive Entry Gate 判定）**：本 diff 比對既有
`prospec/specs/features/` REQ 後判定為**無 spec impact**——commit boundary 行為已由 REQ-TEMPLATES-068
（Unified Commit Boundary）與 REQ-TEMPLATES-140／US-26（no checkpoint-commit concession）規範，
契約覆蓋已由 REQ-TESTS-023（「the contract verifies … implement's deferred commit」）陳述。
本變更修正一個違反既有 REQ 的文件面（latent doc bug）並在既有契約範圍內補強斷言，
未新增或修改任何 REQ 的行為，故不進行 graduation。

## Completion

- **Tasks**: 2/2 code tasks (100%)；5 個 [M]/[V] 任務全部完成
- **Acceptance Criteria**: 5/5（一致性、下游適配、三面同步、回歸守衛＋mutation-verify、閘門全綠）

## Review & Verify

- **Review**: 1 round，0 critical / 0 未解 major（獨立 fresh-context reviewer 提出的 1 個 test-quality major `R1-slice-scope` 經 verifier 以 repro 反駁為 not-found）— review-clean
- **Verify**: Grade S；machine ledger 1/5 · 4/5 · 5/5 PASS，judgment ledger 2/5 not-applicable（quick）· 3/5 PASS（8/8 rules，mixed）· 6 not-applicable；test suite exit 0（4102 passed / 4 skipped）
- **Quality Log**: 無 WARN/FAIL

## Knowledge Update

已於 verify S/A commit prompt 同步：templates／tests／lib 三模組 README 經確認反映最終碼，`prospec knowledge verify` 已 stamp `last_verified`；factual test counts 已由 `pnpm counts` 同步（4105→4106）。
