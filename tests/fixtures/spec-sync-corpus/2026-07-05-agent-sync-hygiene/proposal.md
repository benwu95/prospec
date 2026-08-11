# Proposal：agent-config sync 衛生（單一來源 + orphan sweep + trigger 防碰撞）

## Background

agent-config 生成管線有三個衛生問題：(1) skill **description 雙來源已漂移**——`skill.ts` 的 verify 描述停在舊 4 維、`prospec-verify.hbs` frontmatter 已 5+1 維，CLAUDE.md/AGENTS.md registry 對外散佈過時描述且無測試釘住等價；(2) `agent-sync` **只寫不掃**——skill 更名/移除後 user 專案殘留舊 SKILL.md 仍參與 dispatch；(3) trigger 存在 **跨 skill substring 碰撞**（design⊂design architecture、實作⊂如何實作、backfill⊂promote 系列…）加泛用詞（check/change/完成），現行 contract 只驗非空。本變更收斂 description 為單一來源（skill.ts）、加 orphan sweep、以核定的最小變動表消除 trigger 碰撞並新增防碰撞測試。

## User Stories

### US-1：skill description 單一來源 [P1]

As a 讀 CLAUDE.md/AGENTS.md registry 的 agent，
I want skill description 只有一個來源（`skill.ts`）、SKILL.md frontmatter 由其生成，
So that registry 與 skill frontmatter 永不漂移。

**Acceptance Scenarios:**
- WHEN 生成 SKILL.md, THEN frontmatter description 來自 render context 的 `skill_description`（源自 skill.ts），非 .hbs 硬編
- WHEN registry（CLAUDE.md/AGENTS.md）與各 skill frontmatter 比對, THEN 同一 skill 的 description 逐字相同
- WHEN verify 的 description, THEN 反映現行 5+1 維（非舊 4 維）

**Independent Test:** contract test 對每個 skill 斷言 registry description == 生成 frontmatter description（等價性）；mutation-verify（改一份→測試紅）。

### US-2：agent-sync orphan sweep [P1]

As a 升級後改了 skill 清單的 prospec 使用者，
I want `agent-sync` 掃除不在當前 skill 清單的 `prospec-*` SKILL.md 目錄，
So that 更名/移除的舊 skill 不再殘留參與 dispatch。

**Acceptance Scenarios:**
- WHEN agent-sync 執行, THEN 掃 `.claude/skills` 與 `.agents/skills` 下 `prospec-*` 目錄，移除不在 `SKILL_DEFINITIONS` 者
- WHEN 目錄為 user 自建的非 prospec skill（無 `prospec-` 前綴）, THEN 一律保留（不掃）
- WHEN 有移除, THEN 於結果/輸出報告被移除的 skill

**Independent Test:** 單元測試——temp dir 放 1 orphan `prospec-x` + 1 user `my-skill`，跑 sync，斷言 orphan 移除、user skill 保留。

### US-3：trigger 防碰撞 [P1]

As a 用觸發詞喚起 skill 的使用者，
I want baseline 與本專案觸發詞無跨 skill substring/完全重複碰撞，
So that 喚起不歧義。

**Acceptance Scenarios:**
- WHEN 防碰撞測試對 baseline 觸發詞跑, THEN 0 個跨 skill substring/exact-dup violation
- WHEN 套用核定的解法表, THEN 每個 skill 仍保留主觸發詞與 ≥3 詞
- WHEN 重新生成, THEN skill.ts + .prospec.yaml + SKILL.md/CLAUDE.md/AGENTS.md 一致

**Independent Test:** 防碰撞 contract test（跨 skill substring + exact-dup 偵測，0 violation）；套用前後對照。

## Edge Cases

- 等價性來源選定 skill.ts（registry 與 render 共用）；.hbs frontmatter 改渲染 `{{skill_description}}`。
- sweep 僅針對 `prospec-` 前綴目錄；非 prospec 目錄與檔案一律不動（避免刪 user 內容）。
- 碰撞測試以 baseline（skill.ts）為 0-violation 契約；本專案 .prospec.yaml 中文亦一併修正並重生。

## Functional Requirements

- **FR-001**：SKILL.md frontmatter description 由 render context `skill_description`（skill.ts 單一來源）生成；.hbs 不硬編。
- **FR-002**：skill.ts verify 等描述更新為現行版本；registry↔frontmatter 等價性 contract test。
- **FR-003**：agent-sync 加 `prospec-*` orphan sweep（保留非 prospec）；結果報告移除項。
- **FR-004**：套用核定解法表消除 trigger 碰撞（skill.ts baseline + .prospec.yaml 中文）。
- **FR-005**：防碰撞 contract test（跨 skill substring + exact-dup，baseline 0 violation）。

## Success Criteria

- **SC-001**：等價性 test 綠（每 skill registry==frontmatter）。
- **SC-002**：sweep 有測試（orphan 移除 + user skill 保留）。
- **SC-003**：碰撞測試 0 violation。
- **SC-004**：`pnpm test`/`typecheck`/`lint`/`counts:check`、`prospec check` 全綠。

## Related Modules

- **types**：`skill.ts` SKILL_DEFINITIONS（description 單一來源 + trigger baseline）。
- **services**：`agent-sync.service` render context（skill_description）+ orphan sweep。
- **templates**：skill `.hbs` frontmatter 改 `{{skill_description}}`；SKILL.md/entry regen。
- **tests**：等價性 / sweep / 碰撞 contract+unit。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] No violations：TDD、Atomic Commits、Language Policy、依賴方向（types←services←templates）皆遵守。

## UI Scope

**Scope:** none

## Open Questions

- [ ] Stack 於 #58 branch（避免 SKILL.md regen 衝突）；#58 merge 後 retarget。
