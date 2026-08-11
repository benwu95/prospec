# Delta Spec: add-harness-capability-flags

> REQ ID format: `REQ-{MODULE}-{NUMBER}`
> 本檔的 `**Spec:**` 區塊會被 CLI 逐字落地到 Feature Spec 的 body，因此以信任區語言（英文）撰寫；敘述性欄位（Description／Acceptance Criteria／Before／After／Reason）為變更工件語言（繁中）。

## ADDED

### REQ-TYPES-071: AgentConfig Harness Capability Flags

**Feature:** agent-integration
**Story:** US-1

**Description:**
`AgentConfig` 在既有的 `surfacesSkillFrontmatter` 之外，新增必填的 `capabilities` 物件，宣告目標 harness 有什麼能力。`intersectCapabilities()` 將多個 agent 的能力歸約為保守的 AND。registry 中每個值都附帶來源註記——旗標是有查證日期的調查結果，不是道聽塗說。

**Acceptance Criteria:**
1. `HarnessCapabilities` 宣告 `canSpawnSubagent` / `canWorktree` / `canBackground`；`AgentConfig.capabilities` 為必填，新增 agent 時無法省略
2. `AGENT_CONFIGS` 依 2026-07-30 的調查：四個 agent 皆 `canSpawnSubagent: true` 與 `canBackground: true`；`canWorktree` 僅 claude 為 true
3. `intersectCapabilities([a, b])` 僅在每個輸入都為 true 時該旗標才是 true
4. `canWorktree` / `canBackground` 在本變更中沒有任何**分支**消費（僅隨能力宣告行一同陳述）——屬刻意保留的宣告位，並如實記錄

**Spec:**
`AgentConfig` carries a required `capabilities: HarnessCapabilities` (`canSpawnSubagent` / `canWorktree` / `canBackground`) — the single source for what a target harness can do — plus `intersectCapabilities()`, which reduces several agents' capabilities to their conservative AND. Values are a dated capability survey recorded inline, never inferred at runtime.
- WHEN reading `AGENT_CONFIGS`, THEN every agent declares all three flags, and `canWorktree` is true for claude only
- WHEN a new agent is added to `VALID_AGENTS`, THEN the typed map forces a `capabilities` entry — it cannot be omitted
- WHEN `intersectCapabilities` receives agents that disagree on a flag, THEN the result is `false` for that flag

**Priority:** High

---

### REQ-AGNT-038: Per-agent Capability Injection into the Skill Render Context

**Feature:** agent-integration
**Story:** US-1

**Description:**
`agent-sync.service` 將解析後的能力注入 **skill** 的 render context（今日只有 entry config 拿得到 per-agent 值）。共用同一組輸出簽章的 agent（`.agents/skills` + `AGENTS.md` 同時服務 codex／copilot／antigravity）取其能力交集，使共用檔案不可能宣稱某個成員所欠缺的能力。

**Acceptance Criteria:**
1. `syncSkillsDirSkills` 渲染每份 SKILL.md 時，context 帶有 `can_spawn_subagent` / `can_worktree` / `can_background`
2. 含多個 agent 的輸出群組經由 `intersectCapabilities` 求值，而非取任一成員
3. 能力不同的兩個 agent，同一份消費端 skill 產生的 SKILL.md 位元相異
4. 未知的 `--cli` 值仍在能力解析前被跳過——既有守衛不變

**Spec:**
`agent-sync.service` resolves each output group's harness capabilities and injects them into the skill render context as `can_spawn_subagent` / `can_worktree` / `can_background`. A group serving several agents (one `skillPath`+`configPath` signature) resolves through `intersectCapabilities`, so a shared file never claims a capability one of its agents lacks.
- WHEN rendering skills for a single-agent group, THEN the context carries that agent's declared capabilities
- WHEN a group serves several agents that disagree on a flag, THEN the injected value is the intersection, not the last member's
- WHEN two agents' capabilities differ, THEN their generated SKILL.md content differs

**Priority:** High

---

### REQ-TEMPLATES-167: Shared Harness-degradation Partial

**Feature:** agent-integration
**Story:** US-2

**Description:**
`skills/_harness-capabilities.hbs` 是 harness 降級措辭的單一來源。它把解析後的能力陳述為事實、依 `can_spawn_subagent` 分支，並承載「降級一定揭露、絕不靜默跳過」的底線。各消費端 skill 只透過 `degraded_action` partial 參數提供自己的降級動作。

**Acceptance Criteria:**
1. partial 於 `lib/template.ts` `ensureBuiltinPartials()` 註冊，並實際渲染進消費端 skill
2. 渲染結果以一行 machine-greppable 的形式陳述三個旗標
3. `can_spawn_subagent: true` 分支仍帶 runtime 失敗回退——平台能力不等於當下可用性
4. partial 的底線**語句本身**只有一份來源；消費端不得複製該語句（各站仍可在自己的 NEVER／Error Handling 表述同義的站點規則）

