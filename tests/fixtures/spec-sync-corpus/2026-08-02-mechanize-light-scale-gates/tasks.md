# Tasks: mechanize-light-scale-gates

**Input**: Design documents from `.prospec/changes/mechanize-light-scale-gates/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests (RED first — TDD [MUST])

- [x] T1 `tests/unit/types/change.test.ts`：四個 scale 的禁用集合逐格斷言＋未標示 scale 讀作 standard（空集合）~40 lines
- [x] T2 `tests/unit/lib/artifact-validators.test.ts`：promote-scaffold 缺 delta-spec.md → FAIL 且訊息指名該檔；有檔 → 不新增 finding ~30 lines
- [x] T3 `tests/unit/services/change-tasks.service.test.ts`：`scale: quick` 無 plan.md 仍產出 tasks.md 並推進 `story → tasks`，且不落 plan.md／delta-spec.md ~45 lines
- [x] T4 同檔反向：`standard`／未標示缺 plan.md 仍拋原本的 PrerequisiteError；metadata.yaml 不存在時同樣不放行 ~35 lines
- [x] T5 同檔：`scale: backfill` 以專屬理由拒絕且目錄無新檔（拒絕早於任何寫入）~30 lines
- [x] T6 `tests/unit/services/change-plan.service.test.ts`：quick 指向 `prospec change tasks`、backfill 指向 `/prospec-promote-backfill`，兩者皆不落 plan.md／delta-spec.md ~50 lines
- [x] T7 同檔反向：`standard`／`full`／未標示的既有前置、clobber 保護與狀態前進逐字不變 ~30 lines
- [x] T8 [P] `tests/contract/skill-format.test.ts` scale-adapter 區塊：以 `findTable` 定位兩份 lifecycle 副本的矩陣表，與 `SCALE_FORBIDDEN_ARTIFACTS` 雙向集合相等 ~60 lines
- [x] T9 [P] `tests/integration/change-flow`：`change story → change scale quick → change tasks` 全流程，斷言 SC-001 的三個事實 ~45 lines

## Phase 2: Types

- [x] T10 `src/types/change.ts`：`SCALE_FORBIDDEN_ARTIFACTS`（`satisfies Record<ChangeScale, readonly string[]>`，四值齊備）＋ `forbiddenArtifacts(scale)`，檔頭註明它是 `_status-lifecycle.md` 矩陣的可執行副本 ~25 lines

## Phase 3: Lib

- [x] T11 `src/lib/artifact-validators.ts`：`PromoteScaffoldInputs.hasDeltaSpec` 設必填，缺檔加一條 FAIL finding ~12 lines

## Phase 4: Services

- [x] T12 `change-tasks.service.ts`：metadata 讀取前移至前置檢查之前；順序＝本站產物禁用 → plan.md 前置（依登記表可略過）→ clobber 保護 ~30 lines
- [x] T13 `change-plan.service.ts`：同樣前移 metadata 讀取，加登記表閘門與 per-scale 導向訊息，拒絕路徑零寫入 ~28 lines
- [x] T14 `validate.service.ts`：promote-scaffold 分支傳入 `hasDeltaSpec: fs.existsSync(...)` ~5 lines

## Phase 5: Docs, Templates & Knowledge

- [x] T15 `prospec/ai-knowledge/_status-lifecycle.md` 新增 `## Light-scale artifact matrix` 表（四列，含 standard/full 的「—」）並在轉移表 quick 列指向它 ~18 lines
- [x] T16 `src/templates/init/status-lifecycle.md.hbs` 同步同一張矩陣（兩份副本逐字一致）~18 lines
- [x] T17 `README.md` 的 `prospec change plan`／`change tasks` 兩列補上 scale 條件；雙語 README 同步 ~10 lines
- [x] T18 types／lib／services／tests 四份模組 README 據實反映登記表、validator 新輸入、兩站閘門與新測試 ~30 lines
- [x] T19 [M] 跑 `pnpm counts` 校正 factual counts（新增測試數）~5 lines

## Phase 6: Gates & Verification

- [x] T20 [M] `pnpm lint`／`pnpm typecheck`／`pnpm test`／`pnpm counts:check` 全綠 ~5 lines
- [x] T21 [V] Mutation：移除 T12 的 quick 例外 → T3 轉紅 ~5 lines
- [x] T22 [V] Mutation：拿掉 T12/T13 的 scale 判斷（一律放行）→ T4／T5／T6 轉紅 ~5 lines
- [x] T23 [V] Mutation：改動 lifecycle 矩陣表其中一格 → T8 轉紅 ~5 lines
- [x] T24 [V] PB-002 逐站走查：story／plan／design／tasks／implement／review／verify／archive 加上 `prospec status`、`change progress`，逐站記錄 false-block 與 false-pass 結論 ~10 lines
- [x] T25 [M] SC-001 實測：乾淨 sandbox 走完 quick 三步，斷言 tasks.md 存在、plan.md／delta-spec.md 不存在、`status: tasks` ~5 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 25 |
| Code tasks | 18 |
| Parallelizable | 2 |
| Estimated lines | ~576 lines |

---

## Notes

- Phase 1 全部先寫成紅燈才進 Phase 2；T8 在 T10 之前必然是編譯紅（登記表尚不存在），這是預期的 RED
- T21～T23 三枚 mutation 各自對應一個獨立失效面：quick 例外、scale 判斷本身、文件↔程式碼矩陣一致性
- T24 是 PB-002 的落地：這個缺陷的成因正是只改被點名的站；走查結論要寫進 review 前的紀錄
- `[M]`/`[V]` 不計入 completion rate 分母；T19／T20／T25 需人工觀察輸出
