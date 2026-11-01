# encode-non-convergence-discipline — Archive Summary

- **Archived**: 2026-11-01
- **Original Created**: 2026-10-31T15:25:16.086Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/432
- **Plan Decision**: plan (graded_by: human)

## User Story

把本 repo 對抗式迴圈（plan verifier、review）反覆不收斂的九條可通用教訓寫進出貨的 skill 與 reference，每條一句通用描述、掛在 agent 做該決策時正在讀的段落：explore Impact Space 與 plan Phase 6 分流處理「輸入沒有合法範圍」；explore 與 new-story Phase 1 處理「只為下一張移除而保留的行為」；`_external-research` partial 要求先讓外部工具自己產生判定、工具語意只套用在它自己產生的輸入；plan re-compare 與 candidate-evaluation 列出替代機制新增的 gate 依賴，仍解讀同一工具輸出者屬同一機制；delta-spec-format 不把外部工具在多來源下的最終結果寫成 Spec 宣稱；`_human-decision` 以說過的停止條件為第一建議、連續不收斂先量化不處理的影響；plan-verifier-rubric 以一次逐子句分類收斂措辭迴圈；review-format 要求推翻宣稱的反例落在主詞既有定義內。不新增 gate、停止點或人類決策點。

**Acceptance**：3 個 User Story、10 條凍結情境（baseline revision 1，未 amend）。新 Story 以 `sdd-workflow` US-56 落地，archive 時手建 `sdd-workflow/us-56.md` slice。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Modified | 9 個模板各加一句；plan NEVER 刪除 8 條與正文同義的項目，使 `missing-receipt` closure（6,793／6,807）不上調 |
| lib | Modified | `bundled-templates.ts` 重產（無邏輯變更） |
| tests | Modified | `skill-format` 新 describe：12 條子句以關鍵片段 section-scoped 斷言＋逐條 mutation；startup-loading reference 總和 anchor 51,885 → 52,315、cumulative 90,141 → 90,402（raised, not earned，依據為 plan 站開發者決定，記於 proposal Edge Cases） |
| docs | Modified | `docs/concepts/workflow.md` 與 zh-TW twin 的 Skill instruction quality 段各補一句 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-259 | MODIFIED | Plan triage 新增「無合法範圍輸入的邊界 finding → 前置 change scope question」路徑；re-compare 列出新增 gate 依賴、同一工具輸出屬同一機制 |
| REQ-TEMPLATES-260 | ADDED | Explore and new-story bound a change's scope before design |
| REQ-TEMPLATES-261 | ADDED | The external-research partial lets a tool produce its own judgment |
| REQ-TEMPLATES-262 | ADDED | Candidate comparison names the gates an option makes newly dependent |
| REQ-TEMPLATES-263 | ADDED | Spec claims leave an external tool's end result to a real-tool test |
| REQ-TEMPLATES-264 | ADDED | The human-decision contract keeps stated stop conditions and weighs leaving work undone |
| REQ-TEMPLATES-265 | ADDED | The plan-verifier rubric converges a wording-only loop with a one-time clause audit |
| REQ-TEMPLATES-266 | ADDED | A review finding refutes a claim only within its subject's definition |
| REQ-TESTS-144 | ADDED | Non-convergence rules are pinned section-scoped |

## Completion

- **Tasks**: 14/14 code tasks (100%)，4/4 [M]/[V]（不計入）
- **Acceptance Criteria**: 10/10（verify 2/5 逐 REQ 9/9 PASS，無情境偏離）

## Review & Verify

- **Review**: 2 輪（round 2 review-clean），0 critical / 2 major，6 minor — R1-1 major：explore 系列切分問題漏掉「只為下一張移除而保留」的限定（docs 中英同類）；R1-2 major：簽核時帶進 implement 的措辭決定未同步進將畢業的 delta-spec（REQ-TESTS-144 的「carries no instruction to stop」為假、REQ-259 缺 re-verify、REQ-265 缺「FLAWS 分流後」）；R1-3～R1-5 knowledge 措辭、R1-6 bullet 位置、R1-7 測試改以關鍵片段斷言；7 項皆 fixed。R2-1 minor（REQ-TESTS-144 mutation 單位寫成「that line」）已於記錄 review baseline 前修正 delta-spec，review.md 仍列 open。fix-induced 比例 12.5%。
- **Verify**: Grade S（fresh-subagent）；task-completion、knowledge、tests 機器維度 PASS，delta-spec-compliance PASS（9/9 REQ），constitution PASS（8/8），design not-applicable；`pnpm test` exit 0（8,926 passed、4 skipped）。
- **Quality Log**: plan verifier 4 輪 — r1 FAIL（SC 缺量測 baseline、Claim writing 共用清單未決）、r2 WARN、r3 FAIL（reference 總和與 cumulative 兩個 shrink-only anchor 未列；達到事先說好的停止條件，開發者決定依實測上調）、r4 WARN（無為假子句即收斂，開發者簽核並把 8 條 WARN 帶進 implement）；tasks verifier WARN（forbidden 清單完整性、Phase 6 子 bullet 數、T12 補測 closure）；review round 1 WARN（2 major 帶入 round 2，確認 fixed）。

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md`：`_human-decision` 契約補停止條件與停止代價。
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`：`external-research` 摘要、review-format finding 內容規則、`missing-receipt` closure 以刪除重述騰空間的 Pitfall。
