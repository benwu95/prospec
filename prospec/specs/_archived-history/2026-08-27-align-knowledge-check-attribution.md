# align-knowledge-check-attribution — Archive Summary

- **Archived**: 2026-08-27
- **Original Created**: 2026-08-27
- **Quality Grade**: S
- **Issue**: https://github.com/benwu95/prospec/issues/215

## User Story

As a prospec contributor / SDD workflow agent,
I want 兩套受影響模組歸屬（`knowledge:check` 閘門 vs skill／`knowledge update`）對齊，且空 commit 範圍不再假綠,
So that 生成物牽連的模組不被漏蓋、且「空集合的綠」不再被誤讀為通過（#204 PR #214 首輪 CI 紅的根因）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| lib | Medium | `changedPathsFromWorkTree` ＋純 `partitionDiffAttributedModules`（drift-sources，復用 gitCapture/digestScope/moduleAttributor） |
| services | Medium | `executeForChange` 算 diff-attributed stamp-only 併入 `KnowledgeUpdateForChangeResult` |
| cli | Low | knowledge-update formatter 新增 stamp-only 區塊 |
| templates | Medium | verify commit-prompt／knowledge-update 3e＋Phase 1 措辭對齊；泛化既有 `knowledge:check` 洩漏 |
| tests | Medium | 三態單元、lib partition／git lister、formatter、契約＋負向掃描、e2e |

（scripts/check-knowledge-sync.ts 為 repo-internal，不屬任何模組）

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-LIB-062 | ADDED | 工作樹變更清單＋純 diff-歸屬 partition（fail-closed） |
| REQ-SERVICES-097 | ADDED | `knowledge update --change` 回報 diff-attributed stamp-only 模組 |
| REQ-CLI-042 | ADDED | knowledge-update 輸出印 stamp-only 區塊 |
| REQ-TESTS-098 | ADDED | 空 commit 範圍為可辨識 skip、非 all-confirmed 假綠 |
| REQ-TEMPLATES-129 | MODIFIED | verify commit-prompt 定義受影響模組＝REQ 前綴 ∪ diff 路徑＋commit 後重跑閘門 |
| REQ-TEMPLATES-162 | MODIFIED | knowledge-update 3e/Phase 1 同定義＋呈現 stamp-only |

## Completion

- **Tasks**: 13/13 code (100%)（另 [M]×2、[V]×1 已完成）
- **Acceptance Criteria**: AC-1..AC-4 皆滿足（含 dogfood：post-commit `knowledge:check` 印 5 modules confirmed）

## Review & Verify

- **Review**: 2 round(s), 0 critical / 1 major — round-2 review-clean（1 major docs-claims「union vs stamp-only」＋4 minors，使用者選全修）
- **Verify**: Grade S；機器 3/3 PASS（task-completion／knowledge-health／test-provenance），judgment 2/5 delta-spec＋3/5 constitution PASS（fresh-subagent），design 6 not-applicable；test suite 4237 passed
- **Quality Log**: plan WARN（plan-verifier 抓 §3e `knowledge:check` 既有洩漏＋stampOnly 必填 typecheck，皆修）；review WARN(r1)/PASS(r2)；verify PASS/Grade S

## Knowledge Update

- `prospec/ai-knowledge/modules/lib/drift-engine.md`（新 primitives）、`modules/templates/README.md`（bundle→lib pitfall）已更新；lib/services/cli/templates/tests 皆 `knowledge verify` stamped
