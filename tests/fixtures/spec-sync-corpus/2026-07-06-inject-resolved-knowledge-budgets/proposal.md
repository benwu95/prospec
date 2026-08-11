# Proposal: inject-resolved-knowledge-budgets

## Background

`prospec agent sync` 產生的 `SKILL.md`(寫入下游專案的 `.claude/skills/` 與 `.agents/skills/`)在說明知識分層 token 預算時,引用了 prospec 套件內部的 TypeScript 常數 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`。下游專案看不到、也無從解析這個符號,只能看到模板裡寫死的數字。這些數字既不會反映該專案在 `.prospec.yaml` 覆寫的值,也可能與常數本身漂移。同樣的洩漏也出現在 `prospec-knowledge-generate` skill 指示 AI 寫入下游 `index.md` 的預算註解,以及本 repo dogfood 的 `prospec/index.md` 與 `README`。

## User Stories

### US-1: 生成的 SKILL.md 指向可解析來源並顯示正確數字 [P1]

As a 下游專案的 AI agent(讀 SKILL.md 決定知識分層預算),
I want 生成文件中的 token 預算指向 `.prospec.yaml` `knowledge.token_budget` 與 `prospec check knowledge-size`,且顯示的數字為本專案實際解析值,
So that 我不必解析看不到的內部符號,且遵循的數字與實際 drift 檢查一致。

**Acceptance Scenarios:**

- WHEN `prospec agent sync` 產生任一 `SKILL.md`,THEN 內容不含字串 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN 專案 `.prospec.yaml` 未覆寫 `knowledge.token_budget`,THEN SKILL.md 顯示預設值(L1 1800 / L2 1000 tokens、README ≤100 行)
- WHEN 專案 `.prospec.yaml` 設 `knowledge.token_budget.l2_per_module: 1200` 後重新 sync,THEN SKILL.md 的 L2 預算顯示 1200
- WHEN SKILL.md 描述預算來源,THEN 指向 `.prospec.yaml` `knowledge.token_budget`(可編輯)與 `prospec check knowledge-size`(可執行)

**Independent Test:**
在一個「有覆寫」與一個「無覆寫」token_budget 的專案各跑 `prospec agent sync`,`grep` 產出的 SKILL.md 確認不含內部符號,且顯示數字等於 `resolveKnowledgeTokenBudget(config)` 的結果。

### US-2: 下游 index.md 產生指示與 dogfood 文件對齊 [P2]

As a 下游專案維護者,
I want `prospec-knowledge-generate` skill 指示 AI 撰寫 `index.md` 的 Progressive Loading 預算註解時指向 `.prospec.yaml` 而非內部符號,且本 repo dogfood 文件同步對齊,
So that 下游生成的 `index.md` 與本專案示範文件一致地不含無法解析的符號。

**Acceptance Scenarios:**

- WHEN AI 依 `prospec-knowledge-generate` 產生下游 `index.md` 的 budget 註解,THEN 措辭指向 `.prospec.yaml` `knowledge.token_budget`,不含 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN 檢視本 repo 的 `prospec/index.md`、`README.md`、`README.zh-TW.md`,THEN 同樣不再引用內部符號,而預算表數字不變(single-source 測試仍 PASS)

**Independent Test:**
`grep DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 於 `prospec/index.md`、`README.md`、`README.zh-TW.md`、`src/templates/skills/**` 為 0 命中;`tests/unit/types/config.test.ts` 仍綠。

## Edge Cases

- `.prospec.yaml` 完全沒有 `knowledge.token_budget` 區塊:用 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`(1800/1000/100),與現況一致。
- 只覆寫部分欄位(如僅 `l1_per_file`):逐欄 resolve,未設欄位回退 default。
- 使用者改 `.prospec.yaml` 後未重跑 `agent sync`:SKILL.md 數字為上次 sync 時的 baked 值(與現有生成模型一致——所有插值皆是 sync-time 快照);prose 仍指示 agent 於 startup 讀 `.prospec.yaml`。

## Functional Requirements

- **FR-001**: `agent-sync` 建 `templateContext` 時注入 resolved 的 `l1_per_file` / `l2_per_module` / `readme_max_lines`。
- **FR-002**: skill 模板(`_knowledge-loading-rules.hbs`、`prospec-knowledge-generate.hbs`)以 `{{}}` 變數取代寫死數字,移除 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 字面引用,改指向 `.prospec.yaml` `knowledge.token_budget` 與 `prospec check knowledge-size`。
- **FR-003**: `resolveKnowledgeTokenBudget` 移至 lib(與 `KnowledgeSizeBudget` 同層),`check.service` 與 `agent-sync` 皆 import 使用,維持 `cli → services → lib → types` 單向依賴(agent-sync 不跨 service import check.service)。
- **FR-004**: `prospec-knowledge-generate` skill 對「index.md budget 註解」的指示改為指向 `.prospec.yaml`,不再教 AI 寫入內部符號。
- **FR-005**: 本 repo dogfood 的 `prospec/index.md`、`README.md`、`README.zh-TW.md` 對齊移除符號引用,保留數字表。

## Success Criteria

- **SC-001**: `grep -r DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 在所有生成的 `SKILL.md`(`.claude/` + `.agents/`)為 0 命中。
- **SC-002**: 新增測試斷言「生成的 skill 輸出不含 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`」且注入數字 == `resolveKnowledgeTokenBudget` 結果。
- **SC-003**: `grep DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 於 `prospec/index.md`、`README.md`、`README.zh-TW.md`、`src/templates/skills/**` 為 0 命中。
- **SC-004**: `pnpm test` / `pnpm typecheck` / `pnpm lint` 全綠;既有 single-source 測試(`config.test.ts`)仍 PASS。
- **SC-005**: `prospec check` 無新增 drift(dependency-direction 綠)。

## Related Modules

- **templates**: 修改 `_knowledge-loading-rules.hbs`(5 skills 共用 partial)與 `prospec-knowledge-generate.hbs`。
- **services**: `agent-sync` 注入 `templateContext`;`check` 改為 import 已搬遷的 resolver。
- **lib**: `resolveKnowledgeTokenBudget` 移入(`drift-sources.ts`,與 `KnowledgeSizeBudget` 同層)。
- **tests**: 新增/調整 skill-format 與 single-source 斷言。

## Open Questions

- [ ] **NEEDS CLARIFICATION**: knowledge-generate 對下游 `index.md` budget 註解的最終措辭,於 `/prospec-plan` delta-spec 定稿(不阻塞本 Story)。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy:本 proposal 為繁中;程式碼、識別字、AI Knowledge base 維持 English。
- [x] One-way Dependency Direction:resolver 搬遷至 lib,避免 service→service 反向/耦合。
- [x] Test-Driven Development:FR 皆附測試(SC-002/SC-004)。
- [x] No violations identified。

## UI Scope

**Scope:** none
