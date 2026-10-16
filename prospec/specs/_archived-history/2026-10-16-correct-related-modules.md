# correct-related-modules — Archive Summary

- **Archived**: 2026-10-16
- **Original Created**: 2026-10-16
- **Quality Grade**: A
- **Issue**: #394
- **Plan Decision**: plan (graded_by: human)

## User Story

作為使用 Prospec workflow 的開發者，我要由 Agent／開發者明確宣告 related-module scope，並可透過 CLI 更正既有誤判，避免 keyword 推測擴大 archive gate；unknown 不得當成 none。

## Affected Modules

| Module | Impact | Description |
|---|---|---|
| types | Low | optional read 保留 absent／empty 契約。 |
| lib | Medium | unknown gap、獨立分類聯集與 map validation。 |
| services | Medium | explicit creation、完整 scope 更正、unknown auto-draft failed。 |
| cli | Medium | list／empty 輸入及 missing／conflict 拒收。 |
| templates | Medium | Agent 判斷與對帳、CLI ownership、雙語文件與 lifecycle。 |
| tests | Medium | 三態、legacy migration、independent blockers、partial failure 與 fixtures。 |

## Requirements

| REQ ID | Status | Description |
|---|---|---|
| REQ-CHNG-003 | MODIFIED | Explicit related-module scope at story creation |
| REQ-TYPES-064 | MODIFIED | Metadata Validation Error and Bare Module Names |
| REQ-SERVICES-124 | MODIFIED | Replace declared related-module scope |
| REQ-CLI-060 | MODIFIED | `prospec change related-modules` corrects an existing change's related modules |
| REQ-LIB-097 | MODIFIED | Shared delta-spec affected-module classifier and union knowledge-sync gate |
| REQ-TESTS-128 | MODIFIED | Knowledge-sync gate union, parity and wording pins |
| REQ-TEMPLATES-032 | MODIFIED | New-Story Skill INVEST Guidance |
| REQ-TEMPLATES-150 | MODIFIED | metadata.yaml Format Reference |
| REQ-TEMPLATES-161 | MODIFIED | Workflow Skills Delegate Scaffold, Status and quality_log |
| REQ-TEMPLATES-083 | MODIFIED | Archive Knowledge Sync Entry Gate (backstop) |
| REQ-TEMPLATES-162 | MODIFIED | knowledge-update Skill Delegates the Mechanical Half |
| REQ-SERVICES-093 | MODIFIED | Auto-draft delegates scaffolding to the change creator |
| REQ-TESTS-096 | MODIFIED | Auto-draft behavior is pinned by tests, not by shape assertions |

## Completion

- **Tasks**: code 24/24（100%）；verification 2/2、manual handoff 1/1。
- **Acceptance Criteria**: 11/11 經獨立核對符合；revision 2 為 plan-time late-capture，不能宣稱完整 story-time intent adjudication。
- **Baseline**: 隔離案例 omitted artifacts 2→0、related modules 15→1、metadata-only stale 14→0；empty persistence、unknown gap 與 absent→empty correction 均達成。

## Review & Verify

- **Review**: 1 round，0 critical／0 major；fresh context 完成八個 lenses，review-clean。
- **Verify**: Grade A；machine tasks／Knowledge／tests PASS，Constitution 8/8 PASS；spec-compliance 因 late-capture 記為 not-adjudicated，13/13 REQs 獨立符合；design not-applicable。
- **Tests**: Vitest 4.0.18、Node 24.20.0、macOS；317/317 files，8355 PASS、4 skip／8359；獨立 focused 475/475 PASS；5/5 applied mutants detected。
- **Coverage**: 隔離完整 suite Lines 13508/13820（97.74%）、Branches 10738/11787（91.10%）；stdout 保存，snapshot receipt 後原 JSON 已移除。
- **Quality Log**: plan r2 WARN（四欄 gap 舊宣稱未排除 unknown）已修正且 r3 PASS；tasks r1 FAIL（[M] 混入規格編修）已拆分且 r2 PASS；verify late-capture 限制保留。
- **Disclosure**: 正式 test gate 首輪的 token-budget／offline fixture 失敗已透過 T27 修正，未提高 ceilings，後續全套 PASS；archive 時 Windows／Node 22 CI 尚待 PR 執行。

## Knowledge Update

六個模組 README、freshness、counts 與生成物已在 final review／tests／verify 前同步；feature commit aba1ab58 後，committed-range knowledge gate 已實際通過。英文／繁中公開文件同步；未知 scope 的 correction 不代表語意完整性證明。

## Archive Completion

13/13 REQ bodies 已核對，Story-level explicit-scope 範例收斂；product map 保留 16/16 active features，raw-scan 已刷新。harvest 累計兩個既有 keys，未晉升。archive 後完整 coverage 317/317 files、8355 PASS、4 skip；committed-range Knowledge gate、counts、22 項 drift checks 均完成（保留 knowledge-size WARN）。
