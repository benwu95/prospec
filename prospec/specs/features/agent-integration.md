---
feature: agent-integration
status: active
last_updated: 2026-07-14
story_count: 17
req_count: 73
---

# Agent Integration

## Who & Why

服務使用 Prospec 的開發者與多種 AI Agent（Claude Code、Antigravity CLI、Copilot 等）。Agent Integration 偵測已安裝的 AI CLI 工具、生成對應配置與 SDD Skill 檔案，使 AI Agent 在 Prospec 結構化開發流程中運作。透過三層 Progressive Disclosure 與語言中立化機制，確保 Skill 在不同 Agent 和語言環境下正確運作。

## User Stories & Behavior Specifications

### US-400: AI CLI 偵測與配置生成 [P0]

身為一名開發者，
我想要 Prospec 自動偵測已安裝的 AI CLI 工具並生成對應配置，
以便 AI Agent 能立即在 SDD 框架下工作。

**Acceptance Scenarios:**
- WHEN 執行 `prospec agent sync` THEN 偵測所有已安裝的 AI CLI
- WHEN 偵測到 Claude Code THEN 生成 CLAUDE.md
- WHEN 未偵測到任何 AI CLI THEN 顯示支援清單並提示安裝

#### REQ-AGNT-001: Detect Installed AI CLI
- WHEN `~/.claude` exists, THEN detect Claude Code
- WHEN `~/.gemini/antigravity-cli` exists, THEN detect Antigravity CLI
- WHEN `--cli claude` specified, THEN only process Claude Code configuration
- WHEN no installed AI CLI detected, THEN display supported CLI list

#### REQ-AGNT-002: Auto-Detect AI CLI
- WHEN detecting Claude Code, THEN check `~/.claude` directory
- WHEN detecting Antigravity CLI, THEN check `~/.gemini/antigravity-cli` directory
- WHEN detecting Copilot CLI, THEN check `~/.copilot` directory
- WHEN detecting Codex CLI, THEN check `~/.codex` directory

#### REQ-AGNT-016: Antigravity CLI Target
- WHEN registering targets, THEN `antigravity` is a valid agent (`VALID_AGENTS`, `AGENT_CONFIGS`, `AGENT_DIRS`): name `Antigravity CLI`, detect `~/.gemini/antigravity-cli`, skillPath `.agents/skills`, configPath `AGENTS.md`, skills-dir
- WHEN sync antigravity, THEN produce `.agents/skills/prospec-*/SKILL.md` + `AGENTS.md`
- WHEN gemini is requested, THEN config validation fails (target removed — see Deprecated Requirements)

#### REQ-AGNT-018: Display Supported CLI List from Single Source
- WHEN `agent sync --help` renders, THEN the `--cli` supported list is derived from `VALID_AGENTS` (contains antigravity, not gemini)
- WHEN no agent is configured, THEN the error message lists supported agents from `VALID_AGENTS`
- WHEN reviewing code, THEN no hardcoded CLI list string exists

#### REQ-AGNT-028: Canonical Agent Order
支援 agent 的 canonical 順序定為 `claude, codex, copilot, antigravity`，統一於 `VALID_AGENTS`（types，驅動 zod enum 錯誤與 `supported:` 訊息）、`AGENT_CONFIGS`（types，查表）、`AGENT_DIRS`（lib，init 偵測／提示）。產出檔依 agent 集合而非順序，故順序變更不改任何 generated 檔內容。
- WHEN 無效 agent 觸發 zod enum 錯誤, THEN 列為 `"claude"|"codex"|"copilot"|"antigravity"`
- WHEN `detectAgents()` 回傳, THEN id 順序為 `claude, codex, copilot, antigravity`
- WHEN 順序變更後重跑 `agent sync`, THEN generated 檔零 diff

#### REQ-AGNT-003: Generate Claude Code CLAUDE.md
- WHEN agent sync executes, THEN CLAUDE.md generated at project root
- WHEN checking content, THEN includes Knowledge paths and available Skills list
- WHEN CLAUDE.md under 100 lines, THEN no @import (avoids token waste)

#### REQ-AGNT-006: Specify Specific CLI
- WHEN `--cli claude` specified, THEN only generate Claude Code related config
- WHEN no `--cli` specified, THEN process all detected CLIs

#### REQ-AGNT-007: Atomic Write Strategy
- WHEN write succeeds, THEN temp file renamed to target
- WHEN write fails, THEN preserve original file and report error

#### REQ-AGNT-008: Idempotent Update
entry config（CLAUDE.md/AGENTS.md）採 `prospec:auto`/`prospec:user` 區塊合併，而非整檔覆蓋。
- WHEN entry config 已存在且含區塊標記, THEN 只重生 auto 區塊、user 區塊逐位元保留
- WHEN entry config 已存在但無區塊標記（手寫）, THEN 既有內容遷入 user 區塊後再寫 auto（不丟失）
- WHEN Skill directory already exists, THEN update SKILL.md, not rebuild

---

### US-401: SDD Skill 生成與管理 [P0]

身為一名開發者，
我想要 Prospec 從 .hbs 模板自動生成 SDD Skill 檔案，
以便 AI Agent 能透過 slash command 觸發結構化的 SDD 工作流程。

**Acceptance Scenarios:**
- WHEN agent sync 執行 THEN 從 .hbs 模板生成所有 Skill 檔案
- WHEN 部署到 Claude THEN 產出 SKILL.md + references/
- WHEN 模板更新後重新 sync THEN 部署反映最新模板

#### REQ-AGNT-004: Generate SDD Skills
- WHEN agent sync executes, THEN generate Skill files from .hbs templates
- WHEN deploying to Claude, THEN each Skill gets directory with SKILL.md + references/
- WHEN deploying to Antigravity / Codex / Copilot, THEN skills-dir SKILL.md under `.agents/skills` + `references/` subdir, entry `AGENTS.md` (no `.instructions.md` format)

#### REQ-AGNT-011: Template as Single Source
- WHEN agent sync executes, THEN render final Skill files from .hbs templates
- WHEN template updated and re-synced, THEN deployed Skills reflect latest template

#### REQ-AGNT-012: Planning Skills Create Scaffolding
- WHEN `/prospec-new-story` triggered, THEN AI self-creates change directory and skeleton files
- WHEN `/prospec-ff` triggered, THEN AI sequentially completes story -> plan -> tasks

#### REQ-AGNT-013: Skill Reference Mapping
- WHEN agent sync executes prospec-design, THEN generates 6 reference files
- WHEN reference mapping added, THEN references/ has corresponding .md files

#### REQ-AGNT-014: Agent-Specific Skill Reference Paths
- WHEN rendering an entry config, THEN reference paths point at the agent's own skill dir (`{skill_path}/{name}/references/`), not a hardcoded `.prospec/skills/...` path
- WHEN deploying to any agent (all skills-dir), THEN pass `skill_path` and `base_dir` into the shared entry-config template (`agent-configs/entry.md.hbs`); references resolve under `{skill_path}/{name}/references/` for every agent (Copilot included)

#### REQ-AGNT-015: Self-Contained Skills
- WHEN a skill declares no references (e.g. knowledge-generate / knowledge-update), THEN emit no References line and no empty references dir
- WHEN a skill declares references (archive, prospec-ff), THEN bundle its own reference files so the MANDATORY reads resolve, never pointing at sibling skill dirs
- WHEN agent sync runs, THEN no skill emits a dangling or dead reference path
- WHEN prospec-archive Phase 4.5 cites its Harvest reference, THEN it resolves to archive's own `references/promotion-format.md` (rendered from the single `promotion-format.hbs` via the referenceMap), never the `prospec-learn` sibling dir — contract-guarded (the `/prospec-learn` Score/Promote hand-off is workflow, not a reference path, and remains)

#### REQ-TYPES-011: Skill Definition Constants
- WHEN new Skill added, THEN SKILL_DEFINITIONS updated
- WHEN agent sync executes, THEN generates files for all defined Skills

#### REQ-AGNT-022: Self-Contained Vendored Skill References
- WHEN agent sync runs, THEN prospec-verify deploys 1 reference and prospec-review 2, each rendered into the skill's OWN `references/` dir (self-contained — REQ-AGNT-015)
- WHEN a consuming repo lacks the addyosmani/agent-skills plugin, THEN verify/review still work — the skill bodies carry no `agent-skills:` runtime invocation (zero runtime external dependency)
- WHEN `getSkillReferences` is read, THEN prospec-verify is registered (its `hasReferences` flipped true, gating deployment) and prospec-review carries a second reference

