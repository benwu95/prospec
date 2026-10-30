# ground-decisions-in-research — Archive Summary

- **Archived**: 2026-10-30
- **Original Created**: 2026-10-29T16:57:32.730Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/420
- **Plan Decision**: plan (graded_by: human)

## User Story

讓 `prospec-explore` 與 `prospec-plan` 在選定技術方向前，以需求本身查找外部既有做法：優先第一手來源，記錄每個做法的適用條件、限制與採用／排除理由，並把主張標為來源事實、推論或本專案實測。候選可比較、主要限制已辨識、剩餘不確定性有驗證方式時就停止研究；無搜尋能力時揭露限制，不偽造來源、不阻擋。共用規則放在新 partial `_external-research.hbs`，兩站只寫觸發時點與落點；plan 的研究結果寫進既有 Technical Summary、Simpler Alternative／候選與 Risk Assessment，不新增 CLI gate、schema、研究文件或來源配額。Plan Phase 6 收到 FLAWS 時依 proposal 分流每個 finding，同一機制第二次出現修補引入的問題時先重比替代方案；severity、Break-Glass、escalation 不變。

**Acceptance**：3 個 User Story、11 條凍結情境（baseline revision 1，未 amend）。新 Story 以 `sdd-workflow` US-55 落地，archive 時手建 `sdd-workflow/us-55.md` slice。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Modified | 新增 `_external-research.hbs`；explore Solution Space／Convergence、plan Phase 4 研究區塊與 Phase 6 FLAWS 分流 |
| lib | Modified | `template.ts` 註冊 partial；`bundled-templates.ts` 重產 |
| tests | Modified | skill-format 新 describe（逐規則 mutation）、Context7 斷言收窄、forbidden 清單提到檔案層級；cumulative 與 `missing-receipt` ceiling 依實測上調 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-256 | ADDED | Shared external-research guidance is one partial |
| REQ-TEMPLATES-257 | ADDED | Explore researches existing approaches before choosing a technical direction |
| REQ-TEMPLATES-258 | ADDED | Plan reuses or performs approach research and records it in existing sections |
| REQ-TEMPLATES-259 | ADDED | Plan triages verifier FLAWS against the proposal and re-compares a repeatedly patched mechanism |
| REQ-TESTS-143 | ADDED | External-research guidance is pinned section-scoped |

## Completion

- **Tasks**: 11/11 (100%), 5/5 [M]/[V] (not counted)
- **Acceptance Criteria**: 11/11（verify 2/5 逐 REQ PASS，無情境偏離）

## Review & Verify

- **Review**: 2 輪（round 2 review-clean），0 critical / 1 major，2 minor，全部 fixed — R1-1 major：Phase 6 scope 分流把 pause 時的去向寫成「sign-off presents it」，但 sign-off 材料的定義沒有這一項，改為指示 agent 寫進 sign-off 材料或 Output Summary（delta-spec REQ-TEMPLATES-259、plan、tasks 同步）；R1-2：`startup-loading-baseline.json` note 補記 rebaseline；R1-3：測試手抄的 forbidden 名稱清單改為檔案層級共用常數。fix-induced 比例 0%。
- **Verify**: Grade S（fresh-subagent）；task-completion、knowledge、tests 機器維度 PASS，delta-spec-compliance PASS（5/5 REQ），constitution PASS，design not-applicable；`pnpm test` exit 0（8,854 passed、4 skipped），coverage 96.5% statements。
- **Quality Log**: plan verifier 5 輪 — r1 FAIL（SC-005 缺量測 baseline，另 11 條 warning：ceiling 釘點漏列、研究區塊位置、分流缺結構性路徑等）、r2 WARN、r3 FAIL（scope 分流新增決策點、未走 human-decision 契約 → 改為記入 Risk Assessment，不新增決策點）、r4 WARN（7 條措辭精度，開發者選擇修完再驗）、r5 WARN（4 條 advisory，開發者以 r5 版本簽核，其中 no-heading、單一「research document」句轉為實作約束）；tasks verifier 1 次 WARN（partial 註冊併入 T1、補 plan Step 對應）；review round 1 WARN（R1-1 open，已於 round 2 確認 fixed）。

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/skill-authoring.md`：shared partials 清單加入 `external-research`，Pitfalls 記錄 no heading／no reference citation 與「partial 每個 process 只註冊一次」的 mutation 寫法。
