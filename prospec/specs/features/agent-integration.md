---
feature: agent-integration
status: active
last_updated: 2026-06-11
story_count: 7
req_count: 27
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

#### REQ-TYPES-011: Skill Definition Constants
- WHEN new Skill added, THEN SKILL_DEFINITIONS updated
- WHEN agent sync executes, THEN generates files for all defined Skills

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
| 2026-06-11 | add-init-language-policy | 產物英文 baseline；trigger words 合成 + skill_triggers 注入；entry 語言宣告；Language Policy partial | US-411~412; REQ-TEMPLATES-073, REQ-SKILL-011~012, REQ-AGNT-019~021 (ADDED), REQ-SKILL-009 (MODIFIED) |
