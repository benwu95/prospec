# reassess-canonical-claims — Archive Summary

- **Archived**: 2026-10-04
- **Original Created**: 2026-10-03T14:43:33.136Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/341

## User Story

身為維護 prospec skill 與文件的開發者，
我希望規則的措辭不再需要在多個站點逐字同步，
這樣改一條規則時只改它所在的地方，不必連動 types、模板、README、網站與 Feature Spec。

（US-2，P0：身為撰寫或審查 skill 宣稱的 agent，我希望寫作規則以通用正向描述為主，review 只把會導致錯誤行為的宣稱當成嚴重問題。原 US-3「精簡負向字串斷言」已移出，改由 #342 處理。）

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Medium | 刪除 `canonical-claims.ts`（`CANONICAL_CLAIMS` registry） |
| lib | Low | `knowledge-sync.ts` 匯出 `RELATED_MODULE_HALT_CONDITION`，`status-router.ts` 改用它；`init-docs.ts` 移除 `canonical_claims` context |
| services | Low | `agent-sync.service.ts` 移除 `canonical_claims` context |
| templates | Medium | 5 個模板共 8 處 placeholder 改為渲染後的字面文字（部署輸出位元組不變）；`delta-spec-format` 的 Claim writing 與 docs lens 改為通用規則，docs lens 的嚴重度改以「會不會讓 agent 做錯」為準；刪除 universal-claims executor 的要求 |
| tests | Medium | 刪除 `canonical-claims.test.ts`；registry 消費端與 authored 站點改用字面值，維持 base 的守護強度；新增 claim-writing 規則與 Docs-Claims 嚴重度的 contract，以及「渲染輸出不含字面 `{{…}}`」的 contract；token baseline 重生，ceiling 未調高 |
| knowledge | Low | `_conventions.md` 新增 Skill and Documentation Authoring；PB-003 退休；模組 README、Constitution、README 中英版同步 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-241 | MODIFIED | 寫作規則改為通用規則：陳述元件自身保證、從程式判準推導、錯誤宣稱預設刪除、通用正向為主 |
| REQ-TEMPLATES-084 | MODIFIED | Docs-Claims lens 只在依宣稱行事會讓 agent 做錯時判 major 以上 |
| REQ-TEMPLATES-166 | MODIFIED | Spec 區塊的寫作指引移除逐字片語與「三處以上就登記」 |
| REQ-TEMPLATES-129、REQ-TEMPLATES-162 | MODIFIED | 同步集合不再由 registry 注入 |
| REQ-LIB-097 | MODIFIED | related-only 未註冊條件的文字取自 `knowledge-sync` 的常數 |
| REQ-TEMPLATES-132、REQ-TESTS-043、REQ-TESTS-024、REQ-TESTS-127 | MODIFIED | PB-003 退休：20 active／7 compact |
| REQ-TESTS-106、REQ-TEMPLATES-221 | MODIFIED | 移除 executor 子句與 canonical site 的釘定 |
| REQ-TYPES-109、REQ-SERVICES-125、REQ-TESTS-129、REQ-TEMPLATES-222 | REMOVED | registry、context 注入、逐站點 contract、universal-claim executor 要求 |

## Completion

- **Tasks**: 11/11 code tasks（100%）；[M] 2/2；[V] 1/1。原 T11–T18（負向斷言精簡）隨 US-3 移出而撤回
- **Acceptance Criteria**: 8/8 凍結情境（第二次 verify 的 2/5 無 scenario_findings）

## Review & Verify

- **Review**: 兩個 loop、共 6 輪（fresh-subagent），累計 0 critical／6 major／11 minor。
  - 主要 major：Constitution 對手維護計數的歸屬（R1-01、R2-02）；contract 宣稱的保證超出實作（R1-02）；R3-01／R3-02 屬「刪除負向斷言的依據不成立」；`_conventions.md` 把已移出的 US-3 前提留在 L1（R4-01）。
  - R3 之後以 5 個平行 snapshot 做 mutation 稽核：實際刪除的 240 條負向斷言中，只有 74 條的依據成立，145 條不成立，另有約 17 處 Spec 子句仍承諾已刪除的斷言。開發者決定把 US-3 整個移出，另開 #342；測試檔以 base 為底，只重套 US-1／US-2 的變更。
  - fix-induced breaker 在第 3–5 輪都觸發（58–69%），原因是 CLI 以累積 row 數計算。
  - 刻意保留的 minor：R5-01（`_conventions.md:136` 的 structure 定義）與 V1-01（knowledge-update 3e 的集合斷言只比對到一半）。
- **Verify**: 兩次皆為 Grade A。
  - 第一次：2/5 WARN，有兩處 US-1.4 偏離：templates README 的登記站點 bullet 被整條刪除；backfill 集合斷言縮成只比對前綴。兩處修正後重新 review。
  - 第二次：16/16 REQ PASS，凍結情境無偏離；但驗收基準是 late-capture（US-3 移出時重新凍結），CLI 因此把 2/5 記為 not-adjudicated，S 拿不到。
  - 3/5 PASS（8 條規則），6 not-applicable；1/5、4/5、5/5 machine PASS；`pnpm test` 6969 passed／4 skipped。
- **Quality Log**:
  - plan verifier 前 3 次 FLAWS，主因是 REQ 綁定的負向斷言漏網；達到重試上限後升級給人，開發者選擇把 REQ 綁定的斷言延後到 #318，第 4 次 WARN。
  - tasks verifier WARN（13 條）。
  - review 各輪 WARN（breaker 與 R5-01／V1-01）。
- **Mutation**:
  - 新增或改寫的斷言都經過 RED→GREEN 驗證：claim-writing 規則集合、嚴重度欄、literal-brace contract、`RELATED_MODULE_HALT_CONDITION` 的兩個使用處。
  - 在 cascade-protocol、verify-backfill、prospec-archive 刪除 `∪ metadata.related_modules`，都有語意測試轉紅，不只是精確 baseline。

## Knowledge Update

- 5 個模組（templates、lib、tests、types、services）的 README 已在 feature commit 中同步；commit 之後重新蓋章。
- 教訓記入 `.tasks/lessons.md`（2026-10-04）：凡是寫「已被守住」，都要以 mutation 證實，精確 baseline 轉紅不算；修正一類問題要用腳本窮舉整類。
- 後續順序（開發者指定）：#326 → #325 → #330–#334 → 最後 #342 與 #318 一起處理。
