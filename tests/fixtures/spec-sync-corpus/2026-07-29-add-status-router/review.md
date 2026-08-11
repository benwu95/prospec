# Review: add-status-router

**Rounds:** 2 / cap 3   **Status:** review-clean

獨立 fresh-context 審查者（mode B 多鏡頭單審：correctness／security／spec-architecture 必跑＋docs-claims／parallel-site／test-quality 條件鏡頭）審查整個 working-tree diff（14 修改＋8 新檔；生成物排除）。結果 0 critical、4 major；major 依約不擋站，但四項皆有具體修法，於同輪由實作者解決——3 項 drop-in 修復、1 項（F4）經人工裁決後文件化。修復後全套件 2469 passed、lint/typecheck 乾淨。

| Location | Severity | Lens | Status |
|----------|----------|------|--------|
| src/services/status.service.ts:108 (parseUiScope) | major | correctness & edge cases | fixed — regex 行尾錨定（`/^\*\*Scope:\*\*\s*(full\|partial\|none)\s*$/im`），proposal-format 佔位行 `**Scope:** full \| partial \| none` 不再誤判為 `full`；新增 service 測試釘住 |
| src/types/status.ts:58 (hasPlan) | major | parallel-site / maintainability | fixed — 移除無消費者的死契約欄位（types＋collectFacts＋test fixture 全域 sweep，grep 0 殘留） |
| tests/contract/skill-format.test.ts:2288 | major | test-quality (PB-001) | fixed — dual-copy sync 測試補「Executable copy」marker（REQ-TEMPLATES-158 AC3），mutation-verify：刪任一份指向行→紅 |
| src/lib/status-router.ts:49-79 (quick × ui_scope) | major | spec-architecture (PB-002) | resolved by ruling — 人工裁決「quick 不由 router 引動 design」；兩份 lifecycle 文件補記（含手動 /prospec-design 出口）、sync marker 釘住、router matrix fixture 釘住（story/tasks × quick × ui_scope full 不建議 design） |

## Round 1 摘要

- 審查者確認：無依賴方向違規（cli → services → lib → types 全鏈乾淨）、無 delta-spec REQ 矛盾、無 `_status-lifecycle.md` 規則矛盾（逐站 false-block/false-pass 稽核通過）、terminal sanitization 走 canonical `sanitizeTerminal`、掃描容錯符合宣稱（malformed metadata 逐 change 回報不中斷）
- docs-claims 鏡頭：README 兩語、entry.md.hbs Session Start、兩份 lifecycle「Executable copy」宣稱皆 claim ⊆ implementation
- 無 critical → 無 auto-fix／verifier 輪；major 修復皆屬 concrete/local/drop-in，修復後 `pnpm test` 保持綠

## Round 2（narrow pass）

verify 站 `knowledge-size` WARN（`_status-lifecycle.md` 2039 > 2000 tokens，本變更新增語句所致）→ 壓縮本變更新增的兩句措辭（兩份副本同步、contract markers 保留、無邏輯變更），`knowledge-size` 轉 PASS。narrow re-review：diff 僅限該兩句 doc 措辭，0 critical、0 major；`pnpm test` 全綠後重蓋 test/review baseline。
