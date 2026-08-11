# Tasks：agent-config sync 衛生

## Types

- [x] skill.ts：更新過時 description（verify→5+1 維，其餘與現行 .hbs 對齊）為單一來源 ~15 lines
- [x] skill.ts：套用核定 trigger 解法表（baseline：ff/plan/implement/kg/backfill-spec drop 碰撞詞；plan 加 `architecture`；new-story drop `change`；verify drop `check`）~20 lines

## Services

- [x] agent-sync `syncSkillsDirSkills`：render context 加 `skill_description: escapeYamlScalar(skill.description)` ~5 lines
- [x] agent-sync：新增 `sweepOrphanSkillDirs`（掃 skillPath 下 `prospec-*` 目錄，∉ SKILL_DEFINITIONS 移除、非 prospec 保留），於 execute 每個 agentConfig 呼叫，移除項收入 result ~40 lines

## Templates

- [x] 各 skill `.hbs` frontmatter `description:` → `{{skill_description}}`（17 skills）~17 lines
- [x] [M] `prospec agent sync` 重生 SKILL.md/CLAUDE.md/AGENTS.md（.claude + .agents）~5 lines

## Config (this repo)

- [x] `.prospec.yaml` skill_triggers 套解法表（plan/design/implement/tasks/ff/verify/backfill-spec/new-story 中文碰撞詞）~20 lines

## Tests

- [x] contract：description 等價性（每 skill registry==生成 frontmatter；mutation-verified）~40 lines
- [x] unit：orphan sweep（temp dir orphan `prospec-x` 移除 + user `my-skill` 保留 + 報告）~40 lines
- [x] contract：trigger 防碰撞（baseline 跨 skill substring + exact-dup 偵測，0 violation；mutation-verify 注入碰撞→紅）~40 lines

## Verification

- [x] [V] `pnpm typecheck` 全綠
- [x] [V] `pnpm test` 全綠
- [x] [V] `pnpm lint`、`pnpm counts`(如需)、`prospec check` 0 fail

## Summary

- **Total Tasks:** 13（code 8、[M] 1、[V] 4）
