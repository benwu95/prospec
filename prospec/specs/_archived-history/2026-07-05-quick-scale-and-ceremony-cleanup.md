# quick-scale-and-ceremony-cleanup — Archive Summary

- **Archived**: 2026-07-05
- **Original Created**: 2026-07-05
- **Quality Grade**: A

## User Story

As a prospec 使用者與維護者,
I want quick scale 在 verify/archive 真減量、無消費者的儀式欄位降級、skill 間規則衝突消除、archive metadata 防呆,
So that 流程重量與變更規模相稱，skill 指示彼此一致，殘缺 metadata 無法進入永久紀錄。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 7 skill `.hbs` 編修（verify quick 減量/condensed report、archive metadata gate + quick reframe、tasks [P]/~lines 選填、new-story INVEST advisory、5 站 Quality Gate 去重、commit 語意統一）+ entry.md/status-lifecycle 模板 |
| types | Medium | `DRIFT_CHECK_IDS` readme-counts→mcp-readme-counts 改名 + metadata-completeness 新增（9→10） |
| lib | Medium | drift-sources/drift-checker：mcp-readme-counts rename + collectMetadataCompleteness/evaluateMetadataCompleteness（null-parse guard） |
| services | Low | check.service 佈線 collectMetadataCompleteness |
| tests | Medium | metadata-completeness 通過/失敗/null-guard/S-A-clause 測試、drift id 集 9→10、issue-#67 skill 契約 block |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-134 | MODIFIED | verify quick scale-aware 減量（sdd-workflow） |
| REQ-TEMPLATES-135 | MODIFIED | archive quick 不比 standard 淨加重（sdd-workflow） |
| REQ-TEMPLATES-136 | MODIFIED | [P]/~lines 降選填（sdd-workflow） |
| REQ-TEMPLATES-137 | MODIFIED | INVEST 逐條稽核降 advisory（sdd-workflow） |
| REQ-TEMPLATES-138 | ADDED | design lifecycle 定位明文化（design-phase） |
| REQ-TEMPLATES-139 | MODIFIED | Knowledge Quality Gate 五處去重（sdd-workflow） |
| REQ-TEMPLATES-140 | MODIFIED | implement/verify commit 語意統一（sdd-workflow） |
| REQ-TYPES-054 | MODIFIED | readme-counts→mcp-readme-counts 改名（drift-detection） |
| REQ-TEMPLATES-141 | MODIFIED | Constitution Language Policy 豁免 AI Knowledge（ai-knowledge） |
| REQ-LIB-025 | ADDED | metadata-completeness drift check + archive Entry Gate（drift-detection） |

## Completion

- **Tasks**: 23/23 (100%) code tasks
- **Acceptance Criteria**: 4 SC met（quick 步驟數↓、儀式非必填、metadata 驗證有測試、全套件綠+命名一致+Language Policy 稽核不 FAIL）

## Review & Verify

- **Review**: 2 round(s), 4 critical / 4 major — review-clean。criticals 全修：collectMetadataCompleteness null-parse 崩潰、review-lens readme-counts 殘留、S/A grade clause 無釘死測試、CONSTITUTION:78 INVEST 前後矛盾；4 major（[P]-consumer 措辭、verify 6-sections vs condensed、Language-Policy association 測試、present-but-empty 欄位）亦修。
- **Verify**: Grade A（Ready to deploy）；5+1 全 PASS（6 N/A ui_scope none）；tests 1991/1991。
- **Quality Log**: 無 unresolved WARN/FAIL；knowledge-lag（readme-counts/9-ids 描述）已於 verify S/A commit 同步。

## Knowledge Update

Synced at the verify S/A commit (folded into feature commit c5e95b2):
- `prospec/index.md` + `modules/{types,lib,services,tests,templates}/README.md` — mcp-readme-counts rename, metadata-completeness check, 10 ids, #67 skill changes.
