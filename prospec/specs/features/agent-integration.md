---
feature: agent-integration
status: active
last_updated: 2026-06-19
story_count: 10
req_count: 42
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
- WHEN CLAUDE.md already exists, THEN update content, not create new file
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

#### REQ-TEMPLATES-083: Verify Failure-Recovery Reference
- WHEN agent sync runs, THEN `prospec-verify/references/debug-recovery-format.md` exists (verify's first `references/` dir)
- WHEN a test FAILs in Verification 5/5, THEN the skill loads it on demand for root-cause triage (reproduce-first, bisect, symptom-vs-cause) — it is NOT a Startup Loading item

#### REQ-TEMPLATES-084: Review Lens-Criteria Reference
- WHEN a review conditional lens (security / performance / maintainability) applies, THEN review loads `references/review-lenses-content.md` on demand for concrete, severity-pre-mapped criteria
- WHEN the lens content is read, THEN severity stays defined only in `review-format.md` (no second definition) and the spec-architecture lens remains prospec-owned and non-replaceable

#### REQ-TEMPLATES-085: Third-Party MIT Attribution
- WHEN a vendored reference renders, THEN it carries the FULL MIT permission+warranty text + upstream SHA `662910cd1a23` (each rendered copy is a redistributed copy)
- WHEN the repo root is checked, THEN `THIRD-PARTY-NOTICES` carries the full MIT text and the README links the source as optional further-reading / credit, NOT a dependency

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
- WHEN Skill triggered, THEN AI first reads `_index.md` index
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

---

### US-412: 使用者語言 Trigger Words 注入 [P1]

身為以母語描述需求的 prospec 使用者，
我想要 skill 的觸發詞可以包含我的主要語言，
以便用母語描述需求時 skill 仍能可靠觸發。

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` 設有 `skill_triggers` THEN SKILL.md frontmatter Triggers 為英文 baseline + 自訂詞
- WHEN 主要語言非英文且無自訂詞 THEN Triggers 行尾追加 `or equivalent terms in {語言}` 提示
- WHEN agent sync 產生 entry config THEN 含主要語言宣告（L0）與每個 skill 的 Triggers 行

#### REQ-AGNT-019: Trigger Words Synthesis
agent sync 合成 frontmatter Triggers：英文 baseline + `skill_triggers` 自訂詞（經 YAML escape）；非英文（大小寫不敏感判定）且無自訂詞時追加語意 fallback 提示。
- WHEN custom triggers exist, THEN frontmatter = baseline + custom words (quotes/newlines escaped, frontmatter stays valid YAML)
- WHEN non-English language with no custom triggers, THEN append `— or equivalent terms in {language}`
- WHEN English (case-insensitive) with no custom triggers, THEN baseline only
- WHEN `skill_triggers` has an unknown skill key, THEN warn (stderr, even in quiet mode) and ignore it; empty arrays count as unset

#### REQ-AGNT-020: Entry Config Language Declaration
entry config（CLAUDE.md / AGENTS.md）含主要語言宣告（L0 常駐）與每個 skill 的 Triggers 行；`artifact_language` 缺席或空白視同 English。
- WHEN syncing a project with language X, THEN the entry config declares X and lists per-skill trigger words
- WHEN the field is absent or blank, THEN the declaration renders English

#### REQ-AGNT-021: Skill Triggers Population Hint
非英文且 `skill_triggers` 未設定時，agent sync 輸出 hint：請 AI agent 將英文 baseline 翻譯為主要語言寫入 `skill_triggers` 後重跑 sync（CLI 不內建翻譯）。
- WHEN non-English language and no `skill_triggers`, THEN result hints name the language and the `skill_triggers` field
- WHEN `skill_triggers` is set or the language is English, THEN no hint

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
`SkillConfig` 新增 optional `excludeFromEntryConfig`（absent=false）；`SKILL_DEFINITIONS` 新增 `prospec-quickstart`（type Lifecycle、`hasReferences` false、`excludeFromEntryConfig` true）。
- WHEN reading `SKILL_DEFINITIONS`, THEN it contains prospec-quickstart with `excludeFromEntryConfig: true`
- WHEN the field is absent on a skill, THEN it defaults to false (backward-compatible; existing skills unaffected)
- WHEN auditing definitions, THEN prospec-quickstart is the only entry-excluded skill (contract-asserted)

#### REQ-AGNT-023: Entry Config Excludes excludeFromEntryConfig Skills
agent-sync 渲染 entry config（CLAUDE.md/AGENTS.md，always-loaded Layer 0）的 skill 清單時排除 `excludeFromEntryConfig` skills；`syncSkillsDirSkills` 維持 iterate 完整 `SKILL_DEFINITIONS`，故其 SKILL.md 仍部署。維持 L0 穩定（REQ-AGNT-020 / REQ-TEMPLATES-082）與 entry config <100 行（REQ-AGNT-003），且不抵觸 REQ-TYPES-011（所有 skill 仍產生檔案）。
- WHEN agent sync runs, THEN an `excludeFromEntryConfig` skill is absent from the entry config Available Skills list
- WHEN agent sync runs, THEN that skill's SKILL.md (and references, if any) is still written to each agent skill dir
- WHEN the exclusion filter is removed, THEN the contract test goes red (mutation-verified)

#### REQ-TEMPLATES-108: prospec-quickstart Onboarding Skill Template
`skills/prospec-quickstart.hbs`：探測 `prospec --version`；非英文且 `skill_triggers` 空時翻譯 trigger baseline、snapshot → show-and-confirm → minimal in-place edit → 讀回驗證 YAML；Bash `agent sync`；Bash `knowledge init`；chain（不 inline）至 `/prospec-knowledge-generate`；CLI 不可用時 graceful fallback。含 Output Contract + NEVER、English-only。
- WHEN rendered, THEN it carries an Output Contract (objectively-checkable Success Criteria) and a NEVER section
- WHEN non-English and `skill_triggers` empty, THEN translate baselines, confirm with the user, write via a minimal in-place edit, and read back to validate YAML
- WHEN the prospec CLI is unavailable, THEN state it and fall back to manual steps, never proceed silently
- WHEN finishing, THEN chain into `/prospec-knowledge-generate` rather than inlining its workflow

#### REQ-TESTS-029: Entry-Config Exclusion Contract Test (mutation-verified)
section-scoped、結構感知、mutation-verified 契約測試：斷言 `excludeFromEntryConfig` skill 缺席於 entry-config skills context、其 SKILL.md 仍產出；移除排除 filter 須轉紅。
- WHEN the test runs, THEN it asserts the skill is absent from the entry-config context yet its SKILL.md is still generated
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
