# fix-disclosed-cleanups — Archive Summary

- **Archived**: 2026-08-28
- **Original Created**: 2026-08-28
- **Quality Grade**: S
- **Issue**: #219

## User Story

作為 prospec maintainer，承接 PR #218（`Closes #205`）「誠實揭露」段落列出的三個未修程式碼衛生缺口：(US-1) 讓 `ReviewCircuitBreaker.checkCircuitBreaker()` 成為無副作用查詢；(US-2) 讓 `prospec learn yield` 表格顯示 invocation source，使 rows-proxy 的 keep 與健康 declared 的 keep 可辨；(US-3) 讓 `1..5` max-rounds 上限只有單一權威來源，並以契約測試綁定，避免 parser／schema／skill 模板悄悄漂移。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | High | `review-circuit-breaker`：`checkCircuitBreaker` 改純查詢，移除 `spend` option 與 fix-induced ratio 的 getter/setter/欄位（純衍生值） |
| types | Medium | `cascade`：新增 `REVIEW_ROUNDS_MIN`／`REVIEW_ROUNDS_MAX` 單一來源常數，schema 引用 |
| cli | Medium | `formatters/learn-output` 新增 Source 欄；`commands/review-merge` parser 與 help 皆引用常數 |
| tests | Medium | 新增 max-rounds 三方一致契約測試、CQS 無副作用測試；修正 spend 測試與 lens-yield 表格測試 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CLI-044 | MODIFIED | `prospec learn yield` 表格加印每個 lens 的 invocation source（declared vs rows），`--json` 契約不變 |

## Completion

- **Tasks**: 8/8 code tasks（100%）；[M] 1、[V] 2 皆完成
- **Acceptance Criteria**: US-1/2/3 各 AC 均達成（見 verify 2/5 PASS）

## Review & Verify

- **Review**: 2 round(s)、0 critical / 2 major（皆修復）— R1-major-1（prospec-review.hbs 第二處 max-rounds 上限未受契約守衛）、R1-major-2（lens-yield 測試逐列斷言恆真）；獨立 fresh-context reviewer，兩者修復皆 mutation-verified
- **Verify**: Grade S — 1/5 PASS · 2/5 PASS(fresh) · 3/5 PASS(8/8 rules) · 4/5 PASS · 5/5 PASS · 6 n/a；`pnpm test` exit 0（4328 tests）
- **Quality Log**: new-story PASS；plan WARN（架構驗證 FLAWS→已於 plan/proposal 修正：spend 語意、測試認列、help 插值）；tasks WARN（degraded 單一上下文，已揭露）；review R1 WARN(2 major)→R2 PASS；verify S

## Knowledge Update

已同步並確認：`lib`、`cli`、`types`、`tests` 模組 README 反映最終狀態（本變更為內部重構＋一欄新增，README 描述層無需改動，freshness 已 stamp）。
