# Delta Spec: slim-skill-trigger-context

## ADDED

### REQ-TYPES-059: AgentConfig 宣告 agent 是否自動 surface skill frontmatter

**Feature:** agent-integration
**Story:** US-1

**Description:**
`AgentConfig`（`src/types/skill.ts`）新增單一來源旗標，宣告該 agent 執行環境是否會自動注入 `.claude/skills/*/SKILL.md` frontmatter；`AGENT_CONFIGS` 為每個 `ValidAgent` 設定其值。旗標為 entry-config registry 分流的唯一權威來源。

**Acceptance Criteria:**
1. `AgentConfig` 具 `surfacesSkillFrontmatter: boolean` 欄位。
2. `AGENT_CONFIGS.claude.surfacesSkillFrontmatter === true`；`codex`/`copilot`/`antigravity` 皆為 `false`。
3. 該旗標為單一來源——無其他硬編的「哪個 agent 精簡」判斷散落他處。

**Priority:** High

---

### REQ-AGNT-034: agent-sync 依 frontmatter 旗標分流 entry registry

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent-sync.service` 的 `generateEntryConfig` 於 entry render context 傳入該 agent 的 `surfacesSkillFrontmatter`，使 `entry.md.hbs` 得以 per-agent 分流 registry 呈現。

**Acceptance Criteria:**
1. `generateEntryConfig` 把 `surfaces_skill_frontmatter` 加入 `agent-configs/entry.md.hbs` 的 render context，值取自對應 `AgentConfig`。
2. claude render（`CLAUDE.md`）帶精簡旗標、`.agents/*` 群組 render（`AGENTS.md`）帶完整旗標。
3. 不新增 per-agent 模板檔——沿用單一共用 `entry.md.hbs`。

**Priority:** High

---

## MODIFIED

### REQ-AGNT-020: Entry Config Language Declaration（registry 依 agent 分流）

**Feature:** agent-integration
**Story:** US-1

**Before:**
entry config（CLAUDE.md / AGENTS.md）含主要語言宣告（L0 常駐）與**每個 skill 的 Triggers 行**；`artifact_language` 缺席或空白視同 English。（對應 US-412 場景：WHEN syncing a project with language X, THEN the entry config declares X and lists per-skill trigger words。）

**After:**
entry config 仍含主要語言宣告（L0 常駐；缺席/空白視同 English）。skill registry 改**依 agent 分流**：對 runtime 不會自動 surface SKILL.md frontmatter 的 agent（codex / copilot / antigravity → AGENTS.md，旗標缺省時亦然）保留完整逐 skill 表（含每個 skill 的 Triggers 行與 References）；對會自動 surface frontmatter 的 agent（claude → CLAUDE.md）改渲染精簡 `/prospec-*` 指引段，其 trigger 詞由 SKILL.md frontmatter surface（不在 entry config 重列）。US-412 的對應場景同步限縮為「full-table（非 frontmatter-surfacing）agent 列出 per-skill triggers」。

**Reason:**
Claude Code 每 session 已自動注入 SKILL.md frontmatter，CLAUDE.md 逐 skill 表屬重複（~1,600 tokens/session）；不 surface frontmatter 的 agent 仍需完整表。與 REQ-TYPES-059 / REQ-AGNT-034 / REQ-TEMPLATES-146 同組（issue #62）。REQ-AGNT-019（frontmatter Triggers 合成）**不受影響**——SKILL.md frontmatter 的 Triggers 維持不變。

**Priority:** High

---

### REQ-TEMPLATES-146: entry.md.hbs registry 依旗標條件呈現

**Feature:** agent-integration
**Story:** US-1

**Before:**
`entry.md.hbs` 的「Available Prospec Skills」對所有 agent 一律以 `{{#each skills}}` 逐 skill 列出 description/type/triggers/references 完整表。

**After:**
以 `surfaces_skill_frontmatter` 分支：為 true 者渲染精簡指引段（≤300 bytes，「skills 透過 `/prospec-*` 觸發、自帶描述」，不逐 skill 列表）；為 false 者保留現有完整表（含每 skill Triggers 與 References 行）。

**Reason:**
Claude Code 已於每 session 自動 surface SKILL.md frontmatter；claude 的逐 skill 表是重複，省 ~1,600 tokens/session。不 surface frontmatter 的 agent 仍需完整表。

**Priority:** High

---

### REQ-TEMPLATES-147: ff/plan/archive 的 format references 改 per-phase on-demand

**Feature:** agent-integration
**Story:** US-2

**Before:**
`prospec-ff`（4 refs 一次全載）、`prospec-plan`（plan-format + delta-spec-format）、`prospec-archive`（archive-format + feature-spec-format + product-spec-format）皆於 Startup Loading 以 `[STABLE] **MANDATORY**` 觸發即載。

**After:**
上述 refs 移出 Startup Loading，於各自使用該 format 的 phase on-demand 讀取；措辭比照 in-repo 先例（archive promotion-format、verify debug-recovery、design adapter 四選一），明示「非 Startup Loading 項」。三模板 Startup Loading 的 `**MANDATORY**` 計數為 0。on-demand 指令置於編號清單之外，保持清單連續性（不觸發 baseline 降級）。reference 部署集合（`getSkillReferences`）不變。

**Reason:**
refs 實為分 phase 才用；觸發即全載使拆分名存實亡，且中途 abort 時浪費未用 refs。降低觸發邊際 context。

**Priority:** High

---

### REQ-TEMPLATES-148: knowledge-generate 移除 Step 4 conventions 內嵌鏡像

**Feature:** agent-integration
**Story:** US-3

**Before:**
`prospec-knowledge-generate` Step 4 內嵌完整 Recipe-First README 骨架鏡像（~5.5KB），同時 Startup Loading 又載入 canonical `_module-readme-conventions.md`——同格式雙載，且自承分歧時以 canonical 為準。

**After:**
Step 4 刪除內嵌骨架，改為單一指向 canonical `_module-readme-conventions.md` 的產出指引；保留 Startup Loading 對該 canonical 檔的載入（產出仍有依據）。

**Reason:**
消除 ~5.5KB 純重複與 canonical／鏡像漂移風險，維持單一格式權威。

**Priority:** Medium

---
