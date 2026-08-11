# Tasks: enforce-metadata-schema

**Input**: Design documents from `.prospec/changes/enforce-metadata-schema/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

> **TDD 順序**：每個 Phase 內測試任務排在實作任務之前（RED → GREEN）。Constitution 的 TDD 為 [MUST]。

---

## Phase 1: Types（REQ-TYPES-064）

- [x] T1 `tests/unit/types/change.test.ts` 新增 `related_modules` bare-name 拒絕案例——`**types**`／反引號／前後空白／空字串各一，以及 `types`／`api-middleware`／`user_profile` 通過案例（RED）~45 lines
- [x] T2 `src/types/errors.ts` 新增 `MetadataValidationError extends ProspecError`，code `METADATA_VALIDATION_FAILED`，`suggestion` 指向 metadata-format reference ~25 lines
- [x] T3 `src/types/change.ts` 的 `related_modules` 元素加上 bare-module-name refinement（拒絕 `*`／反引號／前後空白／空字串，不用白名單 regex）~15 lines

## Phase 2: Lib helper（REQ-LIB-031）

- [x] T4 `tests/unit/lib/change-metadata.test.ts` 讀取驗證案例——損壞的 `status`／`quality_log`／`review_provenance` 各一，斷言錯誤訊息含 change 名稱與 zod 欄位路徑（RED）~85 lines
- [x] T5 [P] `tests/unit/lib/change-metadata.test.ts` lossless 回歸——帶未知欄位 + YAML 註解的 fixture 讀→寫一輪逐字元比對（RED）~45 lines
- [x] T6 [P] `tests/unit/lib/change-metadata.test.ts` 寫入拒絕——不合 schema 時拒寫且目標檔案位元組不變（RED）~35 lines
- [x] T7 `src/lib/change-metadata.ts` 實作 `assertValidChangeMetadata` / `readChangeMetadata` / `writeChangeMetadataDoc` / `writeChangeMetadataObject`；落盤一律經 `atomicWrite()` ~95 lines

## Phase 3: Services 遷移（REQ-SERVICES-067）

- [x] T8 `change-plan.service.ts` 與 `change-tasks.service.ts` 讀取改 `readChangeMetadata`、寫回改 `writeChangeMetadataDoc`；保留 `fs.existsSync` 缺檔分支與 `isStatusBefore` 單向前進 ~40 lines
- [x] T9 `change-story.service.ts` 寫入改 `writeChangeMetadataObject` ~15 lines
- [x] T10 `change-story.service.ts` 的 `matchRelatedModules` 剝除 index.md Module 欄的 markdown 強調後才作為模組名（REQ-CHNG-003 MODIFIED）~10 lines
- [x] T11 ~~`archive.service.ts` 讀取點與 `:498` 寫回點改用 helper~~ → **範圍縮小**：archive 明文容忍 pre-schema metadata（缺 `created_at` 仍歸檔、渲染 `unknown`，有具名測試覆蓋），加驗證會把受支援狀態變成靜默 skip；改為只加註解說明刻意不驗證，完整性由 Entry Gate 的 `metadata-completeness` 把關。偏離已記入 delta-spec 與 plan ~10 lines
- [x] T12 `check.service.ts` 的 `--record-review` 讀寫改用 helper ~15 lines
- [x] T13 [V] grep `as ChangeMetadata` 於 `src/services/` 結果為零（PB-007 平行站點清零）~0 lines

## Phase 4: 回歸與整合測試（REQ-TESTS-055）

- [x] T14 `tests/unit/services/change-story.service.test.ts` 斷言 `related_modules` 與 proposal 的 Related Modules 皆為 bare name、無雙層加粗 ~35 lines
- [x] T15 既有 archived metadata 回溯驗證 → **改為契約形狀回歸測試**：實跑 43 筆掃描（29 通過／14 失敗），發現 1 個契約自身缺陷（`dimensions[].result: not-applicable` 被 schema 拒絕，已修進 REQ-TYPES-064）與 14 筆歷史資料缺陷（producer 皆已正確、archive 不在驗證路徑、gitignored、零執行期影響 → 另立 issue）。測試改以真實 archived metadata 的形狀為 fixture，不綁本機 archive 狀態。範圍修正已記入 proposal SC-002 與 delta-spec ~95 lines
- [x] T16 `tests/integration/` 補 `change story → plan → tasks` 全流程，斷言各站點寫出的 metadata 皆通過 schema ~45 lines
- [x] T17 [V] 對新增斷言做 mutation 驗證，確認 section-scoped 且非全文 `toContain`（PB-001）~0 lines

## Phase 5: 收尾驗證

- [x] T18 [M] 跑 `pnpm counts` 重導事實計數（新增 lib 檔與測試數會動到 README／index 計數）~0 lines
- [x] T19 [V] `pnpm test`（96 files ／ 2,233 tests）、`pnpm typecheck`、`pnpm lint` 三者全綠 ~0 lines
- [x] T20 [V] 確認未觸及 `lib/drift-sources.ts`——drift 端刻意維持寬鬆讀取（plan Design Decisions）~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 20 |
| Code tasks | 14 |
| `[M]` manual | 1 |
| `[V]` verification | 5 |
| Parallelizable | 2 |
| Estimated lines | ~585 lines |

---

## Notes

- 完成率只計 code task（14 項）；`[M]`／`[V]` 不進分母
- 每個 Phase 完成後跑一次 `pnpm test`，不累積紅燈
- T15 原則「修資料，不放寬 schema」的實跑結果：發現的 1 個**契約缺陷**已修 schema（`not-applicable` 是 skill 強制值，schema 錯不是資料錯）；14 筆歷史資料缺陷**不改**（gitignored、不在驗證路徑、producer 已正確），另立 issue
- README 更新：`README.md`／`README.zh-TW.md` 僅由 `pnpm counts` 同步測試數（2,191→2,233），無介面異動，Constitution 的 README [SHOULD] 規則不觸發
- 實際新增測試檔 3 個（`tests/unit/lib/change-metadata.test.ts`、`tests/contract/change-artifact-format.test.ts` 為計畫外補強、`tests/integration` 擴充）；contract 檔用真實 `renderTemplate()` 守渲染層單層加粗
