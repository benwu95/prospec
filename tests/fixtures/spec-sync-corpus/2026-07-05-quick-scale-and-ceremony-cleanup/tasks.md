# Tasks: quick-scale-and-ceremony-cleanup

> 行為改動編 `src/templates/skills/*.hbs`（非生成的 `.claude/skills/*/SKILL.md`）。
> TDD：drift 程式碼先寫測試至 RED 再實作。Tests 段依格式置末，單一 commit 模式下 test 隨 feat 同 commit。

## Types

- [x] T1 Rename `readme-counts`→`mcp-readme-counts` in `DRIFT_CHECK_IDS` + 更新註解點明 MCP-specific 範圍 (src/types/drift-report.ts) ~12 lines
- [x] T2 Add `metadata-completeness` id to `DRIFT_CHECK_IDS` + 註解說明 FAIL-class 用途 (src/types/drift-report.ts) ~10 lines

## Lib

- [x] T3 Rename readme-counts collector/source/evaluator → mcp-readme-counts（`collectReadmeCounts`/`ReadmeCountSource`/`evaluateReadmeCounts`/runChecks key），grep 全 lib 引用點改齊 (src/lib/drift-sources.ts, drift-checker.ts) ~40 lines
- [x] T4 Add `collectMetadataCompleteness(cwd, changesDir)` — 掃 `.prospec/changes/*/metadata.yaml`，回傳每 change 的欄位存在性 + verify-grade 存在性，比照 `collectReviewProvenance` (src/lib/drift-sources.ts) ~55 lines
- [x] T5 Add `evaluateMetadataCompleteness(src)` pure evaluator（缺 name/created_at/status/scale→FAIL；verified 無 S/A grade→FAIL；in-progress 不套 grade 規則）+ 併入 `DriftCheckInputs`/`runChecks` (src/lib/drift-checker.ts) ~50 lines

## Services

- [x] T6 Wire `collectMetadataCompleteness` 進 `check.service` 的 `DriftCheckInputs` 組裝，比照 reviewProvenance (src/services/check.service.ts) ~15 lines

## Templates (skill prompts)

- [x] T7 [P] prospec-verify.hbs — quick scale-aware 減量（Startup Loading 條件化、報告收斂、`NEVER skip` 加 quick/backfill not-applicable 轉義例外）+ 刪 checkpoint-commit 讓步括號（commit 語意統一）；完整 Quality Gate 表留此站 (src/templates/skills/prospec-verify.hbs) ~40 lines
- [x] T8 [P] prospec-archive.hbs — quick spec-impact 不比 standard 淨加重（reframe Entry Gate 定位）+ 新增 metadata-completeness Entry Gate 消費項（FAIL 拒絕入庫，CLI 不在退回直讀）(src/templates/skills/prospec-archive.hbs) ~30 lines
- [x] T9 [P] prospec-tasks.hbs — `[P]`/`~lines` 由 Phase 3/4/5 Gate、Failure/Success、NEVER 的必填語境降為選填（`[M]`/`[V]` kind 標記不動）+ Phase 7 Quality Gate 收斂為一行 pass/warn 註記 (src/templates/skills/prospec-tasks.hbs) ~35 lines
- [x] T10 [P] prospec-new-story.hbs — Phase 6 INVEST 逐條稽核降 advisory（鬆綁 Phase Gate 與 NEVER）+ Phase 7 Quality Gate 收斂為一行註記 (src/templates/skills/prospec-new-story.hbs) ~30 lines
- [x] T11 [P] prospec-plan.hbs + prospec-implement.hbs — Quality Gate 收斂為一行 pass/warn 註記（implement commit 段確認與 verify 一致）(src/templates/skills/prospec-plan.hbs, prospec-implement.hbs) ~25 lines

## Docs & Governance

- [x] T12 [P] CONSTITUTION.md — Language Policy 還原豁免 AI Knowledge（Description/Verify/checklist/quality-standards）+ INVEST 維持 [MUST]+六準則表、僅改寫 Verify 條款使 new-story 逐條檢查為 advisory (prospec/CONSTITUTION.md) ~22 lines
- [x] T13 [P] Language Policy 三方對齊收尾 — CLAUDE.md Language Policy 段、`token-measurement/lessons.md` L-001 更新、`_lessons-ledger.md` header 加 description-language 宣告 (CLAUDE.md, .tasks/feat/token-measurement/lessons.md, prospec/ai-knowledge/_lessons-ledger.md) ~18 lines
- [x] T14 [P] `_status-lifecycle.md` 加 design 定位行（無 status、僅 `ui_scope != none` 介入、位於 plan 與 tasks 間）(prospec/ai-knowledge/_status-lifecycle.md) ~8 lines

## Tests

- [x] T15 metadata-completeness evaluator 單元測試 — 通過（欄位完整）+ 失敗（缺各核心欄位、verified 無 grade）兩路徑；in-progress 不 false-block (tests/unit/) ~65 lines
- [x] T16 metadata-completeness collector 測試 — 以 changes-dir fixture 驗證欄位/grade 萃取 (tests/unit/) ~30 lines
- [x] T17 Rename readme-counts→mcp-readme-counts 於既有測試（evaluator/collector/引用）(tests/unit/, tests/contract/) ~25 lines
- [x] T18 更新 drift-report id-set 契約測試（9→10 ids，含 mcp-readme-counts + metadata-completeness）(tests/contract/) ~15 lines
- [x] T19 更新 skill-generation/skill-format 契約測試以吻合改動的 skill 模板（quick 減量、Quality Gate 去重、INVEST advisory、commit 措辭）(tests/contract/) ~30 lines
- [x] T20 [V] Mutation-verify 新增/改名的 drift 斷言（刪/改被斷言特徵確認變紅）(PB-001) ~10 lines

## Finalization

- [x] T21 [M] `prospec agent-sync`（或 pnpm build + sync）重生成 `.claude/skills/` 自編修後的 `.hbs` ~5 lines
- [x] T22 [M] `pnpm counts` 重生 drift check id 數等被計數欄位 ~5 lines
- [x] T23 [V] `pnpm vitest run` 全套件綠 + `pnpm build`/typecheck 通過 ~5 lines

## Summary

- **Total Tasks:** 23
- **Parallelizable Tasks:** 8
- **Total Estimated Lines:** ~618 lines
