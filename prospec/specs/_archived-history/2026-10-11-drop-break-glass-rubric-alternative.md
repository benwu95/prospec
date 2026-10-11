# drop-break-glass-rubric-alternative — Archive Summary

- **Archived**: 2026-10-11
- **Original Created**: 2026-10-11T06:03:50.566Z
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/378

## User Story

- **US-1**：身為依 verifier rubric 處理 FLAWS 判定的開發者（或代其執行的 orchestrator agent），我希望 plan／tasks verifier rubric 的 FLAWS 列只指示修正 plan／tasks 產物，以免把 Break-Glass Override 誤讀成可取代修正、讓 station 前進的路徑。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Low | `references/plan-verifier-rubric.hbs`、`references/tasks-verifier-rubric.hbs` 的 Verdict 表 FLAWS 列 Action 刪除「, or exercise Break-Glass Override」；`_verifier-rubric-base.hbs` 的 Break-Glass Override 段不動；`.claude`／`.agents` 下 8 份部署副本以 `agent sync` 重生 |
| lib | Low | `pnpm bundle` 重生 `src/lib/bundled-templates.ts`（只有兩個模板字串改變） |
| tests | Low | `skill-format.test.ts` 新增 `it.each`，以 Verdict 表結構精確等值釘住兩份 rubric 的 FLAWS Action；`assertFlaws` 刪除 Action 欄的 Break-Glass 斷言（只保留 REQ-TESTS-089 要求的 Condition 斷言）；`startup-loading-baseline.json` 重錄 plan-verifier-rubric 2,235 → 2,226、tasks-verifier-rubric 1,538 → 1,529，ceiling 不動 |
| 計數 | Low | `pnpm counts` 更新測試數 7746 → 7748、contract 1721 → 1723（README 雙語、docs、CONTRIBUTING、index、module-map、tests README） |

## Requirements

quick scale，無 delta-spec。Archive Entry Gate 的 spec-impact 判斷：無影響。沒有 REQ 規定 FLAWS 列的 Action 欄要列出 Break-Glass；REQ-TEMPLATES-183 的「WHEN false positives occur, THEN the developer may exercise Break-Glass Override…」描述的是覆寫機制，由保留的 Break-Glass Override 段承擔；REQ-TEMPLATES-182 的「(Break-Glass Override unchanged)」同樣指機制不變；REQ-TESTS-089 只要求涵蓋 FLAWS Condition；REQ-TESTS-116 的精確 baseline 已重錄。Task Verifier、review 與 verify grader 三方獨立判讀一致。略過 graduation。

## Completion

- **Tasks**: 3/3 code（100%）；[M] 2、[V] 2，其中 T7（CI 對等檢查）的 `knowledge:check` 於 commit 後通過，其餘檢查（lint、typecheck、build、test:coverage、counts:check、agents:check、`prospec check --strict` 0 fail）commit 前已通過
- **Acceptance Criteria**: 3/3（US-1.1–US-1.3；revision 1）

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean。fresh-subagent；lenses：correctness、security、spec-architecture、docs-claims、parallel-site、test-quality。
- **Verify**: Grade S — machine: task-completion／knowledge／tests PASS；judgment（fresh-subagent）: delta-spec-compliance not-applicable、constitution PASS（8/8）、design not-applicable；`pnpm test` exit 0（7744 passed／4 skipped）。
- **Quality Log**:
  - prospec-tasks WARN ×1（Task Verifier advisory）：T3 刪除 Action 欄斷言後缺正向守護、T4 baseline 重錄應為 code 任務、REQ-TEMPLATES-182 括號句的讀法待 archive 確認；前兩項於 tasks 站併入（新增精確等值斷言、T4 改為 code 任務），第三項於本 Entry Gate 確認不需 MODIFIED。
  - prospec-review PASS（round 1）。
