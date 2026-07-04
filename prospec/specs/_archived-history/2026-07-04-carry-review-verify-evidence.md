# carry-review-verify-evidence — Archive Summary

- **Archived**: 2026-07-04
- **Original Created**: 2026-07-04
- **Quality Grade**: A
- **Issue**: [#56](https://github.com/benwu95/prospec/issues/56) · **Commits**: `9b23efb` (feat) · `276b75c` (docs)

## User Story

As a 事後回溯某變更 review/verify 決策的維護者,
I want 每個新封存的 `_archived-history/{date}-{name}.md` 自帶 `## Review & Verify` 節、且 ledger 以它為 canonical 證據指標,
So that review/verify 證據隨 committed audit trail 一起留存，不再隨 gitignored bundle 蒸發。

共 3 個 Stories：US-1（前瞻機制：新封存自帶該節）、US-2（ledger 證據指標）、US-3（回填 bundle 已失舊案）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | `archive-format.hbs` §6 Review & Verify 格式節；`prospec-archive.hbs` Phase 2 寫入步驟＋Gate＋NEVER；`promotion-format.hbs` Harvest 證據指標 |
| tests | Medium | `skill-format.test.ts` +5 section-scoped 契約斷言（mutation-verified、fenced-`## ` 截斷感知）；測試計數 1860→1865（contract 575→580）|

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-126 | ADDED | archive-format 定義 Review & Verify 節（grade／criticals-majors＋findings 節選／quality_log digest；no-fabrication；backfilled 附 Source provenance）|
| REQ-TEMPLATES-127 | ADDED | archive Phase 2 產 summary 時寫入該節（＋Phase 2 Gate＋NEVER）|
| REQ-TEMPLATES-128 | ADDED | promotion-format Harvest 明示 committed 證據指標 `_archived-history/{date}-{name}.md` |
| REQ-TESTS-041 | ADDED | 契約測試釘住寫入步驟與格式節（section-scoped＋負向＋mutation-verified）|

## Completion

- **Tasks**: 8/8 code tasks（100%）；`[M]`×1、`[V]`×3 已執行
- **Acceptance Criteria**: US-1~US-3 全數 met（SC-001 由本次封存 dogfood 端到端證明——本摘要即自帶該節）

## Review & Verify

- **Review**: `/prospec-review` 1 輪收斂 review-clean，0 critical / 0 major；2 nits 已修（add-token-measurement-harness／add-mcp-server 回填的 root-cause 過度概化，PB-003 精確度）——獨立 fresh-context reviewer 實測確認契約非假綠（`sectionOf` fenced-`## ` 截斷前 token、mutation 可轉紅）
- **Verify**: Grade **A**，5+1 維度全 PASS（1/5 task-completion、2/5 四 REQ 全合規、3/5 Constitution MUST 全 PASS、4/5 drift 8/8 PASS 0 stale、5/5 1865/1865 綠、6 skip 無 UI）
- **Quality Log**: review WARN（review-clean＋PB-004 計數同步待辦）、verify WARN（grade A 保守註記）、knowledge-update PASS（1860→1865 同步、drift 8/8）——待辦皆於歸檔前解

## Knowledge Update

- `templates`／`tests` 模組 README 已同步描述 archive Review & Verify 能力（PB-005，未引未畢業 REQ ID）
- 測試計數 1860→1865（contract 575→580）已重導至 README.md／README.zh-TW.md／index.md／tests README（PB-004）
- REQ-TEMPLATES-126/127＋REQ-TESTS-041 graduated → `sdd-workflow.md`（US-6）；REQ-TEMPLATES-128 → `feedback-promotion.md`（US-1）
- 另本變更回填 50 筆歷史 `_archived-history` 摘要之 Review & Verify 節（4→54；清單見 archive bundle 內 backfill-manifest.md）
