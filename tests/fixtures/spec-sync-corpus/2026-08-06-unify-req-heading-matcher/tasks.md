# Tasks: unify-req-heading-matcher

**Input**: Design documents from `.prospec/changes/unify-req-heading-matcher/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests First (RED)

- [x] T1 `tests/unit/lib/spec-headings.test.ts`：`matchReqHeading` 涵蓋 h1–h6、尾隨 `{#anchor}`／標題文字、`~~struck~~`（`includeStruck` 有無兩態）、非法 prefix（小寫／缺編號） ~70 lines
- [x] T2 [P] `tests/unit/services/archive-finalize.service.test.ts`：h3 REQ 的 spec 其 `req_count` 不再被算成 0（迴歸 1）＋歸零拒絕三態（frontmatter `>0` 且 body `0` → 不寫並回報；兩者皆 0／缺欄位 → 正常；一般校正 → 行為不變，dry-run 與實跑一致） ~90 lines
- [x] T3 [P] `tests/unit/services/archive-spec-body.service.test.ts`：MODIFIED 對 h3 REQ 就地取代並保留 h3 層級，檔內只剩一段該 id（迴歸 2） ~55 lines
- [x] T4 [P] `tests/unit/services/archive.service.test.ts`：REMOVED 後 h3 的 active section 仍在 → 回報 `pendingConvergence`（迴歸 3） ~35 lines
- [x] T5 [P] `tests/unit/lib/drift-sources.test.ts` ＋ `tests/unit/lib/drift-checker.test.ts`：`collectSpecCounters`／`evaluateSpecCounters` 的相符／不符／來源不可用三態＋缺欄位不報 ~75 lines
- [x] T6 [P] `tests/unit/services/archive-spec-body.service.test.ts`：REQ-TESTS-060 的邊界 fixture 補 h3 對照（最後一段接 h2／接 `---`／EOF，body 行數不減） ~50 lines
- [x] T7 [P] `tests/unit/cli/archive-output.test.ts`：finalize 輸出含被拒絕的 reconciliation（檔名／宣稱值／理由） ~30 lines

## Phase 2: Types

- [x] T8 `src/types/drift-report.ts`：`DRIFT_CHECK_IDS` 附加 `spec-counters`（第 15 個，warn-class）＋per-id 註解寫明範圍／嚴重度／skip 條件 ~14 lines

## Phase 3: Lib

- [x] T9 `src/lib/spec-headings.ts`（新檔）：`matchReqHeading(line, {includeStruck})` → `{id, level}`；葉節點、零 lib 內部 import ~45 lines
- [x] T10 `src/lib/drift-sources.ts`：刪除 `ACTIVE_REQ_HEADING`（不留 re-export shim），`collectFeatureMapGovernance` 與 `collectReqDefinitions` 改吃共用 matcher（後者 `includeStruck: true`） ~25 lines
- [x] T11 `src/lib/drift-sources.ts`：`collectSpecCounters(featuresDir)` —— 逐檔宣稱值 vs body 值（Deprecated 排除、`## US-`＋`### US-` 聯集），缺目錄／無 spec → `{available:false, reason}`，單檔不可讀只損該行 ~65 lines
- [x] T12 `src/lib/drift-checker.ts`：純 `evaluateSpecCounters`（不符 → warn，codepoint 排序）＋`runChecks` dispatch ~45 lines

## Phase 4: Services

- [x] T13 `src/services/archive.service.ts`：`recountFeatureSpecCounters` 的 REQ 判準改吃共用 matcher，Deprecated 感知留在原處 ~15 lines
- [x] T14 `src/services/archive.service.ts`：`mergeRequirementInPlace` 依 id 辨識（任何層級）、取代時保留找到的層級、skip 邊界一般化為「下一個 ≤ 該層級的 heading 或 `---`」 ~55 lines
- [x] T15 `src/services/archive.service.ts`：REMOVED 的 stale-deprecated 探針改吃共用 matcher（`syncToFeatureSpecs` 內），並整理 import ~15 lines
- [x] T16 `src/services/archive.service.ts`：recount 回傳歸零拒絕理由；`executeFinalize` 收集拒絕清單、跳過該檔寫入、dry-run 一致 ~55 lines
- [x] T17 `src/services/check.service.ts`：經正規 resolver 注入 `collectSpecCounters`（維持純唯讀路徑） ~20 lines

## Phase 5: CLI

- [x] T18 `src/cli/formatters/archive-output.ts`：finalize 輸出印出被拒絕的 reconciliation（檔名＋宣稱值＋理由，走 `sanitizeTerminal`） ~25 lines

## Phase 6: Contract Tests

- [x] T19 `tests/contract/` 新增單一來源契約：`src/` 內不得出現第二份 REQ-heading pattern（section-scoped、structure-aware —— PB-001） ~40 lines
- [x] T20 `tests/unit/services/check.service.test.ts`：skipped-never-PASS 斷言由 13 → 15 個 check（含 `artifact-language`／`spec-counters`） ~20 lines

## Phase 7: Templates, Docs & Counts

- [x] T21 `src/templates/skills/references/drift-report-format.hbs`：id 列舉加入 `spec-counters` ＋其語意段落 ~12 lines
- [x] T22 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync`（bundled-templates 先於 FS；勿用安裝版執行檔） ~0 lines
- [x] T23 `README.md` ＋ `README.zh-TW.md`：`prospec check` 的 check 列舉新增 `spec-counters` 子句（PB-009，雙語對等） ~14 lines
- [x] T24 知識同步：`modules/lib/README.md`（檔案數＋Key Files）、`modules/lib/drift-engine.md`（14 → 15 checks）、`modules/services/README.md`（`recountFeatureSpecCounters` 的括號描述改述為層級無關＋歸零拒絕） ~25 lines
- [x] T25 [M] `pnpm counts` 重導測試數（machine-owned 計數，勿手改） ~0 lines

## Phase 8: Verification

- [x] T26 [V] mutation：把 `matchReqHeading` 改回只認 `^####` 必須讓 T2／T3／T4 轉紅（確認非假紅，不只看 exit code） ~0 lines
- [x] T27 [V] `pnpm typecheck && pnpm test && pnpm counts:check` 全綠；`prospec check` 為 15 checks 且無新 FAIL ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 27 |
| Code tasks | 23 |
| `[M]` / `[V]` tasks | 2 / 2 |
| Parallelizable | 6 |
| Estimated lines | ~900 lines |

---

## Notes

- Phase 1 是 RED：T1–T7 全部先寫成失敗測試，再進 Phase 2 起的實作
- T10 刪掉 `ACTIVE_REQ_HEADING` 後，任何漏改的引用點會直接編譯失敗（`pnpm typecheck` 已涵蓋 `tests/`）—— 這是刻意不留 shim 的理由（PB-008）
- T14 的邊界一般化在 h4 情境下與原 `/^#{2,4}\s/` 等價；T6 的 h3 對照 fixture 是它的護欄
- 每個被改動的模組都有測試任務：lib（T1／T5／T19）、services（T2–T4／T6／T20）、types（T8 由 T19／T20 的契約斷言涵蓋）、cli（T7）
