# extend-review-criteria — Archive Summary

- **Archived**: 2026-10-20
- **Original Created**: 2026-10-20T03:43:55.168Z
- **Quality Grade**: S
- **Issue**: #403
- **Plan Decision**: plan (graded_by: human)

## User Story

- **US-1 [P0]**：As a 執行 `prospec-review` 的開發者，I want efficiency lens 在 change 或其 plan 接受可隨資料量放大的效能成本、卻沒有 production 資料量依據時提出 major，So that「不加索引」這類決策在補上資料量之前，不會被後續 review 默默沿用。
- **US-2 [P1]**：As a 環境中裝有個人審查 skill 的開發者，I want `prospec-review` 在 spawn reviewer 前挑出適用的非 `prospec-*` 審查 skill，只把其中的準則交給通用 fresh-context reviewer，So that 私有準則參與每一輪審查，同時不破壞 Prospec 審查契約與專案既有慣例。
- **US-3 [P1]**：As a 專案維護者，I want archive harvest 與 learn Collect 把由個人準則抓到、且已修正的 finding 列為 lesson 候選，So that 有價值的私有準則經人類核可後成為所有隊友與 host 都讀得到的專案知識。

前提：下游專案案例與 2026-10-20 控制組實驗（兩個只帶內建 lenses 的 reviewer 在相同焦點與資料量下找出與外部 skill 相同的三類問題）支持方案 B；方案 A 的「私有準則」前提尚無漏抓實例，經使用者決定以假設保留。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | `review-lenses-content` 資料量準則列與 slow-path 限定；`delegation-protocol` Spawn 步驟的 *Criteria selection* 與 `For review criteria` brief 項目；`promotion-format` Harvest 外部準則候選；`prospec-review` 指標句；`prospec-archive`／`prospec-learn` 指向 Harvest |
| tests | Medium | `skill-format` 新增 `extended review criteria` 規則表（9 條 `unique` 規則、69 個測試），抽出 `SectionRule`／`pinSectionRules` helper；`startup-loading-baseline.json` 與 `REFERENCE_CEILING_ANCHOR` 51,341 → 51,905（依據寫於 proposal Edge Cases，review 前寫定） |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 重新產生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-252 | ADDED | 接受隨資料量放大的效能成本而無 production 資料量依據時，以 major 要求資料量，或併入既有效能 finding 並取較高 severity（US-53） |
| REQ-TESTS-139 | ADDED | 資料量準則列以 section-scoped、mutation 驗證的斷言釘住（US-53） |
| REQ-TEMPLATES-253 | ADDED | review 每輪挑選 ≤3 個已安裝審查 skill，只交準則；Prospec 契約與專案知識優先；`External criterion:` 標記（US-54） |
| REQ-TESTS-140 | ADDED | criteria selection 與 brief 項目各唯一並釘住所有子句（US-54） |
| REQ-TEMPLATES-254 | ADDED | Harvest 把帶標記且 `fixed` 的 finding 列為 lesson 候選（feedback-promotion US-6） |
| REQ-TESTS-141 | ADDED | Harvest 候選規則、標記一致與 archive／learn 指標、Promote 不自動寫 `_conventions.md` 被釘住（US-6） |
| REQ-TEMPLATES-238 | MODIFIED | brief 子句涵蓋 REQ-249／253 的 review 專屬項目，criteria selection 位於 brief 之前 |
| REQ-TESTS-100 | MODIFIED | 「不提高 reference 上限」限定為 lens registry 同步那次的量測條件 |

## Completion

- **Tasks**: 9/9 code tasks (100%)；[M] 2/2、[V] 3/3；原 T15（建 spec slice）依偏差移至 archive 執行
- **Acceptance Criteria**: 10/10 凍結情境有實作，verify 2/5 無 scenario finding

## Review & Verify

- **Review**: 6 輪＋1 輪確認（新 loop round 1），0 critical／3 major／6 minor，全數 fixed。R1-1 orchestrator 動作混入 delegate brief、R1-2 規則表缺子句與唯一性、R2-1（修正造成）in-session reviewer 碰不到 brief 項目；minor 為文件同步與 R4-1「後續 payload 從 `review.md` 取標記」。round 4 後依使用者指示做唯讀文件稽核，一次修完 40 件。
- **Verify**: Grade S — machine 1/5、4/5、5/5 PASS；2/5 delta-spec-compliance PASS（8/8 REQ，fresh-subagent）；3/5 constitution PASS（8/8 規則）；6 not-applicable；`pnpm test` 8,579 passed／4 skipped
- **Quality Log**:
  - prospec-new-story WARN：US-3 依賴 US-2 的標註（INVEST Independent）；方案 A 前提尚無實例
  - prospec-plan：verifier r1 FAIL（未量測 baseline）、r2／r3 WARN、r4 FAIL（r3 修正改出 FALSE 子句）、r5／r6 WARN（0 FALSE）；人工簽核含兩項 breaking-change（MODIFIED REQ-TESTS-100、提高 reference 錨點）
  - prospec-tasks：r1 FAIL（合併腳本誤刪兩個 task）、r2 WARN
  - prospec-review：累計 fix-induced 比例三次觸發斷路器（57.1%、62.5%、66.7%），三次使用者 break-glass（理由見 escalation history）；round 3 曾誤以 PASS 關閉（應為 WARN），已於 tasks Notes 記錄
  - prospec-verify：Grade S

## Follow-ups

- 方案 A 的私有準則前提待實例驗證；`prospec learn yield` 觀察資料量準則與外部準則 finding 的實際命中。
- 外部準則 finding 計入所屬內建 lens 的 yield，條件 lens 的退役建議可能延後（evidence 標記可供日後篩選）。

<!-- prospec:escalation-history -->
## Escalation History

Lifetime events: 3. Overrides: 3. Completeness: complete.

| Ordinal | Station | Trigger | Event | State |
|---|---|---|---|---|
| 1 | prospec-review | fix_induced_threshold_exceeded | review:3 | not pending |
| 2 | prospec-review | fix_induced_threshold_exceeded | review:4 | not pending |
| 3 | prospec-review | fix_induced_threshold_exceeded | review:5 | not pending |

| Event | Station | Reason | Usage |
|---|---|---|---|
| review:3 | prospec-review | 使用者同意進行下一輪——斷路器觸發時只剩文件相關的錯誤（3 個 minor），0 critical、0 open major | consumed by prospec-review:007fb703d8e32d40c5ec5a0cbd46b826b33345eebd06ffa403abd46bb4ae6250 |
| review:4 | prospec-review | 使用者指示「一次查完文件缺漏再來修」——唯讀稽核列出 40 件文件缺漏已一次修完，進行最後一輪 review 確認 | consumed by prospec-review:d52e58662b99c0cc6927bc2062fded2e90010c63ea318602a49990507637cbe1 |
| review:5 | prospec-review | 使用者選擇刪除錯誤宣稱後進 verify——R5-1 只刪 skill-authoring.md 的「and the Harvest candidate rules」，純刪除不再開 review 輪 | consumed by prospec-review:1b337eaba6d515a62f48eb5043d2addb131cfd0c61e29a971846ed778d817ac3 |
<!-- prospec:escalation-history-end -->
