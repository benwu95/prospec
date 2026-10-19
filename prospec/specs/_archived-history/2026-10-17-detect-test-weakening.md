# detect-test-weakening — Archive Summary

- **Archived**: 2026-10-17
- **Original Created**: 2026-10-16
- **Quality Grade**: A
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 使用 `prospec-review` 審查 change 的開發者,
I want test-quality lens 把「既有測試被改弱、刪除或停用」與「測試關卡設定被放寬」列為 critical,
So that Agent 無法用降低測試標準或放寬設定的方式讓 change 通過 review。

靈感來源：HWDC-2026 workshop（iangithub/HWDC-2026）的 TEST-07「不得刪除、跳過或弱化測試」與 STEP 11 關卡演練。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | Medium | `review-lenses-content.hbs` Test-Quality Lens：適用條件涵蓋 test-gate configuration、三條 loosening critical 準則、Basis 段落（依據來源、review 前限定、file:line 引用、一律不 auto-fix） |
| types | Low | `review-lenses.ts` test-quality `summary` 加上 test-gate configuration（reviewer 據此挑選 conditional lens） |
| tests | Medium | `TEST_QUALITY_CRITERIA` baseline、`Loosened tests` contract describe；`REFERENCE_CEILING_ANCHOR` 51,105 → 51,341（放寬依據寫於 proposal Edge Cases；原為 51,381，rebase 到含 correct-related-modules 的 main 後依實測值重算） |
| lib | Low | `bundled-templates.ts` 由 `pnpm bundle` 重新產生 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-251 | ADDED | test-quality lens 將弱化既有 assertion、新增 disable/focus 標記、放寬測試關卡在無依據時評為 critical；依據需在 review 前寫好；一律 escalate、不 auto-fix |
| REQ-TESTS-138 | ADDED | 三條 loosening 準則由 criteria-table baseline 與 section-scoped contract 斷言固定，12 個 mutation 全部轉紅 |

## Completion

- **Tasks**: 8/8 code tasks (100%)；[M] 2/2、[V] 3/3 已完成
- **Acceptance Criteria**: 5/5 情境有實作；US-1.1（snapshot 邊界）與 US-2.1（source-only lint 抑制）經 verify 2/5 判 WARN

## Review & Verify

- **Review**: 6 round(s)（implement 後 3 輪＋verify 後 Knowledge sync 再審 3 輪），1 critical（R1-severity-contract-contradiction，獨立 verifier 判 not-found，未修）／ 5 major（R1-loosening-fix-vs-autofix-pin、R1-basis-history-unrecorded 已修；R2-loosening-pins-phrase-only、R3-snapshot-rebaseline-dropped 仍 open）／ 4 minor（R2-r1-fix-ripple-stale、R4-shrink-only-sibling-stale 已修；R1-lint-suppression-applicability、R4-knowledge-size-growth 仍 open）
- **Verify**: Grade A — machine 1/5、4/5、5/5 PASS；2/5 delta-spec-compliance WARN（fresh-subagent）；3/5 constitution PASS（8/8 規則）；6 not-applicable；`pnpm test` 8,296 passed / 4 skipped
- **Quality Log**:
  - prospec-new-story WARN：CLI 自動帶入的 related_modules 與 proposal 分析不一致
  - prospec-plan：verifier r1–r3 WARN（summary 才是 conditional lens 觸發點、token anchor 只剩 49 tokens、依據自證與 anchor 調高本身的放寬），r4 PASS；人工 sign-off「ok」
  - prospec-tasks WARN：task 描述精度與 mutation 次數
  - prospec-review WARN（多輪）：見上列 open majors／minors；有一筆 round-close 紀錄寫在 merge 因 `--round` 序號被拒之前，已由下一筆取代並註明
  - prospec-delegation WARN：verify grader 因 API 連線錯誤（ENOTFOUND）未寫 payload 即中止，已 re-spawn
  - prospec-verify：grade A × 3（每次輸入變動後重驗）
- **其他過程紀錄**：一次 `--record-tests` 在系統高負載（load avg 26，Spotlight `mds_stores`）下 timeout 失敗，單獨重跑失敗檔 193 tests 全綠、負載下降後全套重錄 exit 0；session 跨 UTC 日導致 Knowledge 戳記被判過期，重新蓋章並 amend 進 feature commit。

## Follow-ups

- R3：在 weakened 列補「調高 expected 常數／重錄 snapshot 或 fixture」並 MODIFIED REQ-TEMPLATES-251
- R1-lint：讓只在 source 檔新增 lint 抑制的 diff 也能觸發 lens（或把 lint 抑制移出此 lens）
- 量測：以 `prospec learn yield` 觀察三條 loosening 準則的實際命中；若有命中，考慮以 CI／`prospec check` 的機械檢查（新增 `.skip`/`.only`、assertion 數減少、`test_command` 變動）取代 LLM 判斷
