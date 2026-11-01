# add-req-language-gate-rules — Archive Summary

- **Archived**: 2026-11-01
- **Original Created**: 2026-11-01T01:22:35.475Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/433
- **Plan Decision**: plan (graded_by: human)

## User Story

在三個站點各補一條本 repo 已踩過、出貨 skill 沒有的規則，每條一句通用描述：knowledge-update 撰寫 trust zone 知識檔時只引用 Feature Spec 已定義的 REQ ID（本 change 新增或修改的 REQ 以行為描述），蓋章前以 `prospec check` 確認 `req-references` 沒有 dangling 引用；`_language-policy` partial 涵蓋交給 CLI、會寫進 change artifact 的自由文字（路徑、指令、enum 與 CLI 比對的固定前綴不翻譯），review 收輪與 verify 記錄的 `--warning` 佔位同樣註明 artifact language；review 與 verify 整段閱讀 gate 指令輸出（斷路器等訊息在成功時也可能出現在中段），會改變狀態的步驟以自身 exit code 判斷成敗。不改 CLI、不新增 gate 或停止點。

**Acceptance**：3 個 User Story、9 條凍結情境；baseline revision 2（review R3-1 後 amend US-1.2 為「確認沒有 dangling 引用」，origin late-capture）。新 Story 以 `sdd-workflow` US-57 落地，archive 時手建 `sdd-workflow/us-57.md` slice。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Modified | `_language-policy`、`prospec-knowledge-update`、`prospec-review`、`prospec-verify` 各加規則；`prospec-plan`、`prospec-tasks` 刪 3 條重述正文的 NEVER 項（`missing-receipt` closure 不上調） |
| lib | Modified | `bundled-templates.ts` 重產（無邏輯變更） |
| tests | Modified | `skill-format` 新 describe（5 條規則 section-scoped 斷言＋逐條 mutation＋被刪 NEVER 的正文承載斷言）；cumulative anchor 90,402 → 91,150、review mandatory ceiling 8,142 → 8,215、closure ceiling quick 16,516 → 16,575、proven-backfill 23,694 → 23,826、stale-delta 13,156 → 13,232（raised, not earned，依據為 plan 站開發者決定，記於 proposal Edge Cases） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SKILL-012 | MODIFIED | Language Policy partial 涵蓋交給 CLI 的自由文字；includer 清單補為實際 12 個 |
| REQ-TEMPLATES-267 | ADDED | Knowledge-update cites only graduated requirements |
| REQ-TEMPLATES-268 | ADDED | Review and verify read whole gate output and judge each state-changing step by its own exit code |
| REQ-TEMPLATES-269 | ADDED | Review and verify write their quality-log warnings in the artifact language |
| REQ-TESTS-145 | ADDED | Station rules for references, CLI free text and gate output are pinned section-scoped |

## Completion

- **Tasks**: 10/10 code tasks (100%)，4/4 [M]/[V]（不計入）
- **Acceptance Criteria**: 9/9（verify 2/5 fresh grader 逐 REQ 5/5 PASS、`scenario_findings` 為空；因 late-capture，CLI 將 2/5 記為 not-adjudicated）

## Review & Verify

- **Review**: 3 輪，0 critical / 0 major，6 minor — R1-1 gate 句未限定為判斷成敗（`review merge` 斷路器觸發時 exit 0）；R1-2 knowledge-update 斷言範圍為整個 Phase 3；R1-3 `mandatory-policies.json` note 缺 Re-measured 紀錄；R1-4 partial 未涵蓋 CLI 比對的固定前綴；R2-1 `req-references` 在尚無 Feature Spec 時為 skipped 而非 pass；以上皆 fixed 並經下一輪 reviewer 確認。R3-1（proposal FR-001 與凍結情境 US-1.2 仍寫「通過」）於第 3 輪後修正 FR-001 並 amend US-1.2，review.md 仍列 open。fix-induced 比例 20.0%／33.3%，未觸發斷路器。
- **Verify**: Grade A（fresh-subagent）；task-completion、knowledge、tests 機器維度 PASS，delta-spec-compliance not-adjudicated（acceptance baseline late-capture），constitution PASS（7 條 PASS、Atomic Commits 於 commit 前為 not-applicable），design not-applicable；`pnpm test` exit 0（8,940 passed、4 skipped）。
- **Quality Log**: plan verifier 7 輪 — r1 FAIL（counts 說明壓縮碰到 REQ-TEMPLATES-130／REQ-TESTS-121 釘住的文字）、r2／r3 WARN（措辭與漏列 fixture）、r4 FAIL（5 條 NEVER 壓縮候選中 2 條被測試以片段或 regex 釘住；改以實際刪除＋執行測試做整類稽核，剩 3 條）、r5～r7 WARN（r7 無為假子句即收斂）；開發者簽核並決定三個範圍問題不納入（abandon／Manual override 理由文字、`change delegate --spawn-failed --reason`、既有無關 dangling 引用）；tasks verifier WARN（T12 [V] 含產生 diff 的工作，已移至 T11）；verify WARN：acceptance baseline late-capture。

## Knowledge Update

- `prospec/ai-knowledge/modules/templates/README.md`：knowledge-update 3a 只引用已定義 REQ、蓋章前確認 `req-references`。
- `prospec/ai-knowledge/modules/templates/skill-authoring.md`：`language-policy` 摘要補 CLI 自由文字；review／verify gate 句與 `--warning` 佔位成對維護的 Pitfall。
