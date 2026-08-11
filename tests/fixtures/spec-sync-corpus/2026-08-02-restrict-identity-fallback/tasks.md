# Tasks: restrict-identity-fallback

**Input**: Design documents from `.prospec/changes/restrict-identity-fallback/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests (RED first — TDD [MUST])

- [x] T1 在 `tests/unit/lib/review-merge.test.ts` 加 issue #116 最小重現：既有 `F-8`（有 id）遇上同 `(location, lens)` 的 incoming `NEW-4` → 兩列，兩個 id 都在，舊列 summary/status 不被覆蓋 ~20 lines
- [x] T2 加同輪兩個無 id、共用 `(location, lens)` 的案例：空表 → 兩列；既有一列 → 第一筆併入、第二筆開新列 ~25 lines
- [x] T3 加「無 id finding 對到**有 id** 的既有列仍併入（REQ-CLI-028 既有情境）」與「同輪重用同一個 id 併入同一列」~25 lines
- [x] T4 加「location 漂移時由 id 命中，`(location, lens)` 候選列不被消耗、仍可供本輪其他 finding 認領」~20 lines
- [x] T5 [V] 在未動實作前執行 `pnpm vitest run tests/unit/lib/review-merge.test.ts`，記錄 T1-T4 的紅燈與失敗訊息（RED 證據） ~5 lines

## Phase 2: Lib

- [x] T6 改寫 `src/lib/review-merge.ts` 的 `mergeFindings` 身分解析：`byFallback` 僅由 `existing` 種入；帶 id 時 `byId` 命中優先、未命中僅在候選列無 id 時收養；認領到候選列即刪除該退回鍵；本輪新列不寫回退回索引 ~25 lines
- [x] T7 更新 `mergeFindings` 的 JSDoc 與模組首註解，敘明三條識別路徑與「無 id 的代價止於跨輪追蹤」 ~12 lines
- [x] T8 [V] 執行 `pnpm vitest run tests/unit/lib/review-merge.test.ts`，確認新測試轉綠且既有 14 個測試零修改通過 ~5 lines

## Phase 3: Templates & Knowledge

- [x] T9 更新 `src/templates/skills/references/review-format.hbs` 的 Identity 條目，敘述未知 id 開新列、無 id 的比對範圍與同輪不塌列 ~12 lines
- [x] T10 在 `tests/contract/skill-format.test.ts` 加 section-scoped 斷言，釘住 T9 的三條語意（REQ-TEMPLATES-067 新 AC），並含非空 slice 守衛 ~25 lines
- [x] T11 [M] 執行 `pnpm bundle` 重生 bundled-templates，再 `prospec agent sync` 重新部署 `.claude/` 與 `.agents/` 下的 `review-format.md` ~5 lines
- [x] T12 更新 `prospec/ai-knowledge/modules/lib/README.md` Pitfalls 的 `review-merge` 句子，把「never infers identity from a location string」收斂為新的三路徑不變式 ~6 lines
- [x] T13 [M] 執行 `pnpm counts` 重導測試計數（新增測試改變 unit/contract 數字，PB-004） ~5 lines

## Phase 4: Gates

- [x] T14 [V] mutation 驗證：分別施加 ①條件改回 `?? byFallback.get(...)` ②新列寫回 `byFallback` ③移除退回鍵消耗，逐一確認對應測試轉紅後還原，並記錄實際施加的 mutation（PB-001 第 3 條） ~10 lines
- [x] T15 [V] 執行 `pnpm typecheck`／`pnpm lint`／`pnpm test`／`pnpm counts:check` 與 `prospec check --strict`，對照變更前基線確認無新增 FAIL ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 15 |
| Code tasks | 9 |
| Manual `[M]` / Verification `[V]` | 2 / 4 |
| Estimated lines | ~200 lines |

---

## Notes

- Phase 1 必須整批轉紅後才進 Phase 2 —— TDD 是 Constitution `[MUST]`
- T14 的三個 mutation 各對應一條 FR（FR-001 / FR-002 / FR-003），任一不轉紅代表該條測試是恆真式
- [M]/[V] 不計入完成率分母；未勾的 `[M]` 會在 archive 觸發警示