#### REQ-AGNT-037: metadata-format Reference Registered for Scaffolding Skills
- WHEN `getSkillReferences` is read, THEN prospec-new-story and prospec-ff each carry a `metadata-format` entry (both already `hasReferences: true` — no flag flip)
- WHEN agent sync runs, THEN `metadata-format.md` is rendered self-contained into new-story and ff `references/` (REQ-AGNT-015), and each skill's `references/` dir count equals its `getSkillReferences` length
- WHEN new-story/ff SKILL.md is deployed, THEN it cites its own `references/metadata-format.md`, never a sibling skill's dir

#### REQ-TEMPLATES-083: Verify Failure-Recovery Reference
- WHEN agent sync runs, THEN `prospec-verify/references/debug-recovery-format.md` exists (verify's first `references/` dir)
- WHEN a test FAILs in Verification 5/5, THEN the skill loads it on demand for root-cause triage (reproduce-first, bisect, symptom-vs-cause) — it is NOT a Startup Loading item

#### REQ-TEMPLATES-084: Review Lens-Criteria Reference
- WHEN a review conditional lens (security / performance / maintainability) applies, THEN review loads `references/review-lenses-content.md` on demand for concrete, severity-pre-mapped criteria
- WHEN the lens content is read, THEN severity stays defined only in `review-format.md` (no second definition) and the spec-architecture lens remains prospec-owned and non-replaceable

#### REQ-TEMPLATES-085: Third-Party MIT Attribution
- WHEN a vendored reference renders, THEN it carries the FULL MIT permission+warranty text + upstream SHA `662910cd1a23` (each rendered copy is a redistributed copy)
- WHEN the repo root is checked, THEN `THIRD-PARTY-NOTICES` carries the full MIT text and the README links the source as optional further-reading / credit, NOT a dependency

#### REQ-TEMPLATES-143: Boilerplate Partials Single Source
verbatim-identical skill-template boilerplate is single-sourced as Handlebars partials (PB-006): `_next-step-handoff.hbs`（6 md5-identical skills）與 `_output-summary-note.hbs`（15 skills），17 templates 以 `{{> ...}}` 引用；`template.ts` `ensureBuiltinPartials` 註冊之。per-skill 變異段落（Entry Gate、Quality Gate、promote-backfill handoff、learn/promote output note）保留 inline。
- WHEN a shared boilerplate block is verbatim-identical across skills, THEN it lives in one partial and users reference it (no inline copy)
- WHEN templates are re-rendered + deployed, THEN SKILL.md is byte-identical to before (generated marker excepted)

#### REQ-TEMPLATES-144: SKILL.md Generated Marker
每個部署 SKILL.md 於 frontmatter 後帶 `_generated-notice.hbs` 標記，註明由 `prospec agent sync` 生成、下次 sync 覆寫、勿手改。標記 **consumer-agnostic**——不引用 prospec 內部 `src/templates/skills/` 路徑（下游安裝 prospec 的專案無此路徑，指向它會誤導），僅警示為生成檔。置於 YAML frontmatter 外（不破壞 frontmatter 解析），為唯一相對現況的輸出差異。
- WHEN a SKILL.md is deployed, THEN it carries a generated marker warning it is generated + overwritten on the next sync, with no consumer-invalid internal template path
- WHEN the marker is added, THEN it is the only output difference vs before and the frontmatter YAML stays valid

#### REQ-TESTS-047: Partial Single-Source + Marker + Byte-Sync Contract
契約測試釘住：boilerplate 已 partial 化（引用含 `{{> ...}}`、無 inline 副本）、generated 標記 per skill、partial render 展開、且**部署的 `.claude`/`.agents` SKILL.md 含完整展開的 partial 區塊**（partial 編輯未 resync → 轉紅）。mutation-verified。
- WHEN a partial include is reverted to an inline copy or the marker is removed, THEN the assertion turns red
- WHEN a partial's content/whitespace is edited without `agent sync`, THEN the byte-sync guard turns red

#### REQ-AGNT-035: 生成 skill 的 token 預算逐專案渲染（無內部符號）
`agent-sync` 於共用 `templateContext` 注入 `resolveKnowledgeTokenBudget(config)` 的 `l1_per_file`/`l2_per_module`/`readme_max_lines`；knowledge-loading skill 模板（`_knowledge-loading-rules` partial、`prospec-knowledge-generate`、`prospec-knowledge-update`）以 `{{...}}` 變數渲染預算,並將來源標示為 `.prospec.yaml` `knowledge.token_budget`（可編輯）與 `prospec check knowledge-size`（可執行）,不再具名內部常數 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`（下游無從解析）。
- WHEN 產生任一 SKILL.md,THEN 內容不含 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN `.prospec.yaml` 未覆寫,THEN 渲染預設值（L1 1800 / L2 1000 tokens、README 100 行）；設 `l2_per_module: 1200` 重新 sync 後 L2 顯示 1200

#### REQ-TESTS-049: 生成 skill 預算渲染契約
skill-format 契約斷言 rendered skill 輸出不含 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`,並以 sentinel 預算證明數字來自注入 context（非寫死）；agent-sync 單元測試斷言注入值 == `resolveKnowledgeTokenBudget`（override 命中、未設欄位回退 DEFAULT）。mutation-verified。
- WHEN 模板重新寫死預算或具名內部符號,THEN 斷言轉紅

---

### US-402: 三層 Progressive Disclosure [P0]

身為一名開發者，
我想要 Skill 採用三層漸進式揭露設計控制 token 消耗，
以便 AI Agent 只在需要時才載入深層上下文。

**Acceptance Scenarios:**
- WHEN Layer 1（名稱 + 描述）THEN 約 100 tokens
- WHEN Layer 2（SKILL.md 本體）THEN 最多 500 行
- WHEN Layer 3（references/）THEN 只在需要時載入

#### REQ-AGNT-005: Skill Progressive Disclosure Guidance
- WHEN Skill triggered, THEN AI first reads the root `{base_dir}/index.md` index
- WHEN related modules identified, THEN loads `modules/{module}/README.md`
- WHEN deeper info needed, THEN reads source code (Layer 3)

#### REQ-AGNT-009: Skill Naming Convention
- WHEN new Skill created, THEN name format is `prospec-{name}`
- WHEN deploying to .claude/skills/, THEN directory name is `prospec-{name}`

#### REQ-AGNT-010: Three-Layer Progressive Disclosure
- WHEN Layer 1 (name + description), THEN ~100 tokens
- WHEN Layer 2 (SKILL.md body), THEN max 500 lines
- WHEN Layer 3 (references/ on demand), THEN only loaded when needed

---

### US-410: Skill 語言中立化 [P1]

身為一名在 Constitution 中設定繁體中文的 Prospec 使用者，
我想要 Skill 不包含任何硬編碼的語言指令，
以便 Constitution 的語言設定不被 Skill 層級的英文輸出指令覆蓋。

**Acceptance Scenarios:**
- WHEN agent sync 生成 SKILL.md THEN 不含 `All generated files must be written in English`
- WHEN 使用者在 Constitution 指定繁體中文 THEN Skill 輸出語言遵循 Constitution

#### REQ-SKILL-009: Skill Output Language Neutrality
- WHEN agent sync generates SKILL.md, THEN contains no hardcoded language directives
- WHEN user specifies language in Constitution, THEN Skill output follows Constitution
- WHEN config has no `artifact_language`, THEN treated as English — init always seeds a Language Policy rule, and skill output language is governed by it

#### REQ-SKILL-010: Activation Language Neutrality
- WHEN Skill triggered, THEN Activation uses `When triggered, briefly describe:` (no language spec)
- WHEN AI executes Activation, THEN response language determined by external mechanism

#### REQ-SKILL-012: Artifact Skills Follow Constitution Language Policy
產文件 skills（new-story/plan/tasks/ff/design/archive/learn/knowledge-generate/knowledge-update）經共用 partial（`{{> language-policy}}`）載入顯式遵守指令，僅指向 Constitution、不硬編碼語言名稱。
- WHEN rendering an artifact-producing skill, THEN it contains a Language Policy section pointing at the Constitution rule
- WHEN grepping skill templates, THEN `written in English` count is 0 (neutrality preserved)

---

### US-411: Prospec 產物英文 Baseline [P1]

身為英語系或國際團隊的 prospec 使用者，
我想要 init 與 agent sync 產生的所有文件與 Skill 皆為英文，
以便產物語言一致、可跨團隊共享。

**Acceptance Scenarios:**
- WHEN init + agent sync THEN 產出的 entry configs、SKILL.md、references、scaffolds 不含中文（使用者自選語言的渲染值除外）
- WHEN 檢查 `src/templates/` THEN 無任何中文內容

#### REQ-TEMPLATES-073: Templates English Baseline
`src/templates/` 全部 `.hbs` 內容統一英文；文件語言一律由 Constitution Language Policy 決定，模板不硬編碼。
- WHEN scanning `src/templates/`, THEN zero files contain CJK characters
- WHEN init/agent sync render outputs, THEN no Chinese except the user-chosen language value itself

#### REQ-SKILL-011: Skill Definitions English with Trigger Baseline
`SKILL_DEFINITIONS` descriptions 英文化；每筆 skill 含非空英文 `triggers` baseline。
- WHEN rendering entry configs, THEN the skills list descriptions are English
- WHEN any skill definition is added, THEN it carries a non-empty `triggers` array (contract-tested)

#### REQ-AGNT-031: Skill Description Single Source
`skill.ts` SKILL_DEFINITIONS `description` 是每個 skill 描述的單一來源。agent-sync 每-skill render context 傳入 `skill_description`（`escapeYamlScalar`），skill `.hbs` frontmatter 渲染 `"{{skill_description}} Triggers: {{trigger_words}}"`（不硬編）；CLAUDE.md/AGENTS.md registry 與 SKILL.md frontmatter 同源、不漂移。
- WHEN 生成 SKILL.md, THEN frontmatter description 逐字等於 skill.ts `description`（escaped-scalar 解析後 round-trip；equivalence contract test、mutation-verified）
- WHEN 檢視 verify description, THEN 反映現行 5+1 維

#### REQ-AGNT-032: Agent-Sync Orphan Sweep
`agent-sync` 生成後 `sweepOrphanSkillDirs` 掃各 agent skillPath 下 `prospec-*` 目錄，移除不在 `SKILL_DEFINITIONS` 者（top-level、跳過非目錄/symlink/非 `prospec-` 名）；移除項收入 `AgentSyncResult.removedSkills` 並由 formatter 回報。
- WHEN `prospec-<gone>` 不在當前清單, THEN 被移除且回報（`prospec-` 前綴為保留字）
- WHEN 目錄非 `prospec-` 前綴（user skill）, THEN 保留

#### REQ-AGNT-033: Collision-Free, Prospec-Specific Trigger Baselines
baseline 觸發詞（skill.ts）無跨 skill substring 或 exact-dup 碰撞，且為 **prospec-specific**——移除與 CLI 指令同名或一般開發對話常見的裸泛用詞（check/change/upgrade/setup/done/critical/feedback/clean up/I want to/migrate version/version bump），改用 prospec-qualified 片語（如 `upgrade prospec`/`user story`/`quality check`/`finalize change`/`technical plan`）；本專案 `.prospec.yaml` 中文觸發詞一併無碰撞且同樣收斂。每個 skill ≥3 詞（由 REQ-TESTS-053 機器強制）。
- WHEN 防碰撞 contract test 對 baseline 跑, THEN 0 violation（跨 skill substring + exact-dup）
- WHEN 對 `.prospec.yaml` skill_triggers 跑同一偵測器, THEN 0 violation
- WHEN 檢視任一 skill, THEN triggers 為 prospec-specific 片語且 ≥3 詞（無裸泛用詞）

#### REQ-TESTS-046: Agent-Sync Hygiene Contract
契約/單元測試釘住：description 等價性（每 skill registry↔frontmatter，escaped round-trip）、orphan sweep（移除 orphan + 保留 user skill + 回報）、trigger 防碰撞（baseline + `.prospec.yaml`，0 violation）。全部 mutation-verified。
- WHEN 改壞任一（description 漂移／sweep 誤刪或漏刪／新增碰撞）, THEN 對應斷言轉紅

#### REQ-TESTS-053: Minimum Trigger Count Contract (≥3 per skill)
skill-format 契約斷言每個 `SKILL_DEFINITIONS` skill `triggers.length >= 3`，把 REQ-AGNT-033 的「≥3 詞」意圖由 spec 文字升級為機器強制（此前唯一機器約束為 `> 0`，故 prospec-plan 的 2 詞缺口無守門）。實斷言與 mutation guard 共用 `skillsBelowMinTriggers` 述詞，鬆綁下限會同時打紅兩者。
- WHEN 任一 skill triggers 少於 3 詞, THEN 斷言轉紅
- WHEN 全 17 skill ≥3, THEN 斷言綠；mutation guard 以真 `SKILL_DEFINITIONS` + 合成 2-trigger skill 證述詞非 vacuous

---

### US-412: 使用者語言 Trigger Words 注入 [P1]

身為以母語描述需求的 prospec 使用者，
我想要 skill 的觸發詞可以包含我的主要語言，
以便用母語描述需求時 skill 仍能可靠觸發。

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` 設有 `skill_triggers` THEN SKILL.md frontmatter Triggers 為英文 baseline + 自訂詞
- WHEN 主要語言非英文且無自訂詞 THEN Triggers 行尾追加 `or equivalent terms in {語言}` 提示
- WHEN agent sync 產生非-frontmatter-surfacing agent 的 entry config THEN 含主要語言宣告（L0）與每個 skill 的 Triggers 行（frontmatter-surfacing agent 如 claude 為精簡 registry，triggers 由 SKILL.md frontmatter surface）

#### REQ-AGNT-019: Trigger Words Synthesis
agent sync 合成 frontmatter Triggers：英文 baseline + `skill_triggers` 自訂詞（經 YAML escape）；非英文（大小寫不敏感判定）且無自訂詞時追加語意 fallback 提示。
- WHEN custom triggers exist, THEN frontmatter = baseline + custom words (quotes/newlines escaped, frontmatter stays valid YAML)
- WHEN non-English language with no custom triggers, THEN append `— or equivalent terms in {language}`
- WHEN English (case-insensitive) with no custom triggers, THEN baseline only
- WHEN `skill_triggers` has an unknown skill key, THEN warn (stderr, even in quiet mode) and ignore it; empty arrays count as unset

#### REQ-AGNT-020: Entry Config Language Declaration
entry config 含主要語言宣告（L0 常駐；`artifact_language` 缺席或空白視同 English）。skill registry 依 agent 分流：runtime 不會自動 surface SKILL.md frontmatter 的 agent（AGENTS.md 群組）保留完整逐 skill 表（含每個 skill 的 Triggers 行），旗標缺省亦然；會自動 surface 的 agent（claude → CLAUDE.md）改渲染精簡 `/prospec-*` 指引段，其 trigger 詞由 SKILL.md frontmatter surface（不在 entry config 重列）。
- WHEN syncing a non-frontmatter agent with language X, THEN the entry config declares X and lists per-skill trigger words
- WHEN syncing a frontmatter-surfacing agent (claude), THEN the entry config declares the language but renders a slim registry pointer (no per-skill Triggers)
- WHEN the field is absent or blank, THEN the declaration renders English

#### REQ-AGNT-021: Skill Triggers Population Hint
agent sync 計算缺漏集合（`computeUnlocalizedSkills` 單一來源，見 REQ-SERVICES-066）。非英文且集合非空時 hint 引導執行 `prospec agent triggers` 取得可翻譯 scaffold：全空 → 通用引導；部分缺（既有已譯、新 skill 未譯）→ 具名列出缺觸發詞的 skill、只補缺。英文或全齊 → 無 hint。
- WHEN non-English language and some skills lack a `skill_triggers` entry (partial), THEN the hint names those skills and directs running `prospec agent triggers` to fill only the missing ones
- WHEN non-English language and no `skill_triggers` at all, THEN the hint names the language and directs running `prospec agent triggers` (generic guidance)
- WHEN every skill has a `skill_triggers` entry or the language is English, THEN no hint

---

### US-420: 多 Agent 平台支援 [P1]

身為一名同時使用多個 AI Agent 的開發者，
我想要 Prospec 為不同 Agent 平台生成對應配置與 Skill，
以便在 Claude Code、Antigravity CLI、Copilot、Codex 等之間無縫切換。

**Acceptance Scenarios:**
- WHEN 偵測到多個 AI CLI THEN 為每個平台生成對應配置
- WHEN antigravity/codex/copilot 並存 THEN 收斂至 `.agents/skills` + `AGENTS.md`（共用 agents.md 開放標準）
- WHEN 使用 `--cli` 指定特定平台 THEN 只生成該平台配置

#### REQ-AGNT-017: Shared-Standard Output Dedup
- WHEN multiple configured agents resolve to the same `(skillPath, configPath)` — antigravity / codex / copilot all use `.agents/skills` + `AGENTS.md` — THEN agent-sync writes each physical file once
- WHEN sync completes, THEN `totalFiles` equals the actual files on disk (no double counting)
- WHEN a single agent or no shared signature, THEN behavior is unchanged

_(Cross-references: REQ-AGNT-001 Detection, REQ-AGNT-004 Skills Generation — 完整 Scenarios 見 US-400/US-401)_

---

### US-430: Startup Loading 靜態優先排序（cache-stable prefix） [P1]

身為任一支援 agent 的 prospec 使用者，
我想要每個 skill 的 Startup Loading 以靜態內容在前、動態內容在後的順序載入，且每項標注 `[STABLE]` 或 `[DYNAMIC]`，
以便每次觸發 skill 時 provider 的 prompt cache 前綴最大化，API 成本更低、回應更快。

**Acceptance Scenarios:**
- WHEN 渲染任一 skill 模板 THEN 所有 `[STABLE]` 項排在所有 `[DYNAMIC]` 項之前，且每個載入項都帶其中一種標注
- WHEN 比對排序變更前後 THEN 載入項集合不變（只改順序與標注）
- WHEN 執行 `prospec agent sync` THEN 已部署 SKILL.md 與模板同步

#### REQ-TEMPLATES-080: Startup Loading 靜態優先排序與標注
判準：`[STABLE]`＝僅 sync/治理變更時動（references 格式規格、Constitution、_conventions）；`[DYNAMIC]`＝隨 knowledge 更新、change 或每次觸發變動。
- WHEN 檢視任一模板的 Startup Loading, THEN 每個編號項帶標注且 STABLE 全部在 DYNAMIC 之前
- WHEN contract 斷言執行, THEN 標注完整性與順序由 section-scoped、mutation-verified 測試守護

#### REQ-TEMPLATES-081: 載入項集合不變性
- WHEN 排序變更, THEN 載入項 link/path 集合與版控基準（startup-loading-baseline.json）一致、MANDATORY 計數不變
- WHEN 載入清單被 prose 打斷（CommonMark 清單斷裂）, THEN contiguity 斷言轉紅

#### REQ-TEMPLATES-082: entry config Layer 0 穩定性
- WHEN 渲染 entry config（CLAUDE.md / AGENTS.md）, THEN 全部變數於 sync 時解析、無 per-trigger 變動值；Available Skills 列表每專案固定、判定 [STABLE]
- WHEN 模板排序變更後, THEN `prospec agent sync` 使部署檔與模板一致

---

### US-431: Entry-Config 排除型 Onboarding Skill [P1]

身為 prospec 維護者與下游使用者，
我希望一次性 onboarding skill 部署為可觸發的 SKILL.md、但不列入常駐 entry config，
以便一次性流程不對每個後續 session 課 token 成本（G4）。

**Acceptance Scenarios:**
- WHEN agent sync 執行 THEN `excludeFromEntryConfig` skill 的 SKILL.md 寫到磁碟、但不出現在 CLAUDE.md/AGENTS.md
- WHEN 比對 entry config skill 清單 THEN 該 skill 不在其中、卻仍可被 slash command 觸發
- WHEN 觸發 `/prospec-quickstart` THEN 在地化 triggers、re-sync、產生 AI Knowledge（搭 project-setup US-010 的 CLI quickstart）

#### REQ-TYPES-030: excludeFromEntryConfig Skill Field
`SkillConfig` 新增 optional `excludeFromEntryConfig`（absent=false）；`SKILL_DEFINITIONS` 的 entry-excluded 集合為恰好 `{prospec-quickstart, prospec-upgrade}`——兩者皆 `_conventions.md` 明文授權的 self-terminating one-shot（onboarding / migration·repair）。
- WHEN reading `SKILL_DEFINITIONS`, THEN it contains prospec-quickstart and prospec-upgrade with `excludeFromEntryConfig: true`
- WHEN the field is absent on a skill, THEN it defaults to false (backward-compatible; existing skills unaffected)
- WHEN auditing definitions, THEN the entry-excluded set is exactly `{prospec-quickstart, prospec-upgrade}` (contract-asserted)

#### REQ-AGNT-023: Entry Config Excludes excludeFromEntryConfig Skills
agent-sync 渲染 entry config（CLAUDE.md/AGENTS.md，always-loaded Layer 0）的 skill 清單時排除 `excludeFromEntryConfig` skills；`syncSkillsDirSkills` 維持 iterate 完整 `SKILL_DEFINITIONS`，故其 SKILL.md 仍部署。維持 L0 穩定（REQ-AGNT-020 / REQ-TEMPLATES-082）與 entry config <100 行（REQ-AGNT-003），且不抵觸 REQ-TYPES-011（所有 skill 仍產生檔案）。
- WHEN agent sync runs, THEN an `excludeFromEntryConfig` skill is absent from the entry config Available Skills list
- WHEN agent sync runs, THEN that skill's SKILL.md (and references, if any) is still written to each agent skill dir
- WHEN the exclusion filter is removed, THEN the contract test goes red (mutation-verified)

#### REQ-TEMPLATES-108: prospec-quickstart Onboarding Skill Template
`skills/prospec-quickstart.hbs`：探測 `prospec --version`；Step 1「只補缺」——先跑 `prospec agent triggers` 取得 fill-missing scaffold（baseline 來自 `SKILL_DEFINITIONS`，非 grep 已部署 SKILL.md），翻譯 scaffold values 並補入，既有條目不覆寫（snapshot → show-and-confirm → minimal in-place edit → 讀回驗證 YAML）；Bash `agent sync`；Bash `knowledge init`；chain（不 inline）至 `/prospec-knowledge-generate`；CLI 不可用時 graceful fallback。含 Output Contract + NEVER、English-only。
- WHEN rendered, THEN it carries an Output Contract (objectively-checkable Success Criteria) and a NEVER section
- WHEN non-English and some skills lack a `skill_triggers` entry, THEN run `prospec agent triggers` for the scaffold, translate only the missing ones (existing entries untouched), confirm with the user, write via a minimal in-place edit, and read back to validate YAML
- WHEN the prospec CLI is unavailable, THEN state it and fall back to manual steps, never proceed silently
- WHEN finishing, THEN chain into `/prospec-knowledge-generate` rather than inlining its workflow

#### REQ-TESTS-029: Entry-Config Exclusion Contract Test (mutation-verified)
section-scoped、結構感知、mutation-verified 契約測試：斷言 entry-excluded 集合為 `{prospec-quickstart, prospec-upgrade}`（順序無關）、兩者皆缺席於 entry-config skills context 但 SKILL.md 仍產出；`SKILL_DEFINITIONS.length` 斷言為 17；移除/反轉排除 filter 須轉紅。
- WHEN the test runs, THEN it asserts both quickstart and upgrade are absent from the entry-config context yet each SKILL.md is still generated, and `SKILL_DEFINITIONS.length` is 17
- WHEN the exclusion filter is deleted or inverted, THEN the test fails (mutation-verified)

---

### US-432: prospec-promote-backfill skill 註冊、部署與 scale 登錄 [P2]

身為一個維護 prospec skill 集的開發者，
我想要新的 `prospec-promote-backfill` skill 被正式註冊（`SKILL_DEFINITIONS`）、其 references 被 `agent sync` 部署、`scale: backfill` 登錄進 `CHANGE_SCALES` enum，且 user-facing 文件反映它，
以便這個 backfill 晉升 skill 在各 agent dir 一致部署、scale 值有型別契約、使用者文件不漏列。

**Acceptance Scenarios:**
- WHEN `agent sync` 執行 THEN `.claude/skills/`、`.agents/skills/` 皆部署 `prospec-promote-backfill/SKILL.md` + 其 references（proposal + delta-spec-format）
- WHEN 讀 `CHANGE_SCALES` THEN 含 `backfill`（第 4 值），`ChangeMetadataSchema.safeParse({scale:'backfill'})` 成功
- WHEN 讀 user-facing 文件 THEN `README.md`/`README.zh-TW.md`（skill 目錄 + brownfield workflow）與 `CLAUDE.md` 皆含該 skill、skill 計數 16

### Behavior Specifications

#### REQ-TYPES-032: SKILL_DEFINITIONS 註冊 promote skill
`src/types/skill.ts` `SKILL_DEFINITIONS` 新增 `prospec-promote-backfill`（Lifecycle、`hasReferences: true`），總數 15→16，描述同步 `.hbs` frontmatter（雙寫：frontmatter render 進 SKILL.md、SKILL_DEFINITIONS 供 CLAUDE.md/entry config）。
- WHEN 讀 `SKILL_DEFINITIONS`, THEN 含 `prospec-promote-backfill`、`hasReferences:true`、count 16
- WHEN triggers 比對, THEN 不與既有 skill 衝突

#### REQ-TYPES-033: CHANGE_SCALES enum 納入 backfill
`src/types/change.ts` `CHANGE_SCALES` 由 `['quick','standard','full']` 擴為含 `'backfill'`，使 `ChangeMetadata.scale` 型別與 Zod enum 能表示 backfill；`change.test.ts` 對應改斷言四值。
- WHEN `safeParse({scale:'backfill'})`, THEN success
- WHEN enum-membership 斷言, THEN 為四值、enum-reject 測試仍有效

#### REQ-SERVICES-030: agent-sync 部署 promote skill references
`agent-sync.service.ts` `getReferenceMap()` 新增 `prospec-promote-backfill` 條目（proposal-format + delta-spec-format——輕量 scaffold 只需這兩個），`agent sync` 部署該 skill 與 references。
- WHEN `getReferenceMap('prospec-promote-backfill')`, THEN 回傳 proposal + delta-spec references
- WHEN `agent sync` 後, THEN 各 agent skill dir 含 SKILL.md + 2 references

#### REQ-AGNT-024: user-facing 文件反映新 skill
`README.md`/`README.zh-TW.md` 的 skill 目錄表列 + brownfield workflow 小節雙語同步新 skill 且 header skill 計數 16/15；`CLAUDE.md` Available Prospec Skills 同步（由 `agent sync` 從 `SKILL_DEFINITIONS` 重生）。
- WHEN 讀兩份 README, THEN skill 目錄表 + workflow 皆含 `prospec-promote-backfill`、計數 16
- WHEN 讀 `CLAUDE.md`, THEN Available Prospec Skills 含該 skill

---

### US-433: /prospec-upgrade 判斷式收尾升級 skill [P1]

身為使用非英文（或剛新增 skill）的 prospec 使用者，
我希望一個 skill 讀取 upgrade report，為新 skill 補譯觸發詞、視需要遷移過時的 curated 格式，全程附確認與 diff 預覽，
以便升級中需要判斷的部分由 AI 協助但人工把關，命令永不擅自改寫我的 trust-zone。

**Acceptance Scenarios:**
- WHEN 觸發 `/prospec-upgrade` 且 report 列出缺觸發詞的新 skill, THEN 只為缺的 skill 翻譯觸發詞、show-and-confirm 後以最小 in-place 編輯寫入 `skill_triggers` 並讀回驗證 YAML
- WHEN report 標示 curated doc 格式落後, THEN 提出遷移建議並附 git diff 預覽，經使用者確認後才寫入
- WHEN 使用者不確認任一遷移, THEN 該 zone 3 檔保持不動，skill 不擅自改寫
- WHEN skill 收尾, THEN 重跑 `prospec agent sync` 使部署反映最新觸發詞

#### REQ-TYPES-035: SKILL_DEFINITIONS Registers prospec-upgrade
`SKILL_DEFINITIONS` 新增 `prospec-upgrade`（type `Lifecycle`、`hasReferences:false`、`cliDependency:'prospec upgrade'`、`excludeFromEntryConfig:true`），總數 16→17，描述與 `.hbs` frontmatter 同步（雙寫）。觸發詞不與既有 skill 衝突。
- WHEN 讀 `SKILL_DEFINITIONS`, THEN 含 `prospec-upgrade`、`excludeFromEntryConfig:true`、count 17
- WHEN triggers 比對, THEN `prospec-upgrade` 不與既有 skill 觸發詞衝突
- WHEN agent sync 執行, THEN 各 agent skill dir 部署 `prospec-upgrade/SKILL.md`

#### REQ-TEMPLATES-121: prospec-upgrade Skill Template
`templates/skills/prospec-upgrade.hbs`（judgment skill，English-only baseline）：(1) 執行 `prospec upgrade --no-interactive` 讀 report（version 已升、agent 已 sync、缺觸發詞 skill 清單、docs inventory）；(2) 以 report 的 `Docs inventory:` 為**唯一掃描範圍**（清單與 init 同源自 `INIT_DOC_REGISTRY`——skill 內不維護任何寫死文件清單）：present 文件對照已安裝 prospec 套件的最新模板偵測格式落差、逐檔顯示 diff、詢問使用者同意後才更新；MISSING 文件顯示將寫入的內容、詢問同意後自最新模板建立（套件模板不可得時 graceful 跳過並回報；report 無 docs 區段＝CLI/skill 版本錯位 → 跳過此步並提示重跑 `prospec upgrade`）；若偵測到 legacy `ai-knowledge/_index.md`，提議遷移至根層級 `{base_dir}/index.md`（保留 `prospec:user` 區塊與 curated Modules 表列，遷移成功後刪除舊檔）；(3) 依 `artifact_language`，先跑 `prospec agent triggers` 取 fill-missing scaffold、為缺觸發詞的 skill 補譯 `skill_triggers`（只補缺、snapshot/confirm/最小 in-place/讀回驗證 YAML）→ 再次 `prospec agent sync`。含 Output Contract + NEVER；Startup Loading 靜態優先 `[STABLE]/[DYNAMIC]`。
- WHEN rendered, THEN 帶 Output Contract 與 NEVER 段、無硬編碼語言指令（English baseline）、Step 2 無寫死的 convention-doc 清單（契約負向斷言釘住）
- WHEN report 將某檔標記 MISSING 且使用者同意補建, THEN 自最新模板建立；未同意則不動
- WHEN present 文件與最新模板格式不符, THEN 逐檔 diff + 詢問同意後才改；未同意則該檔不動
- WHEN `artifact_language` 非英文且有缺觸發詞 skill, THEN 先跑 `prospec agent triggers` 取 scaffold、只譯缺的、confirm 後最小 in-place 寫入 `skill_triggers` 並讀回驗證 YAML
- WHEN 收尾（有任何變更）, THEN 再次執行 `prospec agent sync` 使部署反映最新觸發詞

#### REQ-AGNT-026: User-Facing Docs Reflect prospec-upgrade
`README.md`/`README.zh-TW.md` 的 skill 目錄表 + lifecycle workflow 小節雙語同步新增 `prospec-upgrade` 與 `prospec upgrade` CLI 指令、header skill 計數 16→17；`CLAUDE.md` Available Prospec Skills（由 agent sync 從 `SKILL_DEFINITIONS` 重生）同步；根層級 `index.md` templates 模組描述「16 skills」→「17 skills」。
- WHEN 讀兩份 README, THEN skill 目錄 + workflow 皆含 `prospec-upgrade`、計數 17、含 `prospec upgrade` 指令
- WHEN 讀 `CLAUDE.md`, THEN Available Prospec Skills 含 `prospec-upgrade`
- WHEN 讀根層級 `index.md`, THEN templates 模組描述 skill 計數一致為 17

---

### US-434: 關閉觸發詞再本地化入口缺口 [P2]

身為新增 skill 後想補本地化觸發詞的 prospec 使用者，
我希望 agent sync 主動偵測「已在 `SKILL_DEFINITIONS` 但缺 `skill_triggers` 條目」的新 skill 並具名提示，且 onboarding/upgrade skill 只補缺的觸發詞，
以便我永遠不需要刪除 `.prospec.yaml` 重跑 init 來重新本地化（即不再踩 init 覆寫破口）。

**Acceptance Scenarios:**
- WHEN 非英文專案且某些 skill 缺 `skill_triggers` 條目, THEN agent sync 在 hint 中具名列出缺觸發詞的 skill（見 REQ-AGNT-021）
- WHEN 所有 skill 都已有 `skill_triggers` 條目（或語言為英文）, THEN 不輸出缺觸發詞 hint
- WHEN onboarding/upgrade skill 處理觸發詞, THEN 解除「`skill_triggers` 非空即整批 skip」的 all-or-nothing 條件，改成只補缺的條目（見 REQ-TEMPLATES-108）

_(此 Story 的契約由 REQ-AGNT-021 與 REQ-TEMPLATES-108 承載——兩者於原 US 下 Replace-in-Place 更新，不在此重複 REQ 區塊。)_

---

### US-435: agent 設定檔保留使用者手寫內容 [P1]

身為在 CLAUDE.md/AGENTS.md 維護自訂指示的開發者，
我希望 agent sync 只重生 prospec 管理的區塊、保留我手寫的部分，且 init/sync 對無區塊的既有檔改為遷移而非覆蓋，
以便 sync/quickstart/upgrade 不再摧毀我的自訂 agent 指示。

**Acceptance Scenarios:**
- WHEN agent sync 寫入的 CLAUDE.md/AGENTS.md 含 `prospec:auto`/`prospec:user` 區塊, THEN 只更新 auto 區塊、user 區塊逐位元保留
- WHEN 目標檔為無區塊的既有內容, THEN 既有內容整段遷入 user 區塊、prospec entry config 填入 auto 區塊（不丟失）
- WHEN 連續執行兩次 agent sync, THEN 輸出 byte-identical（idempotent）

#### REQ-LIB-021: Managed-Doc Block Merge Primitive
`lib/content-merger` 提供 `mergeManagedDoc(generated, existing)` 純函式集中三條合併路徑，並 export `hasAutoBlock`/`replaceAutoBlock`（以 marker 常數為單一來源、function-replacer 保 `$` 安全）供 mergeManagedDoc 與 knowledge-update 共用。
**Scenarios:**
- WHEN existing 含 auto 區塊, THEN 就地取代 auto 區塊、保留其餘（含 user 區塊與區塊外內容），`$&`/`$$` 逐字插入
- WHEN existing 無區塊但非空, THEN 既有內容置入 generated 的 user 區塊
- WHEN existing 為空, THEN 原樣回傳 generated；對自身輸出再合併為 byte-identical（idempotent）

#### REQ-AGNT-027: Entry Config Auto/User Block Merge
`agent sync` 的 `generateEntryConfig` 改為「render → 讀既有目標檔 → `mergeManagedDoc` → `atomicWrite`」，不再無條件覆蓋；quickstart/upgrade 經 agent sync 自動沿用。
**Scenarios:**
- WHEN 目標 entry config 含區塊標記, THEN 只重生 auto、保留 user
- WHEN 目標為無區塊既有內容, THEN 遷入 user 區塊
- WHEN 多個共用標準 agent 收斂至同一 AGENTS.md, THEN 仍只寫一次（見 REQ-AGNT-017）

#### REQ-TEMPLATES-123: Agent Config Templates Carry Block Markers
`agent-configs/entry.md.hbs`（CLAUDE.md 與 AGENTS.md 共用的單一 entry-config 模板——`init/agents.md.hbs` 已刪除，init 的 `AGENTS.md` 亦由此模板渲染）的輸出把全部 prospec 內容包進 `prospec:auto`，其後附空的 `prospec:user` 區塊；marker 字串與 `content-merger` 常數逐字一致；auto 區塊含指向根層級 `{base_dir}/index.md` 的 L0-L3 導航約束。
**Scenarios:**
- WHEN 渲染該模板, THEN auto 區塊包覆全部 prospec 內容（含 L0-L3 導航約束）、其後緊接空 user 區塊

---

### US-436: 建立四層分層索引結構 [P1]

身為 AI 代理與開發者,
我想要將 `ai-knowledge/_index.md` 提升至 `prospec/index.md` 並實作 L1~L3 索引與動態掃描過濾機制 (核心須於任務開始時主動讀取，其餘 load-on-demand)，同時將 L0 指引保留於 `AGENTS.md`/`CLAUDE.md`,
以便能夠減少 context overhead 並精準控管 Token budget。

**Acceptance Scenarios:**
- WHEN `prospec/index.md` 產生時, THEN 應包含 L1~L3 分層說明，且 L1 Conventions 區分核心（Core）清單與 load-on-demand 檔案清單。
- WHEN 執行 `prospec-knowledge-generate` 或 `update` 時, THEN 應將內容正確寫入至根目錄的 `prospec/index.md`。
- WHEN 掃描 `ai-knowledge/` 下的 `_*.md` 檔案時, THEN 能依據核心清單過濾出核心與 load-on-demand 的檔案。

#### REQ-AGNT-029: L0 Navigation Guidance
- WHEN `AGENTS.md` and `CLAUDE.md` are generated, THEN the `prospec:auto` block contains instructions explicitly pointing to `prospec/index.md` for L1-L3 knowledge.
- WHEN generating the Core Resources list, THEN `_diagram-conventions.md` is included alongside `_conventions.md`.

---

### US-437: skill 生成契約的 vitest 化與計數單一來源 [P1]

身為 prospec 維護者,
我想要 skill / agent-config 生成契約檢查在 vitest(因而 CI)內執行,且計數斷言從單一來源 derive、狀態引用改 named-set 契約,
以便契約漂移在 PR 就變紅、而非溜到 release commit,且合法的 skill 集變更不留 stale magic number。

**Acceptance Scenarios:**
- WHEN 在 PR 上跑 CI `test:coverage` THEN 生成契約以 vitest real-temp-dir 斷言執行(真實 `init` + `agent sync`、真實模板、read-back 產出)
- WHEN 任一生成契約被破壞(skill 少 reference、`.claude`/`.agents` 鏡像不一致、狀態引用增減) THEN 對應 vitest 測試 RED
- WHEN skill 集或 reference 數因合法變更而改變 THEN 期望值自動反映,無需手改寫死數字

#### REQ-TESTS-038: 生成契約於 vitest real-temp-dir 執行並進 CI
`verify-skills.sh` 的 28 項(A–G 段)生成契約以 vitest 整合測試(`tests/integration/skill-contract.test.ts`)承接:於臨時目錄跑真實 `init` + `agent sync`(真實模板,不 mock `template.js`、不依賴 `dist/` 或 spawned CLI),由既有 `test:coverage` 執行(納入 `ci.yml`)。
- WHEN 檢視測試, THEN 原 28 項 A–G 檢查皆有對應斷言(可逐項對照)
- WHEN `pnpm test:coverage` 執行, THEN 該測試被納入;破壞任一契約 → 對應斷言 RED

#### REQ-TESTS-039: 計數自單一來源 derive、狀態引用改 named-set 契約
契約計數期望值從單一事實來源 derive(不寫死字面);`_status-lifecycle.md` 引用檢查由 magic integer 改為明列 skill 的 named-set 契約,對真實 render 比對集合相等;至少一項斷言對真實 filesystem 產出交叉驗證,避免 derived-vs-derived 自洽。
- WHEN 讀契約測試, THEN reference 計數 derive 自 `getSkillReferences`、skill 數 derive 自 `SKILL_DEFINITIONS`,無 `4`/`1`/`2`/`26` 等寫死字面
- WHEN 某 skill 誤增/減 `_status-lifecycle.md` 引用, THEN rendered 集合 ≠ named-set → RED
- WHEN 生成邏輯少寫/多寫 reference, THEN 真實產出的 readdir 數 ≠ derived 期望 → RED

#### REQ-AGNT-030: skill→reference map 匯出為單一來源
`agent-sync.service.ts` 內原 module-private 的 `getSkillReferences` / `SkillReference` 暴露為匯出的單一來源,供測試 derive reference 計數;純新增 export,生成產出 byte-identical。
- WHEN 讀 `getSkillReferences` / `SkillReference`, THEN 皆為 services 匯出、測試可匯入
- WHEN 匯出後重跑 `agent sync`, THEN 產出的 SKILL.md / references / entry configs 零 diff

#### REQ-TESTS-040: 移除 bash 契約來源與其文件引用
契約搬入 vitest 後,移除冗餘的 `scripts/verify-skills.sh` 與 `package.json` `verify:skills`,並同步移除兩份 README 的 verify:skills 段,達成單一 test runner、無 split-brain。
- WHEN grep `verify:skills` / `verify-skills.sh`(排除 `_lessons-ledger` 與 `_archived-history` 歷史), THEN 無 live/dangling 引用
- WHEN 契約搬移完成, THEN 受影響套件計數逐層 `vitest run` 重導並跨 README ×2 + `index.md` + tests README 校正一致

### US-438: L0 skill registry 精簡 + reference on-demand 化 [P1]

身為 prospec 框架維運者暨每個下游 claude session，
我想要 L0 registry 對會自動 surface SKILL.md frontmatter 的 agent 精簡、format references 分 phase on-demand 載入、且 knowledge-generate 不重複內嵌 conventions 骨架，
以便每 session 省下重複的 registry tokens、降低觸發邊際 context，並消除格式雙載的漂移風險。

**Acceptance Scenarios:**
- WHEN agent sync 對 claude（surfacesSkillFrontmatter=true）產生 CLAUDE.md，THEN registry 為精簡 `/prospec-*` 指引段，不逐 skill 列表
- WHEN agent sync 對 codex/copilot/antigravity 產生 AGENTS.md，THEN registry 保留完整逐 skill 表
- WHEN 觸發 ff/plan/archive，THEN format references 不在 Startup Loading MANDATORY 全載，改於對應 phase on-demand 讀取（Startup Loading 的 `**MANDATORY**` 計數為 0）
- WHEN 檢視 knowledge-generate Step 4，THEN 不內嵌 README 骨架，改指向 canonical `_module-readme-conventions.md`（Startup Loading 仍載入該 canonical 檔）

#### REQ-TYPES-059: AgentConfig SKILL.md Frontmatter Flag
`AgentConfig` 帶 `surfacesSkillFrontmatter: boolean`（`AGENT_CONFIGS`：claude=true、codex/copilot/antigravity=false）—— entry registry 分流的單一來源。
- WHEN 讀 `AGENT_CONFIGS`, THEN `claude.surfacesSkillFrontmatter` 為 true 且其餘為 false
- WHEN 新增 agent, THEN 該欄位為必填（型別強制，不可遺漏）

#### REQ-AGNT-034: Per-agent Entry Registry Rendering
`agent-sync.service` `generateEntryConfig` 於 `entry.md.hbs` render context 傳入 `surfaces_skill_frontmatter`（取自對應 `AgentConfig`），沿用單一共用 entry 模板。
- WHEN 對 claude render entry, THEN context `surfaces_skill_frontmatter` 為 true
- WHEN 對 AGENTS.md 群組 render, THEN context `surfaces_skill_frontmatter` 為 false
- WHEN 產生 entry, THEN 不新增 per-agent `.hbs` 模板

#### REQ-TEMPLATES-146: entry.md.hbs Conditional Registry
`entry.md.hbs` 以 `{{#if surfaces_skill_frontmatter}}` 分流：true 渲染精簡指引段（≤300 bytes），false／旗標缺省渲染 `{{#each skills}}` 完整表（含每 skill Triggers 與 References）。
- WHEN `surfaces_skill_frontmatter` 為 true, THEN 輸出精簡段、無逐 skill 表
- WHEN false 或缺省, THEN 輸出完整逐 skill 表（unknown agent 安全預設為完整）

#### REQ-TEMPLATES-147: Per-phase On-demand Format References
`prospec-ff`/`prospec-plan`/`prospec-archive` 的 format references 移出 Startup Loading（原 `[STABLE] **MANDATORY**`），改於使用該 format 的 phase on-demand 讀取；措辭比照 archive promotion-format / verify debug-recovery / design adapter 先例；reference 部署集合不變。
- WHEN 檢視三 skill 的 Startup Loading, THEN `**MANDATORY**` 計數為 0
- WHEN 進入使用某 format 的 phase, THEN 該 phase 段落含對應 reference 的 on-demand 讀取指令
- WHEN agent sync 部署, THEN 各 skill `references/` 內容與數量不變

#### REQ-TEMPLATES-148: knowledge-generate Canonical-only README Structure
`prospec-knowledge-generate` Step 4 不再內嵌 Recipe-First 骨架鏡像，改指向 canonical `{{knowledge_base_path}}/_module-readme-conventions.md`（Startup Loading 仍載入該 canonical 檔）。
- WHEN 檢視 Step 4, THEN 無內嵌 README 骨架、僅存指向 canonical 檔的指引
- WHEN 檢視 Startup Loading, THEN canonical `_module-readme-conventions.md` 載入保留

---

### US-439: CLI 吐出可翻譯的 trigger 在地化 scaffold [P1]

身為在非英文專案跑 quickstart / upgrade onboarding 的 prospec 使用者，
我希望 CLI 吐出「尚未在地化 skill + 其英文 trigger baseline」、格式正確的 `skill_triggers` scaffold，
以便我的 AI agent 就地翻譯 values 即可完成在地化，不必猜 YAML 結構、也不必 grep 已部署 SKILL.md。

**Acceptance Scenarios:**
- WHEN 非英文專案且部分 skill 缺 `skill_triggers` 條目 THEN `prospec agent triggers` 只輸出缺條目的 skill、每筆帶英文 baseline、合法 YAML
- WHEN 語言為英文或全在地化 THEN 明示無在地化必要、不吐誤導 scaffold
- WHEN 讀取輸出 baseline THEN 每筆逐字等於 `SKILL_DEFINITIONS.triggers`

#### REQ-AGNT-036: `prospec agent triggers` Emits Fill-Missing Trigger Scaffold
新 `agent triggers` 子指令（掛於既有 `agent` group）為非英文專案輸出可貼用的 `skill_triggers:` YAML scaffold：僅含缺非空條目的 skill、每筆帶 `SKILL_DEFINITIONS` 的英文 baseline，附 header 註解點名 `artifact_language`。英文/無缺口 → informational（stderr）、stdout 空。

**Scenarios:**
- WHEN 非英文 + partial, THEN 僅輸出缺口 skill，`skill-name → list<string>`，合法 YAML 可貼入 `.prospec.yaml`
- WHEN 每筆 baseline 檢視, THEN 逐字等於 `SKILL_DEFINITIONS.triggers`（不反推自已部署 SKILL.md）
- WHEN 英文或全在地化, THEN informational、無 scaffold；`README.md`/`README.zh-TW.md` 記載此指令

#### REQ-SERVICES-066: Single-Source Fill-Missing Computation
`computeUnlocalizedSkills(config)` 為「缺非空 `skill_triggers` 條目的 skill 集合」單一來源，由 agent-sync hint（REQ-AGNT-021）與 `agent triggers`（REQ-AGNT-036）共用，不 re-derive（PB-007）。

**Scenarios:**
- WHEN 讀取, THEN 單一 exported 函式為唯一來源；agent-sync hint 呼叫它（抽取前後 hint byte-identical）
- WHEN 空陣列條目, THEN 視同未設（cf. REQ-AGNT-019）；unknown skill key 略過

#### REQ-TESTS-052: agent-triggers Scaffold Contract
mutation-verified 契約：baseline 逐字 == `SKILL_DEFINITIONS`；fill-missing 語意（空陣列視未設）、英文無 scaffold；formatter 輸出 parse 為合法 YAML 且 round-trip 每筆 baseline。

**Scenarios:**
- WHEN baseline / fill-missing / 英文 noop 邏輯改壞, THEN 對應斷言轉紅
- WHEN 未來 baseline 含 YAML-special 字元破壞 scaffold, THEN round-trip 契約轉紅

---

## Edge Cases

- 未偵測到任何 AI CLI：列出支援清單並提示安裝
- 寫入失敗（磁碟已滿、權限不足）：原子寫入，失敗時保留原始檔案
- Planning Skill 觸發時無 Constitution：跳過 Constitution Check，不阻斷流程
- 新 Agent 平台尚未支援：gracefully skip 並提示即將支援
- Skill 模板語法錯誤：渲染失敗時保留上一次部署版本
- `skill_triggers` 指向不存在的 skill：warn 並略過（quiet 模式仍輸出至 stderr），不中斷 sync
- 自訂 trigger 詞或語言字串含引號/換行：escape 後 frontmatter 仍為合法 YAML
- 既有專案（無 `artifact_language`）重跑 sync：視同 English，向後相容

## Success Criteria

- **SC-1**: `prospec agent sync` 為所有偵測到的 Agent 生成正確配置
- **SC-2**: 部署的 Skills 與來源 .hbs 模板保持一致
- **SC-3**: AI Knowledge 節省 70%+ 的 token 消耗
- **SC-4**: 所有 13 個 Skill 通過語言中立性契約測試

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED 需求直接替換為最新狀態
2. **Functional Grouping**: 新需求插入對應的功能分組
3. **No Inline Provenance**: 歷史追溯只在 Change History 中
4. **Deprecation over Deletion**: 移除的需求搬到 Deprecated 區段

## Deprecated Requirements

#### ~~Gemini CLI Target~~
**Removed**: 2026-06-06 | **Change**: migrate-gemini-to-antigravity
**Reason**: Gemini CLI 於 2026-06-18 退役。其 target（id `gemini`、`.gemini/skills`、`GEMINI.md`、偵測 `~/.gemini`）完全移除，由 Antigravity CLI Target（REQ-AGNT-016）取代。

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-14 | add-metadata-format-reference | ADDED REQ-AGNT-037（`getSkillReferences` 為 new-story/ff 註冊 `metadata-format`、agent sync 自足部署、references 目錄計數由 map 衍生） | US-401; REQ-AGNT-037 (ADDED) |
| 2026-07-03 | migrate-skill-contract-to-vitest | verify-skills.sh 28 項生成契約搬入 vitest real-temp-dir;計數自 `getSkillReferences`/`SKILL_DEFINITIONS` derive、status-lifecycle 改 named-set 契約;移除 bash script + `verify:skills` + README 引用 | US-437; REQ-TESTS-038/039/040, REQ-AGNT-030 (ADDED) |
| 2026-07-01 | implement-hierarchical-index | ADDED REQ-AGNT-029 | US-436, REQ-AGNT-029 |
| 2026-02-04 | mvp-initial | 建立 agent sync，支援 4 種 Agent | US-400~402, REQ-AGNT-001~012 |
| 2026-02-04 | skill-autonomy | Skills 自主建立 scaffolding | REQ-AGNT-012 |
| 2026-02-09 | add-archive-system | 新增 archive skill 定義 | REQ-TYPES-011 |
| 2026-02-09 | add-knowledge-update | 新增 knowledge-update skill | REQ-TYPES-011 |
| 2026-02-16 | add-design-phase | 新增 prospec-design + 6 reference mappings | REQ-TYPES-011, REQ-AGNT-013 |
| 2026-03-01 | remove-skill-language-directives | Skill 語言中立化 | US-410, REQ-SKILL-009~010 |
| 2026-03-02 | v2-product-first migration | 遷移至 feature spec 格式 | All |
| 2026-06-04 | skill-alignment (PR #2) | Skill reference 路徑對齊各 agent skill dir + self-contained skills（移除 8 個 legacy ref templates） | REQ-AGNT-014~015 (ADDED) |
| 2026-06-06 | migrate-gemini-to-antigravity | Gemini→Antigravity；codex/copilot 收斂至 .agents/skills + AGENTS.md（單一 entry 模板、移除 instructions 格式）；共用輸出去重；動態 CLI 清單 | REQ-AGNT-016/017/018 (ADDED), REQ-AGNT-002/004 (MODIFIED), Gemini Target (REMOVED) |
| 2026-06-11 | reorder-stable-prefix-loading | Startup Loading 靜態優先重排（BL-020）：[STABLE]/[DYNAMIC] 標注、集合不變性、entry config 穩定性檢查 | US-430, REQ-TEMPLATES-080~082 (ADDED) |
| 2026-06-11 | add-init-language-policy | 產物英文 baseline；trigger words 合成 + skill_triggers 注入；entry 語言宣告；Language Policy partial | US-411~412; REQ-TEMPLATES-073, REQ-SKILL-011~012, REQ-AGNT-019~021 (ADDED), REQ-SKILL-009 (MODIFIED) |
| 2026-06-14 | fix-archive-sibling-reference | prospec-archive 自包含 promotion-format（移除唯一跨 skill sibling-dir 引用、補 contract guard）；single source 仍 promotion-format.hbs | REQ-AGNT-015 (MODIFIED) |
| 2026-06-14 | vendor-engineering-heuristics | verify/review 自包含 vendored MIT 工程啟發式 references（debug-recovery triage + 三 lens 判準），零 runtime 外部依賴、完整 MIT notice + SHA、README See Also 非依賴 | REQ-TEMPLATES-083/084/085, REQ-AGNT-022 (ADDED) |
| 2026-06-15 | add-quickstart-command | excludeFromEntryConfig onboarding skill（entry 排除、SKILL.md 仍部署）+ prospec-quickstart 模板（搭 project-setup US-010 的 CLI quickstart） | US-431; REQ-TYPES-030, REQ-AGNT-023, REQ-TEMPLATES-108, REQ-TESTS-029 (ADDED) |
| 2026-06-19 | backfill-promotion-path | prospec-promote-backfill skill 註冊（SKILL_DEFINITIONS 16）+ `scale: backfill` 登錄 CHANGE_SCALES enum + agent-sync 部署（proposal+delta-spec refs）+ README ×2/CLAUDE.md skill 清單同步 | US-432; REQ-TYPES-032/033, REQ-SERVICES-030, REQ-AGNT-024 (ADDED) |
| 2026-06-22 | fix-init-clobber-add-upgrade | prospec-upgrade skill registered/deployed + entry-excluded set {quickstart,upgrade} + agent-sync names missing-trigger skills + quickstart/upgrade fill-missing | US-433/434; REQ-TYPES-035, REQ-TEMPLATES-121, REQ-AGNT-026 (ADDED); REQ-TYPES-030, REQ-TESTS-029, REQ-AGNT-021, REQ-TEMPLATES-108 (MODIFIED) |
| 2026-06-22 | preserve-agent-config-edits | CLAUDE.md/AGENTS.md 採 `prospec:auto`/`prospec:user` 區塊合併，agent sync/init 不再覆蓋手寫內容；lib `mergeManagedDoc` + `hasAutoBlock`/`replaceAutoBlock` + `readFileIfExists`；entry/agents 模板加區塊標記 | US-435; REQ-LIB-021, REQ-AGNT-027, REQ-TEMPLATES-123 (ADDED); REQ-AGNT-008 (MODIFIED) |
| 2026-06-27 | upgrade-config-nudges | canonical agent 順序統一為 `claude, codex, copilot, antigravity`（VALID_AGENTS／AGENT_CONFIGS／AGENT_DIRS） | REQ-AGNT-028 (ADDED) |
| 2026-07-02 | fix-upgrade-doc-coverage | prospec-upgrade skill Step 2 改為 inventory-driven（消費 report docs inventory 為唯一掃描範圍、逐檔同意更新／補建、版本錯位 fallback；根治寫死清單漂移，issue #48） | REQ-TEMPLATES-121 (MODIFIED) |
| 2026-07-05 | agent-sync-hygiene | skill description 單一來源（skill.ts→frontmatter，registry 不漂移）+ agent-sync orphan sweep（prospec-* 保留字、removedSkills 回報）+ 觸發詞防碰撞（baseline + 中文 0 cross-skill substring/dup）（issue #59） | US-411; REQ-AGNT-031/032/033, REQ-TESTS-046 (ADDED) |
| 2026-07-05 | skill-template-partials | skill template boilerplate（Next-Step Handoff/Output-Contract-note）抽成 Handlebars partials 單一來源（PB-006）+ SKILL.md generated 標記；重新 render byte-identical（標記除外）；byte-sync 契約守衛（issue #60） | US-401; REQ-TEMPLATES-143/144, REQ-TESTS-047 (ADDED) |
| 2026-07-06 | slim-skill-trigger-context | L0 registry per-agent 精簡（claude slim / AGENTS.md 完整，`AgentConfig.surfacesSkillFrontmatter` 單一來源）+ ff/plan/archive format refs → per-phase on-demand + knowledge-generate 去 conventions 內嵌鏡像（issue #62） | US-438; REQ-TYPES-059, REQ-AGNT-034, REQ-TEMPLATES-146/147/148 (ADDED); REQ-AGNT-020 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | ADDED REQ-AGNT-035（agent-sync 注入 resolved token 預算、knowledge-loading 模板變數渲染、去 `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` 符號、指向 `.prospec.yaml` + `prospec check knowledge-size`）、REQ-TESTS-049（生成 skill 預算渲染契約，mutation-verified） | US-401; REQ-AGNT-035, REQ-TESTS-049 (ADDED) |
| 2026-07-12 | emit-trigger-scaffold | `prospec agent triggers` fill-missing scaffold（baseline 單一來源 `computeUnlocalizedSkills`）；agent-sync hint 與 quickstart/upgrade onboarding 指向該指令 | US-439 (ADDED); REQ-AGNT-036、REQ-SERVICES-066、REQ-TESTS-052 (ADDED); REQ-AGNT-021、REQ-TEMPLATES-108、REQ-TEMPLATES-121 (MODIFIED) |
| 2026-07-12 | converge-skill-triggers | 8 skill trigger baseline 收斂為 prospec-specific/collision-free/≥3（移除裸泛用詞、補 plan 第 3 詞）+ .prospec.yaml 中文鏡像；≥3 意圖機器化 | US-411; REQ-TESTS-053 (ADDED); REQ-AGNT-033 (MODIFIED) |
