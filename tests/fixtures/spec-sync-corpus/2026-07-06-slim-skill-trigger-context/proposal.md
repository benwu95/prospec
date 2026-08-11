# Proposal: slim-skill-trigger-context

> 對應 GitHub issue #62；來源稽核 F1 / F4 / F5(b)（`.tasks/chore/scan-by-fable5/03-progressive-disclosure.md`，2026-07-03）

## Background

Prospec 產生的 skill 生態在**每個 session** 與**每次 skill 觸發**都揹著可省下的 context：

1. **L0 registry 與原生機制重複**：`CLAUDE.md` 的「Available Prospec Skills」區段佔 L0 的 71.2%（~1,600 tokens），逐一列出每個 skill 的 description / type / triggers / references。但 Claude Code 本身已於每個 session 的 available-skills reminder 自動注入所有 `.claude/skills/*/SKILL.md` 的 frontmatter（含 description 內嵌 triggers）——同一份 trigger 資料在單一 claude session 的 context 出現兩次。
2. **references 拆分名存實亡**：ff / plan / archive 三個 skill 的 format references 以 `[STABLE] **MANDATORY**` 標注、觸發即全載，但這些 refs 實際是**分 phase** 才用得到（ff 一次載 4 份、其中 tasks-format 到 Phase 4 才需要；story 若未過 INVEST 中途 abort，後幾份是純浪費）。
3. **knowledge-generate 同格式雙載**：`prospec-knowledge-generate` 於 Startup Loading 載入 canonical `_module-readme-conventions.md`，同時 Step 4 又內嵌一份完整的 Recipe-First 骨架鏡像（~5.5KB），且自承「兩者若分歧，以 canonical 檔為準」——內嵌鏡像是純重複＋漂移風險。

取捨前提：refs 移出 stable prefix 會縮短可 cache 前綴，但前綴 cache 效益本身尚無量測（見 issue #61 量測解鎖脈絡），而 context 佔用是確定的——本輪只做確定性高的縮減。

## User Stories

### US-1: L0 registry 對 claude 精簡（per-agent 分流）[P1]

As a prospec 框架維運者暨每個下游 claude session，
I want `CLAUDE.md` 的 skill registry 對 claude 縮成一段精簡指引、對不會自動 surface frontmatter 的 agent（codex / copilot / antigravity）保留完整表，
So that claude session 不再重複揹負 ~1,600 tokens，同時 codex 等 agent 仍拿得到完整 skill 清單。

**Acceptance Scenarios:**

- WHEN 對 claude 產生 entry config（`CLAUDE.md`），THEN registry 區段縮為一段「skills 透過 `/prospec-*` 觸發、自帶描述」的精簡指引，不再逐 skill 列出 description / type / triggers / references 表。
- WHEN 對 codex / copilot / antigravity 產生 entry config（`AGENTS.md`），THEN 保留逐 skill 的完整 registry 表（維持現況）。
- WHEN 比較改動前後 claude 的 `CLAUDE.md`，THEN registry 區段位元組明顯縮小（省下的量級對應 issue 宣稱的 ~1,600 tokens）。

**Independent Test:**
以 `prospec init` + `prospec agent sync` 於暫存目錄實跑，grep 產出的 `CLAUDE.md` 確認無逐 skill 表、`AGENTS.md` 仍含完整表且每個 skill 的 Triggers 行俱在。

### US-2: ff / plan / archive 的 MANDATORY references 改 per-phase on-demand [P1]

As a 觸發 ff / plan / archive 的 agent，
I want format references 不再於 Startup Loading 一次全載，而是進入使用該 format 的 phase 時才讀取，
So that 觸發邊際 context 顯著下降，中途 abort 時不浪費尚未用到的 refs。

**Acceptance Scenarios:**

- WHEN 觸發 `/prospec-ff`，THEN Startup Loading 不再 MANDATORY 全載 4 份 format refs；proposal-format 於 Phase 2、plan-format + delta-spec-format 於 Phase 3、tasks-format 於 Phase 4 各自 on-demand 讀取。
- WHEN 觸發 `/prospec-plan`，THEN plan-format 於 plan 撰寫 phase、delta-spec-format 於 delta-spec 撰寫 phase 各自 on-demand 讀取，Startup Loading 不再 MANDATORY 全載。
- WHEN 觸發 `/prospec-archive`，THEN archive-format / feature-spec-format / product-spec-format 各於對應 phase on-demand 讀取，Startup Loading 不再 MANDATORY 全載。
- WHEN 檢視改後的三個 skill 模板，THEN on-demand 讀取指令的措辭比照 in-repo 既有先例（archive promotion-format、verify debug-recovery、design adapter 四選一），明確標示「非 Startup Loading 項、進 phase 時讀取」。

**Independent Test:**
grep 三個 skill 產出的 SKILL.md，確認 Startup Loading 區段的 `**MANDATORY**` 計數降為 0，且各 phase 段落含對應 format 的 on-demand 讀取指令；skill-format 契約測試全綠。

### US-3: 移除 knowledge-generate 的 conventions 內嵌鏡像 [P2]

As a prospec 框架維運者，
I want `prospec-knowledge-generate` 刪除 Step 4 內嵌的 Recipe-First 骨架鏡像、只保留「依 canonical `_module-readme-conventions.md` 產出」的指引，
So that 消除 ~5.5KB 純重複與 canonical／鏡像分歧的漂移風險，同時維持 Startup Loading 對 canonical 檔的載入。

**Acceptance Scenarios:**

