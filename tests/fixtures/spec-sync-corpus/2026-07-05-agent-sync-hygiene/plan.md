# Plan：agent-config sync 衛生

## Overview

三項同管線衛生修正：(1) skill description 收斂為 `skill.ts` 單一來源——`agent-sync` 每-skill render context 傳入 `skill_description`，`.hbs` frontmatter 改渲染 `{{skill_description}}`，registry 與 frontmatter 同源；(2) `agent-sync` 加 `prospec-*` orphan sweep；(3) 依核定表消除 trigger 碰撞並加防碰撞測試。

## Technical Summary

### Affected Module Overview
| Module | Responsibility | Key API |
|--------|---------------|---------|
| types | SKILL_DEFINITIONS（description/triggers 單一來源） | `src/types/skill.ts` |
| services | agent-config 生成 | `agent-sync.service` `execute`/`syncSkillsDirSkills`/`synthesizeTriggers` |
| templates | skill `.hbs` frontmatter | `skills/*.hbs` |
| tests | contract/unit | equivalence / sweep / collision |

### Constraints
- 依賴方向 `services → types`、`templates` 純資源；不新增反向。
- sweep 只碰 `prospec-` 前綴（信任邊界：絕不刪 user 內容）。
- Language Policy：skill.ts/.hbs/測試英文；.prospec.yaml 中文觸發詞為專案 artifact。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| types | Medium | skill.ts：verify 等 description 更新為現行；套用 trigger 解法表（baseline） |
| services | High | render context 加 `skill_description`（escaped）；orphan sweep + 報告 |
| templates | Medium | 各 skill `.hbs` frontmatter description → `{{skill_description}}`；regen |
| tests | Medium | 等價性 + sweep + 碰撞 contract/unit（mutation-verified） |
| (config) | — | 本專案 `.prospec.yaml` 中文觸發詞套解法表 |

## Call Chain

`prospec agent sync` → agentSync.execute()  [services]
  → synthesizeTriggers(skill, artifactLanguage)      [baseline(skill.ts) + skill_triggers + hint]
  → syncSkillsDirSkills(...)                          [render each .hbs with skill_description + trigger_words → write SKILL.md]
  → sweepOrphanSkillDirs(skillPath)                   [新增：list prospec-* dirs ∉ SKILL_DEFINITIONS → remove; 非 prospec 保留]
  → generateEntryConfig(...)                          [CLAUDE.md/AGENTS.md registry：description 同源自 skill.ts]

無跨層違規：sweep/描述皆在 services，讀 types 常數。

## Implementation Steps

1. **single-source description**：agent-sync 每-skill render context 加 `skill_description: escapeYamlScalar(skill.description)`；各 skill `.hbs` frontmatter `description:` 改 `{{skill_description}}`；更新 skill.ts 過時 description（verify→5+1，其餘與現行 .hbs 對齊）。
2. **等價性測試**：contract test 對每 skill 斷言 registry description（skill.ts）== 生成 frontmatter；mutation-verify。
3. **orphan sweep**：agent-sync 掃 `.claude/skills`+`.agents/skills` 下 `prospec-*` 目錄，∉ SKILL_DEFINITIONS 者移除；非 prospec 目錄保留；回傳/報告移除項。
4. **sweep 測試**：temp dir orphan + user skill → 斷言 orphan 移除、user 保留。
5. **trigger 解法**：套用核定表改 skill.ts baseline + `.prospec.yaml` 中文（ff/plan/implement/kg/backfill-spec/new-story/verify 調整；plan 加 architecture/架構規劃）。
6. **防碰撞測試**：contract test 對 baseline 觸發詞偵測跨 skill substring + exact-dup，0 violation。
7. **regen + 驗證**：`agent sync` 重生 SKILL.md/CLAUDE.md/AGENTS.md；`pnpm typecheck/test/lint/counts:check`、`prospec check` 全綠。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| sweep 誤刪 user 內容 | High | 僅 `prospec-` 前綴；非 prospec 一律保留；測試含 user-skill case |
| description 對齊選錯來源 | Medium | skill.ts 為單一來源，過時者對齊現行 .hbs 文字；等價性測試兜底 |
| 碰撞解法降低可發現性 | Medium | 每 skill 保留主詞 + ≥3；core 表經 owner 核定 |
| SKILL.md regen 與 #58 衝突 | Low | stack 於 #58 branch |

## Knowledge Check

PASS — Brownfield；已讀 skill.ts、agent-sync.service render/sweep 區、triggers baseline + .prospec.yaml skill_triggers、agent-integration feature spec。
