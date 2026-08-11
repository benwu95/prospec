# Tasks: add-dependency-knowledge（BL-034）

> 純 Skill 變更（Architecture C）：層次收斂為 Templates → Tests → Deploy/Verify → Docs。
> 任務 kind 標記定義凍結於 `references/tasks-format.md`（Task Kind Markers）。

## Templates

- [x] T1 `plan-format.hbs`：Technical Summary（Brownfield + Greenfield）各加 optional「### External Library Usage (on-demand, informational)」子節，明示 untrusted、miss 留 informational 註記（REQ-TEMPLATES-044 MODIFIED / 101）~20 lines
- [x] T2 `prospec-plan.hbs` Phase 4：加 optional Context7 步驟——scope guard（觸及第三方 lib）+「if a Context7 MCP is available」+ resolve-library-id/query-docs（prose 短名）+ 注入 §External Library Usage + 明示 non-gating/silent-skip+informational（REQ-TEMPLATES-101 / 103）~18 lines
- [x] T3 [P] `prospec-implement.hbs` Phase 2/3：比照「For UI tasks」加「For tasks touching third-party libraries」optional block——per-task lazy、graceful、明示 quick-scale 適用且 untrusted（REQ-TEMPLATES-102 / 103）~16 lines

## Tests

- [x] T4 `tests/contract/skill-format.test.ts`：新增 section-scoped 斷言，自 plan/implement skill 對應區段切片，驗證步驟存在 + graceful（"if a Context7 MCP is available"/"skip silently"）+ untrusted + non-gating 字樣（REQ-TESTS-027 AC1）~55 lines
- [x] T5 `skill-format.test.ts`：新增 negative assertion——plan/implement Startup Loading 未因本變更新增 `[STABLE]` 項（REQ-TESTS-027 AC3）~12 lines

## Deploy / Verify

- [x] T6 [M] 跑 `prospec agent sync` 重新生成 `.claude/skills/` + `.agents/skills/` ~3 lines
- [x] T7 [V] 確認 `tests/fixtures/startup-loading-baseline.json` 未變動（REQ-TEMPLATES-101 AC3）~2 lines
- [x] T8 [V] Mutation-verify：逐一移除 T1/T2/T3 的步驟 → 對應 T4/T5 斷言轉紅（REQ-TESTS-027 AC2，PB-001）~6 lines — 4/4 RED-as-expected、files restored
- [x] T9 [M] 跑 `pnpm verify:skills`（28/0）+ `pnpm test`（1041 綠）→ 全綠 ~3 lines

## Docs

- [x] T10 root README.md/README.zh-TW.md 測試計數重新導出同步（1036→1041、contract 466→471，PB-004，rides feature commit）+ 評估 root README plan/implement 行為面（Principle 5：僅 full-tier 一行提及 Technical Summary，本變更為 optional additive 子節、未改既有 documented surface → WARN resolved，無需補述）。`_index.md` + templates/tests 模組 README 之 Knowledge-tier 計數同步走 archive Entry Gate（`/prospec-knowledge-update`，PB-005） ~25 lines

## Summary

- **Total Tasks:** 10（code 6 / `[M]` 2 / `[V]` 2）
- **Parallelizable Tasks:** 1（T3）
- **Total Estimated Lines:** ~160 lines

## Knowledge Quality Gate

| Check | 結果 |
|-------|------|
| Architecture layers confirmed | PASS（templates leaf + tests；無 Types/Lib/Services/CLI 變更） |
| File paths verified | PASS（3 個既有 `.hbs`、1 個既有 test、既有 README/fixture） |
| Test tasks included | PASS（T4/T5 契約斷言覆蓋 templates 變更；mutation-verify T8） |
