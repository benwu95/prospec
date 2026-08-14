# route-change-history-to-host — Archive Summary

- **Archived**: 2026-08-13
- **Original Created**: 2026-08-13
- **Quality Grade**: A
- **Issue**: PR #168

## User Story

As a prospec maintainer archiving a change,
I want the graduation Change History row written to whichever file holds the `## Change History` section — the mother spec or a registered slice — and any absence surfaced loudly,
So that an over-budget mother spec can move its Change History into a slice without silently losing future graduation rows.

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | High | `syncToFeatureSpecs` 依承載檔案路由 Change History 畢業列(母檔或 slice);新 `missingChangeHistory` worklist(`SpecSyncResult`/`ArchiveResult`) |
| lib | Low | `hasChangeHistorySection` 行首錨定、fence-masked 宿主偵測(`spec-headings`) |
| cli | Low | `archive-output` 以 loud、non-blocking 方式渲染 `missingChangeHistory` finding |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-SERVICES-018 | MODIFIED | Spec Sync 依承載 `## Change History` 的檔案路由畢業列(母檔優先,再 slice);缺宿主以具名 feature 的 finding 發聲而非靜默漏失 |

## Completion

- **Tasks**: 13/13 code tasks (100%),另 1 個 `[V]` 驗證任務已執行
- **Acceptance Criteria**: US-1 四情境全數滿足(母檔照舊 / slice 路由 / 母檔 body 不變 / 無宿主 loud finding)

## Review & Verify

- **Review**: 1 round, 0 critical / 0 major — review-clean(獨立 fresh-context、五面向:correctness、security、spec-architecture、maintainability、test-quality)
- **Verify**: Grade A;machine 1/5 PASS · 4/5 WARN · 5/5 PASS、judgment 2/5 PASS(fresh context)· 3/5 PASS(8/8 rules)· 6 not-applicable;`pnpm test` exit 0(3810 passed)
- **Quality Log**: 1 WARN — 4/5 knowledge-health:services/cli 模組 README 依 git 時間戳為 pre-existing stale(非本變更引入;已於 feature commit 同步)

## Knowledge Update

- `prospec/ai-knowledge/modules/services/spec-sync.md`(已同步:五→六 worklists + host routing)
- `prospec/ai-knowledge/modules/cli/README.md`(已同步:五→六 WARNING-class worklists)

## Notes

Dogfood:本變更的畢業列(`2026-08-13 | route-change-history-to-host | MODIFIED REQ-SERVICES-018`)經新增的 `locateChangeHistoryHost` 路徑寫入 `archive-service.md` 母檔的 `## Change History`——以自身程式碼記錄自身的畢業。後續 follow-up:實際將 `sdd-workflow.md` 等超預算母檔的 `## Change History` 移入 slice 以回收預算(本變更為其 production 前置)。