**Spec:**
`skills/_harness-capabilities.hbs` is the single source for harness-degradation wording across skills: it states the sync-resolved capabilities as fact, branches on `can_spawn_subagent`, and carries the floor that a degraded path is always disclosed and never a silent skip. Consuming skills pass only their own degraded action via the `degraded_action` partial parameter.
- WHEN a skill includes the partial, THEN the rendered SKILL.md states `can_spawn_subagent` / `can_worktree` / `can_background` as resolved values
- WHEN `can_spawn_subagent` is true, THEN the output still names the fallback to take if a spawn fails at runtime
- WHEN the partial's floor sentence changes, THEN every consuming skill's rendered copy of that sentence changes with it, without a per-skill edit (a station's own NEVER rule is separate wording and is not governed by this)

**Priority:** High

---

### REQ-TESTS-063: Capability Injection and Degradation Contract Coverage

**Feature:** agent-integration
**Story:** US-1

**Description:**
契約測試與單元測試釘住的是機制而非措辭：per-agent 產出差異、交集規則、生成的 skill 中不得出現自行判斷能力的句式，以及 partial 的單一來源性質。

**Acceptance Criteria:**
1. 單元測試構造逐旗標不一致的 agent，斷言 `intersectCapabilities` 回傳 AND
2. 契約測試在 `can_spawn_subagent` 兩個分支下各渲染一次消費端 skill，並以 section-scoped 方式斷言各分支的特徵內容
3. repo-wide 負向斷言確認沒有任何 skill 模板以散文判斷 harness 能力（`If the execution harness cannot …`）
4. 每一類新斷言都經 mutation 驗證（PB-001）

**Spec:**
The capability mechanism is pinned by tests at both layers: `intersectCapabilities` by a unit test over disagreeing inputs, and the generated skills by section-scoped contract assertions covering both `can_spawn_subagent` branches plus a repo-wide negative for prose that judges harness capability.
- WHEN agents disagree on a flag, THEN the unit test asserts the intersection is `false` for it
- WHEN a consuming skill is rendered under either branch, THEN the contract test asserts that branch's distinctive content, section-scoped
- WHEN a skill template reintroduces prose that judges harness capability, THEN the repo-wide negative fails

**Priority:** High

---

## MODIFIED

### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill

**Feature:** sdd-workflow
**Story:** US-13

**Before:**
`### Harness Degradation` 是自由散文，要求執行期的 agent 自行判斷——「If the execution harness cannot spawn an independent sub-agent, offer a choice …」。能力問題在每一站以自然語言各答一次，且無法機器查詢。

**After:**
該段改為引用共用的 `harness-capabilities` partial，散文只提供 review 自己的降級動作（改用 harness 自身的 reviewer 指令，或單次 fresh-context review）。能力本身在 sync 時由該 agent 的 registry 旗標解析完成，skill 只陳述事實。站點的其他祈使句（The Loop 的 spawn 指示、Reviewer Mode A）同步改為不指名機制或載明其能力前提，避免降級 render 自相矛盾。

**Reason:**
逐站的散文判斷既無法複用也無法機器查詢，而且在 verify 長出第二份副本的那一刻就如預測般開始漂移。畢業時，US-13 的第四條驗收情境需從「WHEN the execution environment does not support sub-agents」改寫為旗標解析後的形式——它是這段散文的 story 層孿生。

**Spec:**
`prospec-review`'s harness-degradation section is rendered from the shared `harness-capabilities` partial against the agent's sync-resolved capability flags; the skill's own prose supplies only review's degraded action, never a judgment about what the harness can do.
- WHEN the skill is rendered, THEN its harness section states the resolved capabilities rather than asking the agent to determine them
- WHEN `can_spawn_subagent` is false, THEN the rendered skill names the degraded path directly and does not instruct an attempt to spawn
- WHEN review degrades for any reason, THEN the choice is disclosed to the developer — never a silent skip

**Priority:** High

---

### REQ-TEMPLATES-155: Verify 2/5 and 6 require fresh context, with degradation disclosed

**Feature:** sdd-workflow
**Story:** US-5

**Before:**
Verification 2/5 帶有自己一段 **Harness degradation**，措辭與 review 各自獨立，要求 agent 在記錄揭露 WARN 之前先自行判斷 harness 能否 spawn sub-agent。

**After:**
2/5 改用同一個 `harness-capabilities` partial，散文只提供 verify 自己的降級動作：與 HEAD 相同地**提供**（offer）單次 fresh-context review 或 harness 自身的 reviewer 指令，兩者皆不可得時才在原 context 評分並記錄 WARN「2/5 graded in-session — fresh context unavailable」。維度 6 維持指向 2/5 的交叉引用，不新增第三份副本。

**Reason:**
這是證明機制可複用的第二個消費者，同時消除兩站措辭已經出現的分歧。fresh-context 要求、替代路徑與 WARN 字串皆不變。**一項刻意的收窄需明示**：HEAD 對「任何降級」都要求記錄該 WARN，本變更改為只在真的 in-session 評分那一支記錄——因為該 WARN 的內容正是「2/5 graded in-session」，在改走 fresh review 時記錄它等於寫下不實陳述。除此之外，移出散文的只有「能力判斷」。

**Spec:**
Verification 2/5's harness degradation is rendered from the shared `harness-capabilities` partial against the sync-resolved capability flags, with verify supplying only its own degraded action; dimension 6 cross-references 2/5 instead of restating it. The fresh-context requirement and the alternative degraded routes are unchanged, and the WARN string is unchanged — now recorded specifically on the in-session branch, since that is what the WARN asserts.
- WHEN 2/5 is rendered, THEN its harness wording comes from the shared partial, not from verify-specific capability prose
- WHEN the harness cannot provide fresh context, THEN 2/5 is graded in-session and the disclosure WARN is recorded
- WHEN dimension 6 degrades, THEN it points at 2/5's disclosure rather than carrying a second copy

**Priority:** High

---

## REMOVED

_本變更無移除項目。_
