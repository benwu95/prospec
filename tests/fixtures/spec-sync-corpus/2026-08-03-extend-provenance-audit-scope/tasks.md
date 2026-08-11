# Tasks: extend-provenance-audit-scope

**Input**: Design documents from `.prospec/changes/extend-provenance-audit-scope/`
**Prerequisites**: plan.md, delta-spec.md

## Format: `[ID] [P?] [kind?] Description (~lines)`

- **[P]**: Can run in parallel (different files, no mutual dependencies)
- **[M] / [V]**: Task kind — manual / verification; unmarked = code (definition frozen in the tasks-format reference)
- **~N lines**: Estimated lines changed

---

## Phase 1: Tests First (RED)

- [x] T1 `tests/unit/types/change.test.ts`：`PROVENANCE_AUDITED_STATUSES` 為 `CHANGE_STATUSES` 子集、不含 `archived`；`isProvenanceAudited` 對 `null`／`undefined`／未知字串／`constructor` 皆 false ~45 lines
- [x] T2 [P] `tests/unit/lib/drift-checker.test.ts`：review-provenance 的 `verified` 紅向（recorded ≠ current）與綠向（recorded == current） ~40 lines
- [x] T3 [P] `tests/unit/lib/drift-checker.test.ts`：test-provenance 的 `verified` 紅向與綠向 ~40 lines
- [x] T4 [P] `tests/unit/lib/drift-checker.test.ts`：不得被放寬波及的負向案例——`tasks` 無 finding、`verified` proven backfill 豁免、`verified` 且 recorded 非零 exit 仍 FAIL ~50 lines

## Phase 2: Types

- [x] T5 `src/types/change.ts`：`PROVENANCE_AUDITED_STATUSES`（`satisfies readonly ChangeStatus[]`）＋ `Set` 支撐的 `isProvenanceAudited()`，落在 `forbiddenArtifacts()` 之後 ~25 lines
- [x] T6 `src/types/drift-report.ts`：兩處 per-id 註解的 `Non-implemented changes are exempt` 改述為登記表範圍（該註解被當作 registry 真相來源） ~10 lines

## Phase 3: Lib

- [x] T7 `src/lib/drift-checker.ts:353`：`evaluateReviewProvenance` 改用 `isProvenanceAudited`，並改寫 doc comment（受稽核狀態、`archived` 為列舉不到、verify 後 commit 必然 stale） ~20 lines
- [x] T8 `src/lib/drift-checker.ts:502`：`evaluateTestProvenance` 同上，判序不動 ~18 lines

## Phase 4: Templates

- [x] T9 `src/templates/skills/prospec-archive.hbs`：Entry Gate 新增 provenance 機器檢查條目（比照 metadata-completeness 的語氣與 CLI-required 註記） ~10 lines
- [x] T10 `src/templates/init/status-lifecycle.md.hbs`：新增 `## Provenance audit scope` 表（六個 status 逐一標記＋理由） ~16 lines
- [x] T11 `prospec/ai-knowledge/_status-lifecycle.md`：同步 T10 的表（雙份副本） ~16 lines
- [x] T12 [M] `pnpm bundle` 後 `npx tsx src/cli/index.ts agent sync`（bundled-templates 先於 FS；勿用 `pnpm exec prospec`） ~0 lines

## Phase 5: Contract Tests

- [x] T13 `tests/contract/skill-format.test.ts` lifecycle 區塊：兩份副本的 audit-scope 表 ↔ `PROVENANCE_AUDITED_STATUSES` 雙向集合相等 ~45 lines
- [x] T14 `tests/contract/skill-format.test.ts`：archive Entry Gate 區段內斷言兩個 check id ＋「FAIL → 不 archive」語意（section-scoped，非全文 `toContain`） ~30 lines

## Phase 6: Knowledge & Ledger Sync

- [x] T15 `prospec/ai-knowledge/_playbook.md` PB-016：guidance 補「該順序現已由閘門強制」 ~6 lines
- [x] T16 [P] `prospec/ai-knowledge/modules/lib/drift-engine.md`：Pitfalls 補稽核範圍與登記表出處 ~5 lines
- [x] T17 [P] `prospec/ai-knowledge/modules/types/README.md`：Key Files／Modification Guide 補登記表 ~5 lines
- [x] T18 [P] `prospec/ai-knowledge/modules/tests/README.md`：contract 檔描述補新釘法 ~4 lines
- [x] T19 [M] `pnpm counts` 重導事實計數（新增測試後必跑） ~0 lines

## Phase 6.5: Sweep（實作期由 PB-007 同族清掃補入）

- [x] T23 `README.md` ＋ `README.zh-TW.md`：`prospec check` 說明的 review/test provenance 稽核範圍（雙語同步；Constitution 的 User-Facing Documentation 條目） ~4 lines
- [x] T24 delta-spec 補 MODIFIED `REQ-TESTS-042`／`REQ-TESTS-056`：場景清單的 `non-implemented` 改稱 outside-the-audit-scope ~30 lines

