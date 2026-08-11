# complete-capability-to-feature-migration — Archive Summary

- **Archived**: 2026-06-15
- **Original Created**: 2026-06-15
- **Quality Grade**: S

## User Story

身為 prospec 維護者與透過 prospec skills 工作的 agent，
我想要移除 `src/templates` 殘留的 capability spec 孤兒檔與失效路徑/用語，並修正 runtime/docs 殘留的「Capability spec」用語，
以便讀模板的 agent 不再被導向已不存在的 `specs/capabilities/` 路徑或已棄用格式，現行版本術語與 Feature Spec 架構一致。

## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| templates | High | 刪除孤兒 `capability-spec-format.hbs`；修 `prospec-new-story` 失效載入路徑 `specs/capabilities/`→`specs/features/` + 用語；archive/implement 殘留 spec-產物用語對齊 |
| tests | High | `skill-format.test.ts` 移除 capability-format 區塊、新增 migration-completeness guard（涵蓋全 13 skills，PB-001 mutation-verified）；`startup-loading-baseline.json` 路徑同步 |
| services | Low | `mcp.service.ts` spec resource `description`「Capability spec」→「Feature spec」 |
| docs (README) | Low | `README.md` / `README.zh-TW.md` MCP 表格用語 + PB-004 計數同步（.hbs 52→51、references 19→18、tests 1041→1039、contract 471→469） |

## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-CHNG-006 | MODIFIED | planning-skill Layer-0 spec 載入來源 capability→feature（new-story 路徑修正） |
| REQ-CHNG-009 | MODIFIED | plan MODIFIED Before 來源用語 capability spec→feature spec |
| REQ-MCP-003 | MODIFIED | `spec://feature/{name}` resource description 與 US-2 敘述用語對齊 feature spec |
| REQ-TEMPLATES-031 | REMOVED（實作層收尾） | `capability-spec-format.hbs` 物理移除——Feature Spec 早於 2026-03-02 標 deprecated，本變更使實作與 spec 一致 |

## Completion

- **Tasks**: 9/9 code (100%)；T10 `[V]` 驗證完成；T11 `[M] prospec agent sync` 部署待辦（reminder，未阻擋）
- **Acceptance Criteria**: 5/5（SC-001~004 grep 全 clean + `pnpm test` 1039 綠）
- **Review**: review-clean（0 critical，1 major 已修——proposal scope 文字校正）
- **Verify**: Grade S（5+1 維度全 PASS，drift 5/5 PASS）

## Quality / Lessons

- 對抗式 review 揪出 proposal FR-003/Edge Cases 過度宣稱 scope（早於 plan 精煉），已就地校正（PB-003）。
- 本變更第 6 度再證 PB-004（counts 漂移）與 PB-005（source 變更未同 commit module README → drift stale），均於 archive 知識同步收斂至 0 stale；已 upsert `_lessons-ledger.md`。

## Knowledge Update

- 已同步：`_index.md`（templates/tests rows）、`modules/templates/README.md`、`modules/tests/README.md`、`modules/services/README.md`。drift `prospec check` = 0 stale / 5/5 PASS。
- 待辦（非 git-tracked）：`prospec agent sync` 重新部署 `.claude/skills` + `.agents/skills`（仍帶舊用語）。
