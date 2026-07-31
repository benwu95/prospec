# include-tests-in-typecheck — Archive Summary

- **Archived**: 2026-07-06
- **Original Created**: 2026-07-06
- **Quality Grade**: S
- **Scale**: quick

## User Story

As a 仰賴 `pnpm typecheck` / CI 抓型別錯誤的開發者，
I want 型別檢查涵蓋 `tests/`（以及 `scripts/`），
So that 測試檔的型別破損由機器抓出，而不是只在對抗式 review 才被發現。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| tests | Medium | 修掉浮現的 54 個測試檔型別錯誤；新增 guard test；整套測試現已納入型別檢查 |
| _(root config)_ | — | `tsconfig.typecheck.json` ＋ `package.json` 的 `typecheck` script（非知識模組） |
| _(scripts)_ | — | `scripts/counts/rewrite.ts` 型別安全修正，邏輯不變（非知識模組） |

## Spec Impact (quick — diff-diagnosed)

**未觸及任何 product spec 涵蓋的行為** → 略過畢業（archive Entry Gate 的 quick spec-impact 檢查）。此 diff 是 prospec 自身的開發工具（typecheck 設定 ＋ npm script）、測試檔的型別調和，以及一處 counts 腳本的型別修正（行為相同）。`prospec/specs/features/` 沒有任何 REQ 管轄 `pnpm typecheck` 的範圍。

## Completion

- **Tasks**: 7/7 code（100%）；4 個 `[V]` 完成
- **Acceptance Criteria**: SC-001..004 達成

## Review & Verify

- **Review**: 1 輪、0 critical / 0 major（review-clean）。獨立的 fresh-context reviewer 確認 54 個委派修正皆為誠實的型別調和（每個 `!` 都用在有保證的索引上、mock 中性、union narrowing 是拋出而非吞掉），無任何被弱化的斷言；設定／建置／guard 皆已驗證；雙向 mutation-verified。
- **Verify**: Grade **S** —— 1/5 PASS、2/5 not-applicable（quick）、3/5 PASS、4/5 PASS、5/5 PASS（6 n/a）。typecheck 0、tests 2083、lint 乾淨、`prospec check` 11/11。
- **Quality Log**: 無 WARN/FAIL（僅資訊性：在 plan 階段發現 54 個潛伏的測試型別錯誤後，由 standard 改判為 quick）。

## Knowledge Update

`tests` 模組 README 已於 feature commit `2ae84d5` 同步（typecheck 覆蓋註記 ＋ 測試計數）；無 feature spec 畢業（無 product spec 影響）。
