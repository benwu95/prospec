# Proposal：skill template boilerplate partial 化 + SKILL.md generated 標記

## Background

4 種 boilerplate（Next-Step Handoff、Entry Gate 樣板、Quality Gate 表、Output Contract 樣板）在 17 個 skill template 間 verbatim 手抄 6-17 份（~190 行；Next-Step Handoff 6 份 md5 完全相同），違反自家 `_playbook.md` PB-006（單一來源 helper）——而 Handlebars partial 機制（`template.ts` `ensureBuiltinPartials`）早已存在僅用於 2 個 partial。另外部署的 SKILL.md 無 generated 標記，使用者手改會在下次 sync 被靜默覆寫。本變更把 verbatim 重複段落抽成 partials（17 template 引用單一來源），並於 SKILL.md 頭部加 generated 標記。

## User Stories

### US-1：verbatim boilerplate 收斂為 partial 單一來源 [P1]

As a 維護 skill template 的貢獻者，
I want 重複的 boilerplate 段落只有一份（Handlebars partial），17 個 template 引用，
So that 改一處即全體一致，不再手抄漂移（PB-006）。

**Acceptance Scenarios:**
- WHEN verbatim-identical 的 boilerplate 段落被抽成 partial, THEN 各 template 以 `{{> partial}}` 引用單一來源
- WHEN 重新 render + 部署, THEN 輸出與現況 byte-identical（generated 標記除外——零 drift 必須保持）
- WHEN 某段落含 per-skill 變異無法 byte-identical 抽取, THEN 保留 inline 並於報告說明（不強抽破壞等價）

**Independent Test:** 重新 `agent sync`，`git diff` 部署的 SKILL.md 僅顯示 generated 標記新增行；既有生成契約測試全綠。

### US-2：SKILL.md generated 標記 [P1]

As a 誤改部署 SKILL.md 的使用者，
I want SKILL.md 頭部有 generated 標記註明來源，
So that 我知道要改 `src/templates/skills/`，手改不會被靜默覆寫而不自知。

**Acceptance Scenarios:**
- WHEN 生成 SKILL.md, THEN frontmatter 後有 generated 標記（註明由 template 生成、修改請改 `src/templates/skills/{name}.hbs`）
- WHEN 標記加入, THEN 為唯一相對現況的輸出差異

**Independent Test:** grep 部署 SKILL.md 含 generated 標記；diff 除標記外零變化。

## Edge Cases

- Entry Gate/Output Contract/Quality Gate 多為 per-skill 變異——只抽 verbatim-identical 的共用 framing（如 Output Contract 的 self-assess 開場、Next-Step Handoff 全段），變異部分留 inline，維持 byte-identical。
- partial 註冊延用 `ensureBuiltinPartials`（lazy）；新增 partial 於此登記。
- generated 標記須不破壞 frontmatter YAML 與既有契約測試對 Startup Loading/section 的斷言。

## Functional Requirements

- **FR-001**：verbatim-identical boilerplate 抽成 `src/templates/skills/_*.hbs` partials；template 以 `{{> ...}}` 引用。
- **FR-002**：`template.ts` `ensureBuiltinPartials` 註冊新 partials。
- **FR-003**：SKILL.md 生成加 generated 標記（來源指引）。
- **FR-004**：重新 render 輸出 byte-identical（generated 標記除外）；契約測試綠。

## Success Criteria

- **SC-001**：`git diff` 部署 SKILL.md 除 generated 標記外零變化。
- **SC-002**：重複 boilerplate 收斂為 partial 單一來源（至少 Next-Step Handoff）。
- **SC-003**：`pnpm test`/`typecheck`/`lint`/`counts:check`、`prospec check` 全綠。

## Related Modules

- **templates**：新 partials + 17 skill `.hbs` 引用 + generated 標記。
- **lib**：`template.ts` partial 註冊。
- **tests**：生成契約（byte-identical / partial single-source / 標記）。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations：TDD、Atomic Commits、Language Policy、依賴方向皆遵守；本變更正是實踐 PB-006。

## UI Scope

**Scope:** none

## Open Questions

- [ ] Stack 於 #59 branch（避免 17 template 大範圍衝突；issue 排程建議 #59 後）。
