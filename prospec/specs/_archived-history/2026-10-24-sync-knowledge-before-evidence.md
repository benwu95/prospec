# sync-knowledge-before-evidence — Archive Summary

- **Archived**: 2026-10-24
- **Original Created**: 2026-10-24T06:36:30.735Z
- **Quality Grade**: A
- **Issue**: https://github.com/benwu95/prospec/issues/411
- **Plan Decision**: plan (graded_by: human)

## User Story

As a 依 `prospec status` 推進 SDD 站點的開發者（或代理），
I want Knowledge 同步發生在最終測試紀錄與 review 基準之前——implement 收尾先同步並蓋章、路由器在 review 前攔下 Knowledge 缺口、「記錄證據是最後一個修改」只在 entry config 定義一次、同日重複蓋章不改寫 `module-map.yaml`，
So that 測試只跑一次、review 只跑一輪，不再因同步晚做而讓 review／test 證據過期、整輪重來。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| types | Low | `SDD_STATIONS` 站序改為 `implement → knowledge-update → review → verify → archive` |
| lib | Medium | `status-router` 以共用 `knowledgeRules` 在未 review 的 `implemented` 先判 Knowledge 缺口（halt 先於 route），`verified` 輸出不變；`knowledge-sync` 新增 `readHeadModuleStamps`（`git show HEAD:./<posix rel>`，失敗回 null） |
| services | Medium | `status.service` 在 `verified` 與未 review 的 `implemented` 計算缺口；`knowledge-verify.service` 同日且晚於 HEAD 的模組略過，全部略過不寫檔 |
| cli | Low | `knowledge verify` 輸出 skipped 行；`change progress` 完成提示改為收尾順序 |
| templates | High | entry config 定義通則；implement／promote-backfill 收尾同步；verify／review／archive／ff／cascade-protocol／verify-backfill／handoff／status-lifecycle 移除副本與重跑常態描述、改站序 |
| tests | Medium | router／status／knowledge verify（含真實 git repo）／formatter 單元測試與 contract；startup-loading baseline 更新 |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-255 | ADDED | Evidence recording order defined once in the entry config |
| REQ-TESTS-142 | ADDED | Coverage for Knowledge sync before review |
| REQ-TYPES-070 | MODIFIED | 站序：knowledge-update 位於 implement 與 review 之間（breaking-change，經人工核可） |
| REQ-LIB-035 | MODIFIED | 未 review 的 `implemented` 先判 Knowledge 缺口（breaking-change，經人工核可） |
| REQ-SERVICES-070 | MODIFIED | `collectFacts` 在 `verified` 與未 review 的 `implemented` 計算缺口 |
| REQ-TEMPLATES-228 | MODIFIED | backfill 軌跡與 promote 列改新站序 |
| REQ-TEMPLATES-192 | MODIFIED | cascade backfill 軌跡改新站序 |
| REQ-TEMPLATES-129 | MODIFIED | 改題為 implement／promote 收尾同步（預防點） |
| REQ-TEMPLATES-045 | MODIFIED | verify 不再站內同步 Knowledge（breaking-change，經人工核可） |
| REQ-TEMPLATES-207 | MODIFIED | verify 只回報模組，同步屬 implement 收尾（breaking-change，經人工核可） |
| REQ-SERVICES-090 | MODIFIED | `knowledge verify` 同日且晚於 HEAD 略過（breaking-change，經人工核可） |
| REQ-TESTS-090 | MODIFIED | 蓋章指示的 contract 改釘 implement |
| REQ-TESTS-128 | MODIFIED | 模組集合措辭改釘 promote-backfill 收尾 |

## Completion

- **Tasks**: 20/20 code tasks（100%）；[M]/[V] 5/5 已完成
- **Acceptance Criteria**: 12/12 凍結情境（verify 2/5 逐 REQ 13/13 PASS、無語意偏離）

## Review & Verify

- **Review**: 2 round(s)，1 critical（已修）／5 major（已修）。R1-1 critical（`change progress` 完成提示與 implement Phase 5 直接指向 review、跳過同步）經獨立 verifier 確認後以 fail-then-pass 釘修正；R1-2、R2-3 經 verifier 判 not-found（minor）；R1-3～R1-5、R2-1、R2-2、R1-6 依使用者選擇全修。fix_induced_ratio 第 2 輪 28.6%。
- **Verify**: Grade A（machine：task-completion／knowledge／tests PASS；judgment：constitution PASS、design not-applicable，皆 fresh-subagent；delta-spec-compliance 因 late-capture 記為 not-adjudicated，grader 逐 REQ 13/13 PASS）；`pnpm test` 322 檔／8,687 passed、4 skipped；`test:coverage` statements 96.44%、branches 91.22%。
- **Quality Log**: plan verifier 第 1～3 輪 WARN（R1：promote-backfill、網站、routing-facts-grid 等遺漏；R2：REQ-TEMPLATES-118 交接、README 行數上限、反向測試釘；R3：跨 UTC 日風險、故事層收斂、symlink 讀取）→ 第 4 輪 PASS，人工 plan 簽核；tasks verifier WARN（README:27、網站字面釘、T17 順序、測試路徑），皆已修入 tasks.md；verify 唯一 WARN 為 late-capture。

## Notes

- plan 站修正 US-3 情境（HEAD 讀不到照常寫入、需晚於 HEAD）走 `--amend-scenarios`，origin 記為 late-capture，verify 上限為 A。
- 略過條件比 issue 的「異於 HEAD」多要求「晚於 HEAD」，維持 `knowledge:check` 嚴格遞增規則；跨 UTC 日（蓋章與 commit 不同日）仍會判過期，根治依賴 #412。
- REQ-TESTS-116 與 workflow mandatory closure 兩組上限皆無提高：以等義壓縮新增文字，per-skill cumulative 88,789／88,807、quick scenario 16,516 以內。
- `pnpm build` 先跑 `tsc` 再重生 `bundled-templates.ts`，連結到 dist 的 global CLI 會落後一次 build；本 change 未處理，建議另開 issue。
- `prospec status --json` 在 `implemented` 可能回傳 `next: knowledge-update`、未宣告 `related_modules` 的 change 提前在 review 前停下，release notes 須註明；`docs/guides/upgrading` 版本段由發版時撰寫。
