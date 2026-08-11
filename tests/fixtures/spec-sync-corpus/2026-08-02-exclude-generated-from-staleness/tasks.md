# Tasks: exclude-generated-from-staleness

**Input**: Design documents from `.prospec/changes/exclude-generated-from-staleness/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests (RED first)

- [x] T1 `drift-sources.test.ts`：只 commit 生成檔 → `last_src_commit` 停在前一次真實原始碼 commit ~40 lines
- [x] T2 反向：其後 commit 真實原始碼且 README 未更新 → 時間戳前移、`evaluateKnowledgeHealth` 仍判 stale ~35 lines
- [x] T3 生成檔與真實原始碼在同一 commit → 該 commit 仍計入 `last_src_commit` ~20 lines
- [x] T4 `computeChangeDigest`：編輯 `bundled-templates.ts` → digest 改變（註解寫明與 T1 的範圍刻意不同）~20 lines
- [x] T5 fault injection：排除 pathspec 查詢失敗 → 退回未排除答案，不得回 null ~50 lines
- [x] T6 [P] 契約測試：bundler 輸出路徑由常數推導、檔案存在、產生者無第二份路徑字面值 ~40 lines

## Phase 2: Lib

- [x] T7 新增 `src/lib/generated-artifacts.ts`：`BUNDLED_TEMPLATES_SOURCE` ＋ 由它推導的 `GENERATED_SOURCE_ARTIFACTS`，檔頭註明只作用於 staleness、不含 digest ~20 lines
- [x] T8 `gitLastCommit` 加 `excludes` 參數：組 `:(exclude)` pathspec，`gitCapture` 回 null 時降級重跑未排除查詢 ~18 lines
- [x] T9 `collectGitTimestamps` 只在 `last_src_commit` 傳入 `GENERATED_SOURCE_ARTIFACTS`，README／sub-module 兩呼叫不變 ~5 lines

## Phase 3: Scripts

- [x] T10 `scripts/bundle-templates.ts` 匯出 `OUTPUT_FILE`（由常數解析）並改用它寫檔，移除硬寫路徑 ~10 lines

## Phase 4: Knowledge & Counts

- [x] T11 lib 模組 README 的 Key Files／Pitfalls 反映新常數與「進 digest、不進 staleness」的界線 ~15 lines
- [x] T12 [M] 跑 `pnpm counts` 校正 factual counts（新增 lib 檔案）~5 lines

## Phase 5: Verification

- [x] T13 [M] `pnpm lint`／`pnpm typecheck`／`pnpm test` 全綠 ~5 lines
- [x] T14 [V] Mutation：移除 T9 的排除傳參 → T1 轉紅 ~10 lines
- [x] T15 [V] Mutation：把生成檔加進 `computeChangeDigest` 的 denylist → T4 轉紅 ~10 lines
- [x] T16 [M] SC-001 實測：commit 後跑 `prospec check`，lib 回報 not stale ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 16 |
| Code tasks | 11 |
| Parallelizable | 1 |
| Estimated lines | ~303 lines |

---

## Notes

- Phase 1 全部先寫成紅燈再進 Phase 2；T6 在 T7 之前必然是編譯紅（常數尚不存在），這是預期的 RED
- T14／T15 是同一枚硬幣的兩面：一個證明排除有效，一個證明排除**沒有**越界到 digest
- [M]/[V] 不計入 completion rate 分母；T12／T13／T16 需人工觀察輸出
