# extract-backfill-spec-skill — Archive Summary

- **Archived**: 2026-06-17
- **Original Created**: 2026-06-16
- **Quality Grade**: A

## User Story

身為採用 prospec 的既有（brownfield）專案維護者，
我希望有一個專責、可被自然語言喚起的 `/prospec-backfill-spec`，
以便我能直接從既有 code 補 Feature Spec，無須知道它藏在 design skill 的 `input=code` 參數裡。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 新增 `prospec-backfill-spec.hbs`；`prospec-design.hbs` 移除 Phase 2b-code，回歸純 Generate/Extract UI |
| types | High | `SKILL_DEFINITIONS` +1（14→15）；`prospec-design` description 去除 input=code |
| tests | High | `skill-format.test.ts` 計數/名單/hasReferences/REQ-TESTS-028 retarget + 負向斷言；startup-loading baseline +1 |
| (docs/config) | Medium | README ×2 brownfield bootstrap + skill 表 + 計數；`.prospec.yaml` 在地化 triggers |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-TEMPLATES-108 | ADDED | `prospec-backfill-spec` 獨立 Lifecycle skill（type=Lifecycle、hasReferences:false） |
| REQ-TEMPLATES-104 | MODIFIED | 回填萃取承載 skill：reverse→backfill、輸出 `backfill-draft.md` |
| REQ-TEMPLATES-105/106/107 | MODIFIED | intent 護欄 / 信任區不變式 / 未覆蓋偵測 rehome + 用語對齊（回填） |
| REQ-TESTS-028 | MODIFIED | 契約斷言 retarget 至新 skill + negative（design 不再含變體） |
| REQ-DSGN-003 | MODIFIED | `prospec-design` 移除 input=code 交叉引用（design-phase feature） |

## Completion

- **Tasks**: 10/10 code (100%)；3 `[M]` + 2 `[V]` 完成
- **Acceptance Criteria**: 3 US 全達（可發現性 / 純 UI / 命名統一）
- **Grade**: A — review-clean（0 critical，1 major README subline 已修）；verify 5+1，1 WARN = 預存 knowledge-health（已於本次 archive 清除）

## Knowledge Update

本次 archive 已同步：`_index.md`（templates/tests 列）、`modules/{templates,types,tests}/README.md`（15 skills / 53 `.hbs` / 1160 tests）；feature specs `sdd-workflow.md`（US-22 + REQ-TEMPLATES-104~108 + REQ-TESTS-028）與 `design-phase.md`（REQ-DSGN-003）畢業；`product.md` 重生。歷史/已歸檔記錄（`add-reverse-spec-extraction.md`、`planning/`）保持不變。

## Lessons Harvested

- **PB-004**（docs/duplicated-count-drift）freq 7→8 — README「14 Skill templates」subline 漏更，review 揪出已修
- **PB-005**（archive/knowledge-sync-touched-module-readme）freq 7→8 — feat commit 改 source 未同 commit README，archive Entry Gate 同步清 WARN
