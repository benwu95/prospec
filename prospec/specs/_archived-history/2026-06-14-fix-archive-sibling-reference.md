# fix-archive-sibling-reference — Archive Summary

- **Archived**: 2026-06-14
- **Original Created**: 2026-06-14
- **Quality Grade**: A

## User Story

身為一個在任一 agent layout（Claude / Antigravity / Codex / Copilot）執行 `/prospec-archive` 的 AI agent，
我想要 Phase 4.5 的 Harvest 格式引用解析到 archive skill 自身目錄內的檔案，
以便永遠不會踩到指向其他 skill 目錄的 dangling 路徑（並補上防回歸的 self-contained guard）。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| services | Medium | `getSkillReferences` 的 `prospec-archive` referenceMap 新增 promotion-format 對映（各自 render） |
| templates | Medium | `prospec-archive.hbs` Phase 4.5 Harvest 引用改指自身 `references/promotion-format.md`（保留 `/prospec-learn` handoff） |
| tests | Medium | contract（body self-contained guard）+ integration（referenceMap 部署 guard），皆 mutation-verified |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AGNT-015 | MODIFIED | Self-Contained Skills — archive 自包含 promotion-format，無 sibling-dir 引用，補 contract guard（single source 仍為 `promotion-format.hbs`） |

## Completion

- **Tasks**: code 6/6 (100%)；`[M]`×1 + `[V]`×1 完成
- **Acceptance Criteria**: REQ-AGNT-015 AC1–AC4 全達成（部署 21 refs、無 sibling 路徑、guard mutation-verified、verify:skills [D] 0 dangling/sibling）

## Quality

- review-clean（1 round，0 critical / 0 major，獨立 fresh-context reviewer，雙 guard mutation-verified）
- verify Grade A（5+1：V4 WARN 為 pre-existing templates knowledge-health timestamp 殘留，非本變更語意缺陷，已於本次 archive 知識同步刷新）
- 全套 957 green、verify:skills 23/23、lint/typecheck 綠

## Knowledge Update

本次 archive Entry Gate 已同步：
- `prospec/ai-knowledge/_index.md`（tests 計數 955→957）
- `prospec/ai-knowledge/modules/tests/README.md`（955→957 + REQ-AGNT-015 guard）
- `prospec/ai-knowledge/modules/templates/README.md`（pitfall：archive 自包含其 promotion-format copy）

## Notes

- `docs/duplicated-count-drift` 模式於本變更再現（en/zh README 945/955 既有 drift 已順手校正至 957）；因屬主動處理（非 quality_log WARN / review critical），不在 Phase 4.5 限定 sources 內 → 留待 `/prospec-learn` Collect（含 session corrections）累積。
