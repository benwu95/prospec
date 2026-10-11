# drop-legacy-break-glass-gate-text — Archive Summary

- **Archived**: 2026-10-11
- **Original Created**: 2026-10-11T02:38:45.604Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/377

## User Story

- **US-1**：身為依 `prospec status` 推進 change 的開發者，我希望 plan／tasks verifier 閘門的 `gate:` 行只列出能實際通過閘門的紀錄方式，照著路由輸出執行時不會被 `prospec change log` 拒收，也不會寫出不讓 change 前進的紀錄。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Low | `src/lib/status-router.ts` 的 `PLAN_VERIFIER_GATE`／`TASKS_VERIFIER_GATE` 刪除 Break-Glass 括號句，移除不再使用的 `BREAK_GLASS_PREFIX` import；`next`／`code`／`reasons` 不變 |
| tests | Low | `status-router.test.ts` 以 `[code, blockingGates]` 精確等值釘住四條 verifier 路由；依 fixture 檔頭與 Routing Flow 的退場規則刪除 `tests/fixtures/legacy-status-router.ts` 與 `status-router-equivalence.test.ts`；移除只剩該測試使用的 `randomRoutingFacts` |
| Knowledge／計數 | Low | `routing-flow.md` 第 7 步與 tests README 移除已刪檔案的引用；`pnpm counts` 更新測試數 7754 → 7746、unit 5653 → 5645、檔案 305 → 304 |

## Requirements

quick scale，無 delta-spec。Archive Entry Gate 的 spec-impact 判斷：無影響。Feature Spec 沒有 REQ 描述 verifier gate 文字或 legacy router fixture；REQ-LIB-103、REQ-TESTS-133、REQ-TESTS-134 規範 rule table 與流程圖，本 diff 未觸及；REQ-LIB-088、REQ-SERVICES-070 的 legacy Manual override 讀取路徑不變。略過 graduation。

## Completion

- **Tasks**: 4/4 code（100%）；[M] 1、[V] 3 皆完成（T3 刪除前以 equivalence 測試證明只有 gate 文字改變：9/9 grid 與 200,000 組隨機 facts 0 不一致；T8 的 `knowledge:check` 於 commit 後通過）
- **Acceptance Criteria**: 3/3（US-1.1–US-1.3；revision 1）

## Review & Verify

- **Review**: 2 rounds, 0 critical / 1 major（已修）— R1-1（test-quality）新測試只對 `BREAK_GLASS_PREFIX` 字面做負向比對，不含前綴的替代句加回時仍綠；改為精確等值後 M1–M5 五個 mutation 皆轉紅。R1-2（minor，parallel-site）verifier rubric FLAWS 列仍寫「or exercise Break-Glass Override」，依開發者決定移入 #378。fresh-subagent；lenses：correctness、security、spec-architecture、test-quality、docs-claims、parallel-site。
- **Verify**: Grade S — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance not-applicable、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7742 passed／4 skipped）。
- **Quality Log**:
  - prospec-tasks WARN ×1（Task Verifier advisory）：tests README helpers 列失準、`pause-no-verifier` 去重超出範圍、T8 情境 ID 與 `pnpm build`、T3 執行方式、`knowledge verify` 未列；皆於 tasks 站併入（去重改為不做）。
  - prospec-review WARN（round 1）：R1-1，見上；round 2 PASS。
