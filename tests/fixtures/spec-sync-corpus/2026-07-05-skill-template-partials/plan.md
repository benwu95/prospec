# Plan：skill template boilerplate partial 化 + generated 標記

## Overview

把 skill template 間 verbatim-identical 的 boilerplate 抽成 Handlebars partials（沿用既有 `ensureBuiltinPartials` 機制），17 個 `.hbs` 以 `{{> partial}}` 引用單一來源；SKILL.md 頭部加 generated 標記。硬約束：重新 render + 部署 byte-identical（generated 標記為唯一差異）——只抽真正逐字相同的段落，per-skill 變異保留 inline。

## Technical Summary

### Affected Module Overview
| Module | Responsibility | Key API |
|--------|---------------|---------|
| templates | skill `.hbs` + partials | `skills/_*.hbs`、`skills/*.hbs` |
| lib | Handlebars render + partial 註冊 | `template.ts` `ensureBuiltinPartials` |
| tests | 生成契約 | skill-format / skill generation |

### Constraints
- byte-identical：partial 內容須與原 inline 逐字相同（含空白/換行）；只抽 md5-identical 段落。
- 依賴方向 `lib` 註冊 partial、`templates` 純資源；不新增反向。
- generated 標記不得破壞 frontmatter YAML 或既有 Startup-Loading/section 契約斷言。

## Affected Modules

| Module | Impact | Changes |
|--------|--------|---------|
| templates | High | 新增 `_next-step-handoff.hbs`（＋其他 verbatim-safe partial）；17 `.hbs` 引用；generated 標記（partial 或 render 注入） |
| lib | Low | `ensureBuiltinPartials` 註冊新 partials |
| tests | Medium | byte-identical / partial single-source / generated-marker 契約 |

## Call Chain

`prospec agent sync` → syncSkillsDirSkills → renderTemplate(`skills/{name}.hbs`)  [lib]
  → ensureBuiltinPartials()  [lib：註冊 language-policy/knowledge-loading-rules/index-auto-block + 新 partials]
  → Handlebars 展開 `{{> next-step-handoff}}` 等 → SKILL.md（含 generated 標記）

無跨層違規：partial 註冊在 lib，templates 純資源。

## Implementation Steps

1. **盤點 verbatim-identical 段落**：以 md5 確認各 boilerplate（Next-Step Handoff 首要）逐字相同的集合；per-skill 變異者不抽。
2. **抽 partials**：建 `src/templates/skills/_next-step-handoff.hbs`（＋ Output Contract/Entry Gate framing 中 verbatim-safe 者）；內容逐字搬移。
3. **引用**：對應 template 段落換成 `{{> next-step-handoff}}` 等。
4. **註冊**：`template.ts` `ensureBuiltinPartials` 加新 partials。
5. **generated 標記**：SKILL.md frontmatter 後加標記（來源指引）；確認不破壞 YAML/契約。
6. **byte-identical 驗證**：`agent sync` 重生，`git diff` 部署 SKILL.md 僅 generated 標記；否則調整 partial 至零 drift。
7. **測試 + gates**：契約測試（byte-identical/single-source/標記）；`pnpm typecheck/test/lint/counts:check`、`prospec check` 全綠。

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| partial 抽取產生空白/換行 drift | High | 逐字搬移；byte-identical diff 為硬驗證；trailing-newline 契約既有 |
| 誤抽 per-skill 變異段 → 語意流失 | High | 只抽 md5-identical；變異留 inline + 報告 |
| generated 標記破壞契約斷言 | Medium | 標記置 frontmatter 後、section 前；跑既有 skill-format 契約 |
| 大範圍 17-template 衝突 | Low | stack 於 #59 branch（排程建議） |

## Knowledge Check

PASS — Brownfield；已讀 template.ts partial 機制、既有 partials、boilerplate 分布（Next-Step 7/6-identical、Output 17、Entry 9、Quality 5）。