## Phase 6.6: Review 回饋（review 輪次補入）

- [x] T25 `src/templates/skills/prospec-review.hbs` ＋ `prospec-verify.hbs`：Entry Gate 的 status 條目明載那是**下限**、`verified` 變更在 verify 後改碼可再進入（`prospec verify record` 於 `verified` 上是設計內的成功路徑），再 `pnpm bundle` + `agent sync` ~6 lines
- [ ] T26 [M] **archive 站必做**：依 delta-spec 的 `## Story Convergence` 表收斂 `drift-detection.md` 的 US-6／US-9 敘事與 acceptance scenario——`:175`／`:282` 與出貨行為相反，機械合併碰不到、無測試可攔 ~0 lines

## Phase 6.7: Review 第二／三輪回饋

- [x] T27 `src/templates/skills/prospec-review.hbs`：Error Handling 的拒絕條件改對準 Entry Gate 的 floor（status 早於 `implemented`，涵蓋 `story`／`plan`／`tasks`），不再連 `verified` 一起擋 ~2 lines
- [x] T28 `src/templates/skills/prospec-verify.hbs` ＋ `prospec-archive.hbs` ＋ `_status-lifecycle.md` 兩份副本：明載「重驗得 B/C/D 時 `verified` 原地保留、兩個機器訊號皆不反映新評級，故不可 archive」 ~14 lines
- [x] T29 `src/lib/status-router.ts` ＋ 單元斷言：`verified` 分支補宣告 review/test provenance 閘門（宣告而非評估，router 維持 I/O-free） ~12 lines
- [x] T30 `tests/contract/skill-format.test.ts`：四組新斷言（review/verify 的 floor＋負向、re-entry 邊界、lifecycle 雙副本、archive 兩條新 marker）並逐一 mutation 驗證 ~55 lines
- [x] T31 delta-spec：新增 `REQ-TEMPLATES-173`、MODIFIED `REQ-LIB-035`，並修正 `REQ-TEMPLATES-171/172` 與 `REQ-TESTS-073` 的不成立宣稱（copy-equality 守衛、marker 計數、`tasks` 是唯一阻擋 status） ~70 lines
- [x] T32 壓縮本變更對 `_status-lifecycle.md` 與 `modules/tests/README.md` 的新增，把 knowledge-size 迴歸收到最小 ~10 lines

## Phase 7: Gates & Mutation

- [x] T20 [M] `pnpm typecheck` ＋ `pnpm test` 全綠 ~0 lines
- [x] T21 [V] mutation 驗證：`pnpm mutate src/types/change.ts`（勿加 `--`）；並手動把登記表改回僅含 `implemented`，確認 T2／T3 紅向轉紅後還原 ~0 lines
- [x] T22 [V] 現地重演驗收條件：把本變更設為 `verified` 後動一行程式碼，確認 `prospec check` 兩道閘門轉紅；還原後轉綠 ~0 lines

---

## Summary

| Item | Count |
|------|-------|
| Total tasks | 32 |
| Code tasks | 26 |
| Manual `[M]` | 4 |
| Verification `[V]` | 2 |
| Parallelizable | 6 |
| Estimated lines | ~588 lines |

---

## Notes

- [P] = different files, no dependencies, can run in parallel
- [M]/[V] mark manual/verification tasks; unmarked tasks are code (see tasks-format reference)
- Phase 1 先行是 Constitution 的 TDD 條目要求：T1-T4 必須先紅，再由 Phase 2-3 轉綠
- T12 漏跑會讓部署的 skill 停在舊文，`bundled-templates-sync.test.ts` 會攔
- **記錄的偏離**：T23／T24 不在原計畫內。實作期依 PB-007 grep 同族宣稱時，發現 root README 雙語與 feature spec 的 `REQ-TESTS-042`／`REQ-TESTS-056` 仍寫「implemented／non-implemented」；那正是本變更要消滅的未被承認的宣稱，故補入而非留給下一個變更。Summary 的計數已隨之更新。
- **T25／T26 來自 review 第一輪**：T25 修的是本變更自己造出的狀態（`verified` 帶紅燈）在 review／verify 兩站的措辭沒被承認；T26 是唯一無法在本站解決的一項——feature spec 的 US 層文字只有 archive 有權寫，故改為留下可執行的收斂指令。
- **T27–T32 來自 review 第二／三輪，且全部起因於前一輪的修復本身**（PB-007 強化條款的實例）：T25 只改 Entry Gate 一行卻留下 Error Handling 表的反向指示；同一句又把「重驗」宣告為安全路徑而沒說 B/C/D 會讓 `verified` 原地保留；archive 的 marker 從 8 個加到 10 個後，三處寫死的「seven of eight」計數沒同步；「唯一阻擋的 status 是 `tasks`」則是實作無法兌現的 universal。教訓已於 verify 後送 `/prospec-learn`。