- WHEN 檢視改後的 `prospec-knowledge-generate` SKILL.md，THEN Step 4 不再內嵌完整 README 骨架，改為單一指向 canonical `_module-readme-conventions.md` 的指引。
- WHEN 檢視 Startup Loading，THEN 對 canonical `_module-readme-conventions.md` 的載入**保留**（產出仍有依據），僅移除 body 內的重複鏡像。

**Independent Test:**
grep 產出的 SKILL.md 確認 Step 4 無內嵌骨架、仍有指向 canonical 檔的指引；startup-loading baseline 對 knowledge-generate 不變（其 `mandatory` 本為 0）。

## Edge Cases

- **claude 以外 agent 需要 references 路徑指引**：精簡只施於 claude；`AGENTS.md` 保留完整表（含 References 行），確保不 surface frontmatter 的 agent 不受影響。
- **契約測試對「每個 skill 都有 Triggers 行」的斷言**：claude 精簡段不再逐 skill 列 Triggers，相關斷言（`skill-format.test.ts` 每 skill Triggers、entry References 路徑）須改為 agent-aware（僅對 `AGENTS.md` render 斷言完整表）。
- **重建 per-agent 模板的誤區**：Scope 1 必須在單一 `entry.md.hbs` 內以條件分支達成；契約測試明文禁止重新引入 per-agent `.hbs` 模板。
- **on-demand 化不得改變 reference 檔的部署集合**：refs 仍照 `getSkillReferences` map vendored 進各 skill 的 `references/`；只改「何時讀」，不改「部署哪些」，故 reference 數量／存在性契約應維持綠。
- **knowledge-generate 保留 canonical 載入**：只刪 body 鏡像、不刪 Startup Loading 的 canonical 載入，避免產出失去依據。

## Functional Requirements

- **FR-001**: `entry.md.hbs` 依 per-agent 旗標分流 registry：claude 渲染精簡指引段、不 surface frontmatter 的 agent 渲染完整逐 skill 表。
- **FR-002**: per-agent 旗標須有單一來源（`AgentConfig` / `AGENT_CONFIGS`），並由 agent-sync 於 entry render context 傳入。
- **FR-003**: `prospec-ff` 的 4 份 format refs 由 Startup Loading MANDATORY 改為對應 phase 的 on-demand 讀取。
- **FR-004**: `prospec-plan` 的 plan-format / delta-spec-format 由 Startup Loading MANDATORY 改為對應 phase 的 on-demand 讀取。
- **FR-005**: `prospec-archive` 的 archive-format / feature-spec-format / product-spec-format 由 Startup Loading MANDATORY 改為對應 phase 的 on-demand 讀取。
- **FR-006**: on-demand 讀取指令措辭比照 in-repo 既有先例，明確標示「非 Startup Loading 項」。
- **FR-007**: `prospec-knowledge-generate` 移除 Step 4 內嵌 Recipe-First 骨架鏡像，改為指向 canonical `_module-readme-conventions.md`；保留 Startup Loading 對該 canonical 檔的載入。
- **FR-008**: 更新受影響的生成契約與 fixture（skill-format、startup-loading-baseline、skill-contract、agent-sync 單元測試），全部轉綠。

## Success Criteria

- **SC-001**: 產出的 claude `CLAUDE.md` registry 區段縮為精簡指引（無逐 skill 表），`AGENTS.md` 仍含完整表且每 skill 的 Triggers 行俱在。
- **SC-002**: ff / plan / archive 產出的 SKILL.md，其 Startup Loading 區段 `**MANDATORY**` 計數為 0，且各對應 phase 含 on-demand 讀取指令。
- **SC-003**: `prospec-knowledge-generate` 產出的 SKILL.md Step 4 無內嵌骨架、僅存 canonical 指引；Startup Loading 仍載入 canonical 檔。
- **SC-004**: 全測試套件（`pnpm test`）綠，覆蓋率 ≥ 80%（Constitution TDD）。
- **SC-005**: reference 檔部署集合（各 skill `references/` 內容與數量）不變。

## Related Modules

- **templates**: 主戰場——`agent-configs/entry.md.hbs`（Scope 1 分支）、`skills/prospec-ff|plan|archive.hbs`（Scope 2 on-demand）、`skills/prospec-knowledge-generate.hbs`（Scope 3 去鏡像）。
- **types**: `AgentConfig` 介面 + `AGENT_CONFIGS`（`src/types/skill.ts`）新增 per-agent frontmatter 旗標（單一來源）。
- **services**: `agent-sync.service.ts` 的 `generateEntryConfig` 把旗標塞進 entry render context。
- **tests**: `contract/skill-format.test.ts`、`fixtures/startup-loading-baseline.json`、`integration/skill-contract.test.ts`、`unit/services/agent-sync.service.test.ts` 更新為 agent-aware 並同步 baseline。

## Open Questions

- [ ] 無阻塞性未決項。取捨（stable-prefix cache vs 確定 context 縮減）已於 Background 明述，採「先做確定性縮減」。

## Constitution Check

- [x] Reviewed against `prospec/CONSTITUTION.md`
- [x] Language Policy：本 proposal 為 `.prospec/changes/` 文件，以繁體中文（台灣）撰寫；技術術語與被改的 Knowledge/模板內容保持英文。
- [x] TDD：SC-004 要求測試轉綠且覆蓋率 ≥ 80%；契約測試先更新（RED）再改模板（GREEN）。
- [x] One-way Dependency：改動落在 types / services / templates / tests，維持 `cli → services → lib → types` 方向。
- [x] User-Facing Documentation：evaluate 於 plan——若 README 描述了 registry / references 載入行為，於實作階段同步更新。

## UI Scope

**Scope:** none
