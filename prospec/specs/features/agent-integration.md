---
feature: agent-integration
status: active
last_updated: 2026-07-14
story_count: 17
req_count: 73
---

# Agent Integration

## Who & Why

Serves developers who use Prospec together with a variety of AI Agents (Claude Code, Antigravity CLI, Copilot, etc.). Agent Integration detects installed AI CLI tools and generates the corresponding configuration and SDD Skill files, so that AI Agents operate within Prospec's structured development workflow. Through three-layer Progressive Disclosure and a language-neutralization mechanism, it ensures Skills work correctly across different Agents and language environments.

## User Stories & Behavior Specifications

### US-400: AI CLI Detection & Configuration Generation [P0]

As a developer,
I want Prospec to automatically detect installed AI CLI tools and generate the corresponding configuration,
so that AI Agents can immediately work within the SDD framework.

**Acceptance Scenarios:**
- WHEN executing `prospec agent sync` THEN detect all installed AI CLIs
- WHEN Claude Code is detected THEN generate CLAUDE.md
- WHEN no AI CLI is detected THEN display the supported list and prompt for installation

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
The canonical order of supported agents is defined as `claude, codex, copilot, antigravity`, unified across `VALID_AGENTS` (types; drives the zod enum error and the `supported:` message), `AGENT_CONFIGS` (types; lookup table), and `AGENT_DIRS` (lib; init detection/prompting). Output files depend on the set of agents rather than their order, so an order change does not alter the content of any generated file.
- WHEN an invalid agent triggers the zod enum error, THEN it is listed as `"claude"|"codex"|"copilot"|"antigravity"`
- WHEN `detectAgents()` returns, THEN the id order is `claude, codex, copilot, antigravity`
- WHEN `agent sync` is re-run after an order change, THEN generated files have zero diff

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
The entry config (CLAUDE.md/AGENTS.md) uses `prospec:auto`/`prospec:user` block merging rather than whole-file overwrite.
- WHEN the entry config already exists and contains block markers, THEN only regenerate the auto block; the user block is preserved byte-for-byte
- WHEN the entry config already exists but has no block markers (hand-written), THEN migrate the existing content into the user block before writing auto (nothing is lost)
- WHEN Skill directory already exists, THEN update SKILL.md, not rebuild

---

### US-401: SDD Skill Generation & Management [P0]

As a developer,
I want Prospec to automatically generate SDD Skill files from .hbs templates,
so that AI Agents can trigger the structured SDD workflow via slash commands.

**Acceptance Scenarios:**
- WHEN agent sync runs THEN generate all Skill files from .hbs templates
- WHEN deploying to Claude THEN produce SKILL.md + references/
- WHEN re-syncing after a template update THEN the deployment reflects the latest template

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
verbatim-identical skill-template boilerplate is single-sourced as Handlebars partials (PB-006): `_next-step-handoff.hbs` (6 md5-identical skills) and `_output-summary-note.hbs` (15 skills), referenced by 17 templates via `{{> ...}}`; `template.ts` `ensureBuiltinPartials` registers them. Per-skill variant sections (Entry Gate, Quality Gate, promote-backfill handoff, learn/promote output note) remain inline.
- WHEN a shared boilerplate block is verbatim-identical across skills, THEN it lives in one partial and users reference it (no inline copy)
- WHEN templates are re-rendered + deployed, THEN SKILL.md is byte-identical to before (generated marker excepted)

#### REQ-TEMPLATES-144: SKILL.md Generated Marker
Every deployed SKILL.md carries a `_generated-notice.hbs` marker after the frontmatter, noting that it is generated by `prospec agent sync`, will be overwritten on the next sync, and must not be edited by hand. The marker is **consumer-agnostic** — it does not reference the prospec-internal `src/templates/skills/` path (downstream projects that install prospec do not have this path, so pointing at it would mislead); it only warns that the file is generated. It is placed outside the YAML frontmatter (so it does not break frontmatter parsing), and is the only output difference relative to the current state.
- WHEN a SKILL.md is deployed, THEN it carries a generated marker warning it is generated + overwritten on the next sync, with no consumer-invalid internal template path
- WHEN the marker is added, THEN it is the only output difference vs before and the frontmatter YAML stays valid

#### REQ-TESTS-047: Partial Single-Source + Marker + Byte-Sync Contract
Contract tests pin down: boilerplate is partial-ized (references contain `{{> ...}}`, no inline copies), the generated marker is present per skill, partial renders expand, and **the deployed `.claude`/`.agents` SKILL.md contains the fully expanded partial blocks** (editing a partial without re-syncing → turns red). mutation-verified.
- WHEN a partial include is reverted to an inline copy or the marker is removed, THEN the assertion turns red
- WHEN a partial's content/whitespace is edited without `agent sync`, THEN the byte-sync guard turns red

#### REQ-AGNT-035: Generated Skill Token Budget Rendered Per-Project (No Internal Symbols)
`agent-sync` injects `resolveKnowledgeTokenBudget(config)`'s `l1_per_file`/`l2_per_module`/`readme_max_lines` into the shared `templateContext`; the knowledge-loading skill templates (`_knowledge-loading-rules` partial, `prospec-knowledge-generate`, `prospec-knowledge-update`) render the budget via `{{...}}` variables, and mark the source as `.prospec.yaml` `knowledge.token_budget` (editable) and `prospec check knowledge-size` (runnable), no longer naming the internal constant `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` (which downstream cannot resolve).
- WHEN any SKILL.md is generated, THEN the content does not contain `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`
- WHEN `.prospec.yaml` does not override, THEN render the default values (L1 1800 / L2 1000 tokens, README 100 lines); after setting `l2_per_module: 1200` and re-syncing, L2 shows 1200

#### REQ-TESTS-049: Generated Skill Budget Rendering Contract
The skill-format contract asserts that the rendered skill output does not contain `DEFAULT_KNOWLEDGE_TOKEN_BUDGET`, and uses a sentinel budget to prove the numbers come from the injected context (not hardcoded); the agent-sync unit test asserts the injected value == `resolveKnowledgeTokenBudget` (override hits, unset fields fall back to DEFAULT). mutation-verified.
- WHEN the template re-hardcodes the budget or names the internal symbol, THEN the assertion turns red

---

### US-402: Three-Layer Progressive Disclosure [P0]

As a developer,
I want Skills to use a three-layer progressive disclosure design to control token consumption,
so that AI Agents only load deep context when needed.

**Acceptance Scenarios:**
- WHEN Layer 1 (name + description) THEN about 100 tokens
- WHEN Layer 2 (SKILL.md body) THEN at most 500 lines
- WHEN Layer 3 (references/) THEN loaded only when needed

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

### US-410: Skill Language Neutralization [P1]

As a Prospec user who has set Traditional Chinese in the Constitution,
I want Skills to contain no hardcoded language directives,
so that the Constitution's language setting is not overridden by Skill-level English output directives.

**Acceptance Scenarios:**
- WHEN agent sync generates SKILL.md THEN it does not contain `All generated files must be written in English`
- WHEN the user specifies Traditional Chinese in the Constitution THEN the Skill output language follows the Constitution

#### REQ-SKILL-009: Skill Output Language Neutrality
- WHEN agent sync generates SKILL.md, THEN contains no hardcoded language directives
- WHEN user specifies language in Constitution, THEN Skill output follows Constitution
- WHEN config has no `artifact_language`, THEN treated as English — init always seeds a Language Policy rule, and skill output language is governed by it

#### REQ-SKILL-010: Activation Language Neutrality
- WHEN Skill triggered, THEN Activation uses `When triggered, briefly describe:` (no language spec)
- WHEN AI executes Activation, THEN response language determined by external mechanism

#### REQ-SKILL-012: Artifact Skills Follow Constitution Language Policy
Artifact-producing skills (new-story/plan/tasks/ff/design/archive/learn/knowledge-generate/knowledge-update) load an explicit compliance directive via a shared partial (`{{> language-policy}}`) that only points at the Constitution and does not hardcode a language name.
- WHEN rendering an artifact-producing skill, THEN it contains a Language Policy section pointing at the Constitution rule
- WHEN grepping skill templates, THEN `written in English` count is 0 (neutrality preserved)

---

### US-411: Prospec Artifact English Baseline [P1]

As a prospec user on an English-speaking or international team,
I want all files and Skills produced by init and agent sync to be in English,
so that the artifacts are language-consistent and shareable across teams.

**Acceptance Scenarios:**
- WHEN init + agent sync THEN the produced entry configs, SKILL.md, references, and scaffolds contain no Chinese (except the rendered value of the user's chosen language)
- WHEN checking `src/templates/` THEN there is no Chinese content

#### REQ-TEMPLATES-073: Templates English Baseline
All `.hbs` content under `src/templates/` is uniformly English; document language is always determined by the Constitution Language Policy, and templates do not hardcode it.
- WHEN scanning `src/templates/`, THEN zero files contain CJK characters
- WHEN init/agent sync render outputs, THEN no Chinese except the user-chosen language value itself

#### REQ-SKILL-011: Skill Definitions English with Trigger Baseline
`SKILL_DEFINITIONS` descriptions are in English; each skill carries a non-empty English `triggers` baseline.
- WHEN rendering entry configs, THEN the skills list descriptions are English
- WHEN any skill definition is added, THEN it carries a non-empty `triggers` array (contract-tested)

#### REQ-AGNT-031: Skill Description Single Source
`skill.ts` SKILL_DEFINITIONS `description` is the single source for each skill's description. The agent-sync per-skill render context passes in `skill_description` (`escapeYamlScalar`), and the skill `.hbs` frontmatter renders `"{{skill_description}} Triggers: {{trigger_words}}"` (not hardcoded); the CLAUDE.md/AGENTS.md registry and the SKILL.md frontmatter share the same source and do not drift.
- WHEN generating SKILL.md, THEN the frontmatter description equals skill.ts `description` verbatim (round-trip after escaped-scalar parsing; equivalence contract test, mutation-verified)
- WHEN inspecting the verify description, THEN it reflects the current 5+1 dimensions

#### REQ-AGNT-032: Agent-Sync Orphan Sweep
After `agent-sync` generation, `sweepOrphanSkillDirs` scans the `prospec-*` directories under each agent's skillPath and removes those not in `SKILL_DEFINITIONS` (top-level; skips non-directories/symlinks/non-`prospec-` names); removed items are collected into `AgentSyncResult.removedSkills` and reported by the formatter.
- WHEN `prospec-<gone>` is not in the current list, THEN it is removed and reported (the `prospec-` prefix is reserved)
- WHEN a directory does not have the `prospec-` prefix (a user skill), THEN it is preserved

#### REQ-AGNT-033: Collision-Free, Prospec-Specific Trigger Baselines
Baseline trigger words (skill.ts) have no cross-skill substring or exact-dup collisions and are **prospec-specific** — bare generic terms that collide with CLI command names or are common in general development conversation (check/change/upgrade/setup/done/critical/feedback/clean up/I want to/migrate version/version bump) are removed in favor of prospec-qualified phrases (e.g. `upgrade prospec`/`user story`/`quality check`/`finalize change`/`technical plan`); this project's `.prospec.yaml` Chinese trigger words are likewise collision-free and equally converged. Each skill has ≥3 words (machine-enforced by REQ-TESTS-053).
- WHEN the anti-collision contract test runs against the baseline, THEN 0 violations (cross-skill substring + exact-dup)
- WHEN the same detector runs against `.prospec.yaml` skill_triggers, THEN 0 violations
- WHEN inspecting any skill, THEN its triggers are prospec-specific phrases and ≥3 words (no bare generic terms)

#### REQ-TESTS-046: Agent-Sync Hygiene Contract
Contract/unit tests pin down: description equivalence (per skill registry↔frontmatter, escaped round-trip), orphan sweep (remove orphans + preserve user skills + report), trigger anti-collision (baseline + `.prospec.yaml`, 0 violations). All mutation-verified.
- WHEN any is broken (description drift / sweep wrongly deletes or misses / a new collision is introduced), THEN the corresponding assertion turns red

#### REQ-TESTS-053: Minimum Trigger Count Contract (≥3 per skill)
The skill-format contract asserts `triggers.length >= 3` for every `SKILL_DEFINITIONS` skill, upgrading REQ-AGNT-033's "≥3 words" intent from spec text to machine enforcement (the only prior machine constraint was `> 0`, so prospec-plan's 2-word gap had no gate). The real assertion and the mutation guard share the `skillsBelowMinTriggers` predicate, so loosening the lower bound turns both red.
- WHEN any skill has fewer than 3 trigger words, THEN the assertion turns red
- WHEN all 17 skills have ≥3, THEN the assertion is green; the mutation guard uses the real `SKILL_DEFINITIONS` + a synthetic 2-trigger skill to prove the predicate is not vacuous

---

### US-412: User-Language Trigger Words Injection [P1]

As a prospec user who describes requirements in my native language,
I want a skill's trigger words to be able to include my primary language,
so that skills still trigger reliably when I describe requirements in my native language.

**Acceptance Scenarios:**
- WHEN `.prospec.yaml` has `skill_triggers` set THEN the SKILL.md frontmatter Triggers are the English baseline + custom words
- WHEN the primary language is non-English and there are no custom words THEN append an `or equivalent terms in {language}` hint to the end of the Triggers line
- WHEN agent sync produces the entry config for a non-frontmatter-surfacing agent THEN it contains the primary-language declaration (L0) and a Triggers line for each skill (a frontmatter-surfacing agent such as claude gets a slim registry, and its triggers are surfaced by the SKILL.md frontmatter)

#### REQ-AGNT-019: Trigger Words Synthesis
agent sync synthesizes the frontmatter Triggers: English baseline + `skill_triggers` custom words (YAML-escaped); when the language is non-English (case-insensitive determination) and there are no custom words, append a semantic fallback hint.
- WHEN custom triggers exist, THEN frontmatter = baseline + custom words (quotes/newlines escaped, frontmatter stays valid YAML)
- WHEN non-English language with no custom triggers, THEN append `— or equivalent terms in {language}`
- WHEN English (case-insensitive) with no custom triggers, THEN baseline only
- WHEN `skill_triggers` has an unknown skill key, THEN warn (stderr, even in quiet mode) and ignore it; empty arrays count as unset

#### REQ-AGNT-020: Entry Config Language Declaration
The entry config contains the primary-language declaration (L0-resident; an absent or blank `artifact_language` is treated as English). The skill registry is routed by agent: an agent whose runtime does not automatically surface SKILL.md frontmatter (the AGENTS.md group) keeps the full per-skill table (including each skill's Triggers line), and so does the default when the flag is unset; an agent that does auto-surface (claude → CLAUDE.md) instead renders a slim `/prospec-*` guidance section, whose trigger words are surfaced by the SKILL.md frontmatter (not re-listed in the entry config).
- WHEN syncing a non-frontmatter agent with language X, THEN the entry config declares X and lists per-skill trigger words
- WHEN syncing a frontmatter-surfacing agent (claude), THEN the entry config declares the language but renders a slim registry pointer (no per-skill Triggers)
- WHEN the field is absent or blank, THEN the declaration renders English

#### REQ-AGNT-021: Skill Triggers Population Hint
agent sync computes the missing set (`computeUnlocalizedSkills` single source, see REQ-SERVICES-066). When the language is non-English and the set is non-empty, the hint directs running `prospec agent triggers` to obtain a translatable scaffold: all missing → generic guidance; partially missing (existing ones already translated, new skills not yet) → name the skills lacking trigger words and fill only the missing ones. English or all present → no hint.
- WHEN non-English language and some skills lack a `skill_triggers` entry (partial), THEN the hint names those skills and directs running `prospec agent triggers` to fill only the missing ones
- WHEN non-English language and no `skill_triggers` at all, THEN the hint names the language and directs running `prospec agent triggers` (generic guidance)
- WHEN every skill has a `skill_triggers` entry or the language is English, THEN no hint

---

### US-420: Multi-Agent Platform Support [P1]

As a developer who uses multiple AI Agents at the same time,
I want Prospec to generate the corresponding configuration and Skills for different Agent platforms,
so that I can switch seamlessly between Claude Code, Antigravity CLI, Copilot, Codex, and others.

**Acceptance Scenarios:**
- WHEN multiple AI CLIs are detected THEN generate the corresponding configuration for each platform
- WHEN antigravity/codex/copilot coexist THEN converge on `.agents/skills` + `AGENTS.md` (the shared agents.md open standard)
- WHEN a specific platform is specified with `--cli` THEN generate only that platform's configuration

#### REQ-AGNT-017: Shared-Standard Output Dedup
- WHEN multiple configured agents resolve to the same `(skillPath, configPath)` — antigravity / codex / copilot all use `.agents/skills` + `AGENTS.md` — THEN agent-sync writes each physical file once
- WHEN sync completes, THEN `totalFiles` equals the actual files on disk (no double counting)
- WHEN a single agent or no shared signature, THEN behavior is unchanged

_(Cross-references: REQ-AGNT-001 Detection, REQ-AGNT-004 Skills Generation — see US-400/US-401 for the full Scenarios)_

---

### US-430: Startup Loading Static-First Ordering (cache-stable prefix) [P1]

As a prospec user on any supported agent,
I want each skill's Startup Loading to load in the order of static content first, dynamic content last, with each item annotated `[STABLE]` or `[DYNAMIC]`,
so that each time a skill is triggered the provider's prompt cache prefix is maximized, lowering API cost and speeding responses.

**Acceptance Scenarios:**
- WHEN rendering any skill template THEN all `[STABLE]` items are ordered before all `[DYNAMIC]` items, and every load item carries one of the two annotations
- WHEN comparing before and after the ordering change THEN the set of load items is unchanged (only order and annotations change)
- WHEN running `prospec agent sync` THEN the deployed SKILL.md is in sync with the template

#### REQ-TEMPLATES-080: Startup Loading Static-First Ordering and Annotation
Criteria: `[STABLE]` = changes only on sync/governance changes (reference format specs, Constitution, _conventions); `[DYNAMIC]` = changes with knowledge updates, a change, or on every trigger.
- WHEN inspecting any template's Startup Loading, THEN every numbered item carries an annotation and all STABLE items come before DYNAMIC items
- WHEN the contract assertion runs, THEN annotation completeness and ordering are guarded by section-scoped, mutation-verified tests

#### REQ-TEMPLATES-081: Load-Item Set Invariance
- WHEN the ordering changes, THEN the set of load-item links/paths matches the version-controlled baseline (startup-loading-baseline.json) and the MANDATORY count is unchanged
- WHEN the load list is interrupted by prose (CommonMark list break), THEN the contiguity assertion turns red

#### REQ-TEMPLATES-082: entry config Layer 0 Stability
- WHEN rendering the entry config (CLAUDE.md / AGENTS.md), THEN all variables are resolved at sync time with no per-trigger varying values; the Available Skills list is fixed per project and judged [STABLE]
- WHEN the template ordering changes, THEN `prospec agent sync` brings the deployed file into agreement with the template

---

### US-431: Entry-Config-Excluded Onboarding Skill [P1]

As a prospec maintainer and downstream user,
I want a one-time onboarding skill to be deployed as a triggerable SKILL.md but not listed in the always-resident entry config,
so that a one-time flow does not impose a token cost on every subsequent session (G4).

**Acceptance Scenarios:**
- WHEN agent sync runs THEN an `excludeFromEntryConfig` skill's SKILL.md is written to disk but does not appear in CLAUDE.md/AGENTS.md
- WHEN comparing the entry config skill list THEN that skill is not in it, yet can still be triggered by a slash command
- WHEN triggering `/prospec-quickstart` THEN localize triggers, re-sync, and generate AI Knowledge (paired with the CLI quickstart in project-setup US-010)

#### REQ-TYPES-030: excludeFromEntryConfig Skill Field
`SkillConfig` adds an optional `excludeFromEntryConfig` (absent=false); the entry-excluded set in `SKILL_DEFINITIONS` is exactly `{prospec-quickstart, prospec-upgrade}` — both are self-terminating one-shots explicitly authorized by `_conventions.md` (onboarding / migration·repair).
- WHEN reading `SKILL_DEFINITIONS`, THEN it contains prospec-quickstart and prospec-upgrade with `excludeFromEntryConfig: true`
- WHEN the field is absent on a skill, THEN it defaults to false (backward-compatible; existing skills unaffected)
- WHEN auditing definitions, THEN the entry-excluded set is exactly `{prospec-quickstart, prospec-upgrade}` (contract-asserted)

#### REQ-AGNT-023: Entry Config Excludes excludeFromEntryConfig Skills
When agent-sync renders the skill list of the entry config (CLAUDE.md/AGENTS.md, always-loaded Layer 0) it excludes `excludeFromEntryConfig` skills; `syncSkillsDirSkills` still iterates the full `SKILL_DEFINITIONS`, so their SKILL.md is still deployed. This keeps L0 stable (REQ-AGNT-020 / REQ-TEMPLATES-082) and the entry config <100 lines (REQ-AGNT-003), and does not conflict with REQ-TYPES-011 (all skills still generate files).
- WHEN agent sync runs, THEN an `excludeFromEntryConfig` skill is absent from the entry config Available Skills list
- WHEN agent sync runs, THEN that skill's SKILL.md (and references, if any) is still written to each agent skill dir
- WHEN the exclusion filter is removed, THEN the contract test goes red (mutation-verified)

#### REQ-TEMPLATES-108: prospec-quickstart Onboarding Skill Template
`skills/prospec-quickstart.hbs`: probes `prospec --version`; Step 1 "fill only the missing" — first run `prospec agent triggers` to obtain the fill-missing scaffold (baseline from `SKILL_DEFINITIONS`, not by grepping the deployed SKILL.md), translate the scaffold values and add them, without overwriting existing entries (snapshot → show-and-confirm → minimal in-place edit → read back to validate YAML); Bash `agent sync`; Bash `knowledge init`; chain (not inline) into `/prospec-knowledge-generate`; graceful fallback when the CLI is unavailable. Includes an Output Contract + NEVER, English-only.
- WHEN rendered, THEN it carries an Output Contract (objectively-checkable Success Criteria) and a NEVER section
- WHEN non-English and some skills lack a `skill_triggers` entry, THEN run `prospec agent triggers` for the scaffold, translate only the missing ones (existing entries untouched), confirm with the user, write via a minimal in-place edit, and read back to validate YAML
- WHEN the prospec CLI is unavailable, THEN state it and fall back to manual steps, never proceed silently
- WHEN finishing, THEN chain into `/prospec-knowledge-generate` rather than inlining its workflow

#### REQ-TESTS-029: Entry-Config Exclusion Contract Test (mutation-verified)
A section-scoped, structure-aware, mutation-verified contract test: asserts the entry-excluded set is `{prospec-quickstart, prospec-upgrade}` (order-independent), both are absent from the entry-config skills context but their SKILL.md is still produced; asserts `SKILL_DEFINITIONS.length` is 17; removing/inverting the exclusion filter must turn it red.
- WHEN the test runs, THEN it asserts both quickstart and upgrade are absent from the entry-config context yet each SKILL.md is still generated, and `SKILL_DEFINITIONS.length` is 17
- WHEN the exclusion filter is deleted or inverted, THEN the test fails (mutation-verified)

---

### US-432: prospec-promote-backfill Skill Registration, Deployment, and Scale Enrollment [P2]

As a developer maintaining the prospec skill set,
I want the new `prospec-promote-backfill` skill to be formally registered (`SKILL_DEFINITIONS`), its references deployed by `agent sync`, `scale: backfill` enrolled in the `CHANGE_SCALES` enum, and the user-facing docs to reflect it,
so that this backfill promotion skill is deployed consistently across agent dirs, the scale value has a type contract, and user docs do not omit it.

**Acceptance Scenarios:**
- WHEN `agent sync` runs THEN both `.claude/skills/` and `.agents/skills/` deploy `prospec-promote-backfill/SKILL.md` + its references (proposal + delta-spec-format)
- WHEN reading `CHANGE_SCALES` THEN it contains `backfill` (the 4th value), and `ChangeMetadataSchema.safeParse({scale:'backfill'})` succeeds
- WHEN reading the user-facing docs THEN `README.md`/`README.zh-TW.md` (skill catalog + brownfield workflow) and `CLAUDE.md` all contain the skill, with a skill count of 16

### Behavior Specifications

#### REQ-TYPES-032: SKILL_DEFINITIONS Registers the promote skill
`src/types/skill.ts` `SKILL_DEFINITIONS` adds `prospec-promote-backfill` (Lifecycle, `hasReferences: true`), bringing the total from 15→16, with the description synced to the `.hbs` frontmatter (dual-write: the frontmatter renders into SKILL.md, and SKILL_DEFINITIONS feeds CLAUDE.md/entry config).
- WHEN reading `SKILL_DEFINITIONS`, THEN it contains `prospec-promote-backfill`, `hasReferences:true`, count 16
- WHEN comparing triggers, THEN there is no collision with existing skills

#### REQ-TYPES-033: CHANGE_SCALES enum Includes backfill
`src/types/change.ts` `CHANGE_SCALES` is expanded from `['quick','standard','full']` to include `'backfill'`, so the `ChangeMetadata.scale` type and Zod enum can represent backfill; `change.test.ts` is updated to assert the four values accordingly.
- WHEN `safeParse({scale:'backfill'})`, THEN success
- WHEN asserting enum membership, THEN it is four values and the enum-reject test still holds

#### REQ-SERVICES-030: agent-sync Deploys the promote skill references
`agent-sync.service.ts` `getReferenceMap()` adds a `prospec-promote-backfill` entry (proposal-format + delta-spec-format — a lightweight scaffold needs only these two), and `agent sync` deploys the skill and its references.
- WHEN `getReferenceMap('prospec-promote-backfill')`, THEN it returns the proposal + delta-spec references
- WHEN after `agent sync`, THEN each agent skill dir contains SKILL.md + 2 references

#### REQ-AGNT-024: User-Facing Docs Reflect the New Skill
The skill catalog table + brownfield workflow subsection in `README.md`/`README.zh-TW.md` are synced bilingually with the new skill, and the header skill count is 16/15; `CLAUDE.md` Available Prospec Skills is synced (regenerated by `agent sync` from `SKILL_DEFINITIONS`).
- WHEN reading both READMEs, THEN the skill catalog table + workflow both contain `prospec-promote-backfill`, count 16
- WHEN reading `CLAUDE.md`, THEN Available Prospec Skills contains the skill

---

### US-433: /prospec-upgrade Judgment-Based Finishing Upgrade Skill [P1]

As a prospec user on a non-English project (or who just added a skill),
I want a skill that reads the upgrade report, translates trigger words for new skills, and migrates outdated curated formats as needed, with confirmation and diff previews throughout,
so that the parts of the upgrade requiring judgment are AI-assisted but human-gated, and the command never rewrites my trust-zone without permission.

**Acceptance Scenarios:**
- WHEN triggering `/prospec-upgrade` and the report lists new skills lacking trigger words, THEN translate trigger words only for the missing skills, and after show-and-confirm write `skill_triggers` via a minimal in-place edit and read back to validate YAML
- WHEN the report flags a curated doc format as out of date, THEN propose a migration with a git diff preview, and write only after user confirmation
- WHEN the user does not confirm a given migration, THEN the 3 files of that zone stay untouched and the skill does not rewrite them without permission
- WHEN the skill finishes, THEN re-run `prospec agent sync` so the deployment reflects the latest trigger words

#### REQ-TYPES-035: SKILL_DEFINITIONS Registers prospec-upgrade
`SKILL_DEFINITIONS` adds `prospec-upgrade` (type `Lifecycle`, `hasReferences:false`, `cliDependency:'prospec upgrade'`, `excludeFromEntryConfig:true`), bringing the total from 16→17, with the description synced to the `.hbs` frontmatter (dual-write). Its trigger words do not collide with existing skills.
- WHEN reading `SKILL_DEFINITIONS`, THEN it contains `prospec-upgrade`, `excludeFromEntryConfig:true`, count 17
- WHEN comparing triggers, THEN `prospec-upgrade` does not collide with existing skills' trigger words
- WHEN agent sync runs, THEN each agent skill dir deploys `prospec-upgrade/SKILL.md`

#### REQ-TEMPLATES-121: prospec-upgrade Skill Template
`templates/skills/prospec-upgrade.hbs` (judgment skill, English-only baseline): (1) run `prospec upgrade --no-interactive` and read the report (version already bumped, agents already synced, list of skills lacking trigger words, docs inventory); (2) use the report's `Docs inventory:` as the **sole scan scope** (the list shares its source with init via `INIT_DOC_REGISTRY` — the skill maintains no hardcoded doc list): for present files, detect format drift against the latest templates of the installed prospec package, show a per-file diff, and update only after asking the user's consent; for MISSING files, show the content to be written and create them from the latest template after asking consent (gracefully skip and report when the package template is unavailable; no docs section in the report = CLI/skill version mismatch → skip this step and prompt to re-run `prospec upgrade`); if a legacy `ai-knowledge/_index.md` is detected, propose migrating it to the root-level `{base_dir}/index.md` (preserving the `prospec:user` block and the curated Modules table, and deleting the old file after a successful migration); (3) per `artifact_language`, first run `prospec agent triggers` to get the fill-missing scaffold, translate `skill_triggers` for the skills lacking trigger words (fill only the missing ones, snapshot/confirm/minimal in-place/read back to validate YAML) → then run `prospec agent sync` again. Includes an Output Contract + NEVER; Startup Loading static-first `[STABLE]/[DYNAMIC]`.
- WHEN rendered, THEN it carries an Output Contract and a NEVER section, has no hardcoded language directives (English baseline), and Step 2 has no hardcoded convention-doc list (pinned by a negative contract assertion)
- WHEN the report marks a file MISSING and the user consents to create it, THEN create it from the latest template; if not consented, leave it untouched
- WHEN a present file's format does not match the latest template, THEN show a per-file diff and change it only after asking consent; if not consented, leave the file untouched
- WHEN `artifact_language` is non-English and there are skills lacking trigger words, THEN first run `prospec agent triggers` to get the scaffold, translate only the missing ones, and after confirmation write `skill_triggers` via a minimal in-place edit and read back to validate YAML
- WHEN finishing (if there were any changes), THEN run `prospec agent sync` again so the deployment reflects the latest trigger words

#### REQ-AGNT-026: User-Facing Docs Reflect prospec-upgrade
The skill catalog table + lifecycle workflow subsection in `README.md`/`README.zh-TW.md` are synced bilingually to add `prospec-upgrade` and the `prospec upgrade` CLI command, with the header skill count going 16→17; `CLAUDE.md` Available Prospec Skills (regenerated by agent sync from `SKILL_DEFINITIONS`) is synced; the root-level `index.md` templates module description goes from "16 skills" → "17 skills".
- WHEN reading both READMEs, THEN the skill catalog + workflow both contain `prospec-upgrade`, count 17, and include the `prospec upgrade` command
- WHEN reading `CLAUDE.md`, THEN Available Prospec Skills contains `prospec-upgrade`
- WHEN reading the root-level `index.md`, THEN the templates module description's skill count is consistently 17

---

### US-434: Close the Trigger-Word Re-Localization Entry Gap [P2]

As a prospec user who, after adding a skill, wants to fill in localized trigger words,
I want agent sync to proactively detect new skills that are "already in `SKILL_DEFINITIONS` but missing a `skill_triggers` entry" and name them in a hint, and the onboarding/upgrade skills to fill in only the missing trigger words,
so that I never need to delete `.prospec.yaml` and re-run init to re-localize (i.e. no longer hitting the init-overwrite pitfall).

**Acceptance Scenarios:**
- WHEN the project is non-English and some skills lack a `skill_triggers` entry, THEN agent sync names the skills lacking trigger words in the hint (see REQ-AGNT-021)
- WHEN all skills already have a `skill_triggers` entry (or the language is English), THEN no missing-trigger hint is output
- WHEN the onboarding/upgrade skill handles trigger words, THEN it removes the "if `skill_triggers` is non-empty then skip the whole batch" all-or-nothing condition, changing it to fill only the missing entries (see REQ-TEMPLATES-108)

_(This Story's contract is carried by REQ-AGNT-021 and REQ-TEMPLATES-108 — both are Replace-in-Place updated under their original US, and the REQ blocks are not repeated here.)_

---

### US-435: Agent Config Files Preserve User-Written Content [P1]

As a developer who maintains custom instructions in CLAUDE.md/AGENTS.md,
I want agent sync to regenerate only the prospec-managed block and preserve the parts I wrote by hand, and I want init/sync to migrate rather than overwrite existing files that have no blocks,
so that sync/quickstart/upgrade no longer destroy my custom agent instructions.

**Acceptance Scenarios:**
- WHEN the CLAUDE.md/AGENTS.md written by agent sync contains `prospec:auto`/`prospec:user` blocks, THEN only the auto block is updated and the user block is preserved byte-for-byte
- WHEN the target file is existing content with no blocks, THEN the existing content is migrated wholesale into the user block and the prospec entry config fills the auto block (nothing is lost)
- WHEN agent sync is run twice consecutively, THEN the output is byte-identical (idempotent)

#### REQ-LIB-021: Managed-Doc Block Merge Primitive
`lib/content-merger` provides the pure function `mergeManagedDoc(generated, existing)` that centralizes the three merge paths, and exports `hasAutoBlock`/`replaceAutoBlock` (with the marker constant as the single source, and a function-replacer to keep `$` safe) shared by mergeManagedDoc and knowledge-update.
**Scenarios:**
- WHEN existing contains an auto block, THEN replace the auto block in place and preserve the rest (including the user block and content outside the blocks), inserting `$&`/`$$` verbatim
- WHEN existing has no blocks but is non-empty, THEN place the existing content into the generated user block
- WHEN existing is empty, THEN return generated as-is; re-merging against its own output is byte-identical (idempotent)

#### REQ-AGNT-027: Entry Config Auto/User Block Merge
`agent sync`'s `generateEntryConfig` is changed to "render → read the existing target file → `mergeManagedDoc` → `atomicWrite`", no longer overwriting unconditionally; quickstart/upgrade inherit this automatically via agent sync.
**Scenarios:**
- WHEN the target entry config contains block markers, THEN regenerate only auto and preserve user
- WHEN the target is existing content with no blocks, THEN migrate it into the user block
- WHEN multiple shared-standard agents converge on the same AGENTS.md, THEN it is still written only once (see REQ-AGNT-017)

#### REQ-TEMPLATES-123: Agent Config Templates Carry Block Markers
The output of `agent-configs/entry.md.hbs` (the single entry-config template shared by CLAUDE.md and AGENTS.md — `init/agents.md.hbs` has been deleted, and init's `AGENTS.md` is also rendered from this template) wraps all prospec content into `prospec:auto`, followed by an empty `prospec:user` block; the marker strings match the `content-merger` constants verbatim; the auto block contains the L0-L3 navigation constraint pointing at the root-level `{base_dir}/index.md`.
**Scenarios:**
- WHEN rendering this template, THEN the auto block wraps all prospec content (including the L0-L3 navigation constraint), immediately followed by an empty user block

---

### US-436: Establish a Four-Layer Hierarchical Index Structure [P1]

As an AI agent and developer,
I want to promote `ai-knowledge/_index.md` to `prospec/index.md` and implement the L1-L3 index and a dynamic scan-filter mechanism (the core must be read proactively at the start of a task, the rest load-on-demand), while keeping the L0 guidance in `AGENTS.md`/`CLAUDE.md`,
so that context overhead is reduced and the Token budget is precisely controlled.

**Acceptance Scenarios:**
- WHEN `prospec/index.md` is generated, THEN it should include the L1-L3 layer descriptions, and the L1 Conventions should distinguish the core (Core) list from the load-on-demand file list.
- WHEN running `prospec-knowledge-generate` or `update`, THEN the content should be written correctly to the root-level `prospec/index.md`.
- WHEN scanning the `_*.md` files under `ai-knowledge/`, THEN it can filter the core and load-on-demand files based on the core list.

#### REQ-AGNT-029: L0 Navigation Guidance
- WHEN `AGENTS.md` and `CLAUDE.md` are generated, THEN the `prospec:auto` block contains instructions explicitly pointing to `prospec/index.md` for L1-L3 knowledge.
- WHEN generating the Core Resources list, THEN `_diagram-conventions.md` is included alongside `_conventions.md`.

---

### US-437: Vitest-ify the Skill Generation Contract and Single-Source the Counts [P1]

As a prospec maintainer,
I want the skill / agent-config generation contract checks to run inside vitest (and therefore CI), with count assertions derived from a single source and status references changed to a named-set contract,
so that contract drift turns red in the PR rather than slipping to the release commit, and legitimate skill-set changes leave no stale magic number.

**Acceptance Scenarios:**
- WHEN running CI `test:coverage` on a PR THEN the generation contract runs as vitest real-temp-dir assertions (real `init` + `agent sync`, real templates, read-back of the output)
- WHEN any generation contract is broken (a skill missing a reference, the `.claude`/`.agents` mirrors inconsistent, a status reference added/removed) THEN the corresponding vitest test is RED
- WHEN the skill set or reference count changes due to a legitimate change THEN the expected values reflect it automatically, with no need to hand-edit hardcoded numbers

#### REQ-TESTS-038: Generation Contract Runs in a vitest real-temp-dir and Enters CI
The 28 generation contracts (sections A–G) of `verify-skills.sh` are taken over by a vitest integration test (`tests/integration/skill-contract.test.ts`): it runs real `init` + `agent sync` in a temp directory (real templates, no mocking of `template.js`, no dependence on `dist/` or a spawned CLI), executed by the existing `test:coverage` (included in `ci.yml`).
- WHEN inspecting the test, THEN each of the original 28 A–G checks has a corresponding assertion (item-by-item traceable)
- WHEN `pnpm test:coverage` runs, THEN this test is included; breaking any contract → the corresponding assertion is RED

#### REQ-TESTS-039: Counts Derived from a Single Source, Status References Changed to a Named-Set Contract
The contract count expectations are derived from a single source of truth (no hardcoded literals); the `_status-lifecycle.md` reference check is changed from a magic integer to a named-set contract that explicitly lists the skills, comparing set equality against the real render; at least one assertion cross-validates against the real filesystem output, to avoid derived-vs-derived self-consistency.
- WHEN reading the contract test, THEN the reference count is derived from `getSkillReferences` and the skill count from `SKILL_DEFINITIONS`, with no hardcoded literals like `4`/`1`/`2`/`26`
- WHEN a skill wrongly adds/removes a `_status-lifecycle.md` reference, THEN the rendered set ≠ the named-set → RED
- WHEN the generation logic writes too few/too many references, THEN the real output's readdir count ≠ the derived expectation → RED

#### REQ-AGNT-030: Export the skill→reference map as a Single Source
The previously module-private `getSkillReferences` / `SkillReference` in `agent-sync.service.ts` are exposed as an exported single source, so tests can derive the reference count; a pure addition of an export, with byte-identical generated output.
- WHEN reading `getSkillReferences` / `SkillReference`, THEN both are services exports that tests can import
- WHEN re-running `agent sync` after the export, THEN the produced SKILL.md / references / entry configs have zero diff

#### REQ-TESTS-040: Remove the bash Contract Source and Its Doc References
After the contracts moved into vitest, remove the redundant `scripts/verify-skills.sh` and `package.json` `verify:skills`, and sync-remove the verify:skills section from both READMEs, achieving a single test runner with no split-brain.
- WHEN grepping `verify:skills` / `verify-skills.sh` (excluding the `_lessons-ledger` and `_archived-history` history), THEN there are no live/dangling references
- WHEN the contract migration is complete, THEN the affected package counts are re-derived layer by layer via `vitest run` and reconciled consistently across README ×2 + `index.md` + the tests README

### US-438: Slim the L0 Skill Registry + Make References On-Demand [P1]

As a prospec framework operator and each downstream claude session,
I want the L0 registry slimmed for agents that auto-surface SKILL.md frontmatter, format references loaded on-demand per phase, and knowledge-generate to not redundantly inline the conventions skeleton,
so that each session saves the repeated registry tokens, lowers the marginal trigger context, and eliminates the drift risk of double-loading the format.

**Acceptance Scenarios:**
- WHEN agent sync produces CLAUDE.md for claude (surfacesSkillFrontmatter=true), THEN the registry is a slim `/prospec-*` guidance section, not a per-skill listing
- WHEN agent sync produces AGENTS.md for codex/copilot/antigravity, THEN the registry keeps the full per-skill table
- WHEN triggering ff/plan/archive, THEN the format references are not all loaded as MANDATORY in Startup Loading, but read on-demand in the corresponding phase (the `**MANDATORY**` count in Startup Loading is 0)
- WHEN inspecting knowledge-generate Step 4, THEN it does not inline the README skeleton but points at the canonical `_module-readme-conventions.md` (Startup Loading still loads that canonical file)

#### REQ-TYPES-059: AgentConfig SKILL.md Frontmatter Flag
`AgentConfig` carries `surfacesSkillFrontmatter: boolean` (`AGENT_CONFIGS`: claude=true, codex/copilot/antigravity=false) — the single source for entry-registry routing.
- WHEN reading `AGENT_CONFIGS`, THEN `claude.surfacesSkillFrontmatter` is true and the rest are false
- WHEN adding an agent, THEN this field is required (type-enforced, cannot be omitted)

#### REQ-AGNT-034: Per-agent Entry Registry Rendering
`agent-sync.service` `generateEntryConfig` passes `surfaces_skill_frontmatter` (taken from the corresponding `AgentConfig`) into the `entry.md.hbs` render context, reusing the single shared entry template.
- WHEN rendering the entry for claude, THEN the context `surfaces_skill_frontmatter` is true
- WHEN rendering for the AGENTS.md group, THEN the context `surfaces_skill_frontmatter` is false
- WHEN generating the entry, THEN no per-agent `.hbs` template is added

#### REQ-TEMPLATES-146: entry.md.hbs Conditional Registry
`entry.md.hbs` routes via `{{#if surfaces_skill_frontmatter}}`: true renders the slim guidance section (≤300 bytes), false / unset renders the `{{#each skills}}` full table (including each skill's Triggers and References).
- WHEN `surfaces_skill_frontmatter` is true, THEN output the slim section, with no per-skill table
- WHEN false or unset, THEN output the full per-skill table (unknown agents safely default to full)

#### REQ-TEMPLATES-147: Per-phase On-demand Format References
The format references of `prospec-ff`/`prospec-plan`/`prospec-archive` are moved out of Startup Loading (formerly `[STABLE] **MANDATORY**`), and read on-demand in the phase that uses the format; the wording follows the precedent of archive promotion-format / verify debug-recovery / design adapter; the reference deployment set is unchanged.
- WHEN inspecting the Startup Loading of the three skills, THEN the `**MANDATORY**` count is 0
- WHEN entering the phase that uses a format, THEN that phase's section contains an on-demand read instruction for the corresponding reference
- WHEN agent sync deploys, THEN each skill's `references/` content and count are unchanged

#### REQ-TEMPLATES-148: knowledge-generate Canonical-only README Structure
`prospec-knowledge-generate` Step 4 no longer inlines the Recipe-First skeleton mirror, but points at the canonical `{{knowledge_base_path}}/_module-readme-conventions.md` (Startup Loading still loads that canonical file).
- WHEN inspecting Step 4, THEN there is no inlined README skeleton, only the guidance pointing at the canonical file
- WHEN inspecting Startup Loading, THEN the canonical `_module-readme-conventions.md` load is retained

---

### US-439: CLI Emits a Translatable Trigger-Localization Scaffold [P1]

As a prospec user running quickstart / upgrade onboarding on a non-English project,
I want the CLI to emit a correctly formatted `skill_triggers` scaffold of "not-yet-localized skills + their English trigger baseline",
so that my AI agent can complete localization by translating the values in place, without guessing the YAML structure or grepping the deployed SKILL.md.

**Acceptance Scenarios:**
- WHEN the project is non-English and some skills lack a `skill_triggers` entry THEN `prospec agent triggers` outputs only the skills lacking an entry, each with the English baseline, as valid YAML
- WHEN the language is English or fully localized THEN it states plainly that no localization is needed and emits no misleading scaffold
- WHEN reading the output baseline THEN each entry equals `SKILL_DEFINITIONS.triggers` verbatim

#### REQ-AGNT-036: `prospec agent triggers` Emits Fill-Missing Trigger Scaffold
The new `agent triggers` subcommand (attached to the existing `agent` group) outputs a paste-ready `skill_triggers:` YAML scaffold for non-English projects: it contains only the skills lacking a non-empty entry, each with the English baseline from `SKILL_DEFINITIONS`, plus a header comment naming `artifact_language`. English / no gap → informational (stderr), stdout empty.

**Scenarios:**
- WHEN non-English + partial, THEN output only the gap skills, `skill-name → list<string>`, as valid YAML that can be pasted into `.prospec.yaml`
- WHEN inspecting each baseline, THEN it equals `SKILL_DEFINITIONS.triggers` verbatim (not reverse-derived from the deployed SKILL.md)
- WHEN English or fully localized, THEN informational, no scaffold; `README.md`/`README.zh-TW.md` document this command

#### REQ-SERVICES-066: Single-Source Fill-Missing Computation
`computeUnlocalizedSkills(config)` is the single source for "the set of skills lacking a non-empty `skill_triggers` entry", shared by the agent-sync hint (REQ-AGNT-021) and `agent triggers` (REQ-AGNT-036), not re-derived (PB-007).

**Scenarios:**
- WHEN reading, THEN a single exported function is the sole source; the agent-sync hint calls it (the hint is byte-identical before and after the extraction)
- WHEN an entry is an empty array, THEN treat it as unset (cf. REQ-AGNT-019); unknown skill keys are skipped

#### REQ-TESTS-052: agent-triggers Scaffold Contract
mutation-verified contract: baseline verbatim == `SKILL_DEFINITIONS`; fill-missing semantics (an empty array is treated as unset), English produces no scaffold; the formatter output parses as valid YAML and round-trips each baseline.

**Scenarios:**
- WHEN the baseline / fill-missing / English no-op logic is broken, THEN the corresponding assertion turns red
- WHEN a future baseline contains YAML-special characters that break the scaffold, THEN the round-trip contract turns red

---

## Edge Cases

- No AI CLI detected: list the supported ones and prompt for installation
- Write failure (disk full, insufficient permissions): atomic write, preserving the original file on failure
- A Planning Skill triggered with no Constitution: skip the Constitution Check without blocking the flow
- A new Agent platform not yet supported: gracefully skip and note that support is coming
- Skill template syntax error: preserve the previously deployed version when rendering fails
- `skill_triggers` pointing at a nonexistent skill: warn and skip (still output to stderr in quiet mode), without interrupting the sync
- Custom trigger words or a language string containing quotes/newlines: after escaping, the frontmatter is still valid YAML
- An existing project (no `artifact_language`) re-running sync: treated as English, backward-compatible

## Success Criteria

- **SC-1**: `prospec agent sync` generates correct configuration for all detected Agents
- **SC-2**: The deployed Skills stay consistent with the source .hbs templates
- **SC-3**: AI Knowledge saves 70%+ of token consumption
- **SC-4**: All 13 Skills pass the language-neutrality contract test

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED requirements are replaced directly with the latest state
2. **Functional Grouping**: New requirements are inserted into the corresponding functional group
3. **No Inline Provenance**: Historical traceability lives only in the Change History
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

#### ~~Gemini CLI Target~~
**Removed**: 2026-06-06 | **Change**: migrate-gemini-to-antigravity
**Reason**: Gemini CLI was retired on 2026-06-18. Its target (id `gemini`, `.gemini/skills`, `GEMINI.md`, detection `~/.gemini`) is fully removed and replaced by the Antigravity CLI Target (REQ-AGNT-016).

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-07-14 | add-metadata-format-reference | ADDED REQ-AGNT-037 (`getSkillReferences` registers `metadata-format` for new-story/ff, agent sync deploys self-contained, references dir count derived from the map) | US-401; REQ-AGNT-037 (ADDED) |
| 2026-07-03 | migrate-skill-contract-to-vitest | verify-skills.sh's 28 generation contracts moved into a vitest real-temp-dir; counts derived from `getSkillReferences`/`SKILL_DEFINITIONS`, status-lifecycle changed to a named-set contract; removed the bash script + `verify:skills` + README references | US-437; REQ-TESTS-038/039/040, REQ-AGNT-030 (ADDED) |
| 2026-07-01 | implement-hierarchical-index | ADDED REQ-AGNT-029 | US-436, REQ-AGNT-029 |
| 2026-02-04 | mvp-initial | Established agent sync, supporting 4 Agents | US-400~402, REQ-AGNT-001~012 |
| 2026-02-04 | skill-autonomy | Skills autonomously create scaffolding | REQ-AGNT-012 |
| 2026-02-09 | add-archive-system | Added the archive skill definition | REQ-TYPES-011 |
| 2026-02-09 | add-knowledge-update | Added the knowledge-update skill | REQ-TYPES-011 |
| 2026-02-16 | add-design-phase | Added prospec-design + 6 reference mappings | REQ-TYPES-011, REQ-AGNT-013 |
| 2026-03-01 | remove-skill-language-directives | Skill language neutralization | US-410, REQ-SKILL-009~010 |
| 2026-03-02 | v2-product-first migration | Migrated to the feature spec format | All |
| 2026-06-04 | skill-alignment (PR #2) | Skill reference paths aligned to each agent skill dir + self-contained skills (removed 8 legacy ref templates) | REQ-AGNT-014~015 (ADDED) |
| 2026-06-06 | migrate-gemini-to-antigravity | Gemini→Antigravity; codex/copilot converged on .agents/skills + AGENTS.md (single entry template, removed the instructions format); shared-output dedup; dynamic CLI list | REQ-AGNT-016/017/018 (ADDED), REQ-AGNT-002/004 (MODIFIED), Gemini Target (REMOVED) |
| 2026-06-11 | reorder-stable-prefix-loading | Startup Loading static-first reordering (BL-020): [STABLE]/[DYNAMIC] annotation, set invariance, entry config stability check | US-430, REQ-TEMPLATES-080~082 (ADDED) |
| 2026-06-11 | add-init-language-policy | Artifact English baseline; trigger words synthesis + skill_triggers injection; entry language declaration; Language Policy partial | US-411~412; REQ-TEMPLATES-073, REQ-SKILL-011~012, REQ-AGNT-019~021 (ADDED), REQ-SKILL-009 (MODIFIED) |
| 2026-06-14 | fix-archive-sibling-reference | prospec-archive self-contains promotion-format (removed the only cross-skill sibling-dir reference, added a contract guard); single source is still promotion-format.hbs | REQ-AGNT-015 (MODIFIED) |
| 2026-06-14 | vendor-engineering-heuristics | verify/review self-contain vendored MIT engineering-heuristic references (debug-recovery triage + three-lens criteria), zero runtime external dependency, full MIT notice + SHA, README See Also (not a dependency) | REQ-TEMPLATES-083/084/085, REQ-AGNT-022 (ADDED) |
| 2026-06-15 | add-quickstart-command | excludeFromEntryConfig onboarding skill (excluded from entry, SKILL.md still deployed) + prospec-quickstart template (paired with the CLI quickstart in project-setup US-010) | US-431; REQ-TYPES-030, REQ-AGNT-023, REQ-TEMPLATES-108, REQ-TESTS-029 (ADDED) |
| 2026-06-19 | backfill-promotion-path | prospec-promote-backfill skill registered (SKILL_DEFINITIONS 16) + `scale: backfill` enrolled in the CHANGE_SCALES enum + agent-sync deployment (proposal+delta-spec refs) + README ×2/CLAUDE.md skill list synced | US-432; REQ-TYPES-032/033, REQ-SERVICES-030, REQ-AGNT-024 (ADDED) |
| 2026-06-22 | fix-init-clobber-add-upgrade | prospec-upgrade skill registered/deployed + entry-excluded set {quickstart,upgrade} + agent-sync names missing-trigger skills + quickstart/upgrade fill-missing | US-433/434; REQ-TYPES-035, REQ-TEMPLATES-121, REQ-AGNT-026 (ADDED); REQ-TYPES-030, REQ-TESTS-029, REQ-AGNT-021, REQ-TEMPLATES-108 (MODIFIED) |
| 2026-06-22 | preserve-agent-config-edits | CLAUDE.md/AGENTS.md use `prospec:auto`/`prospec:user` block merging, agent sync/init no longer overwrite hand-written content; lib `mergeManagedDoc` + `hasAutoBlock`/`replaceAutoBlock` + `readFileIfExists`; entry/agents templates gain block markers | US-435; REQ-LIB-021, REQ-AGNT-027, REQ-TEMPLATES-123 (ADDED); REQ-AGNT-008 (MODIFIED) |
| 2026-06-27 | upgrade-config-nudges | canonical agent order unified to `claude, codex, copilot, antigravity` (VALID_AGENTS / AGENT_CONFIGS / AGENT_DIRS) | REQ-AGNT-028 (ADDED) |
| 2026-07-02 | fix-upgrade-doc-coverage | prospec-upgrade skill Step 2 changed to inventory-driven (consumes the report docs inventory as the sole scan scope, per-file consent to update/create, version-mismatch fallback; roots out hardcoded-list drift, issue #48) | REQ-TEMPLATES-121 (MODIFIED) |
| 2026-07-05 | agent-sync-hygiene | skill description single source (skill.ts→frontmatter, registry does not drift) + agent-sync orphan sweep (prospec-* reserved, removedSkills reported) + trigger-word anti-collision (baseline + Chinese, 0 cross-skill substring/dup) (issue #59) | US-411; REQ-AGNT-031/032/033, REQ-TESTS-046 (ADDED) |
| 2026-07-05 | skill-template-partials | skill template boilerplate (Next-Step Handoff/Output-Contract-note) extracted into a Handlebars partials single source (PB-006) + SKILL.md generated marker; re-render is byte-identical (marker excepted); byte-sync contract guard (issue #60) | US-401; REQ-TEMPLATES-143/144, REQ-TESTS-047 (ADDED) |
| 2026-07-06 | slim-skill-trigger-context | L0 registry slimmed per-agent (claude slim / AGENTS.md full, `AgentConfig.surfacesSkillFrontmatter` single source) + ff/plan/archive format refs → per-phase on-demand + knowledge-generate drops the inlined conventions mirror (issue #62) | US-438; REQ-TYPES-059, REQ-AGNT-034, REQ-TEMPLATES-146/147/148 (ADDED); REQ-AGNT-020 (MODIFIED) |
| 2026-07-06 | inject-resolved-knowledge-budgets | ADDED REQ-AGNT-035 (agent-sync injects the resolved token budget, knowledge-loading templates render it via variables, drops the `DEFAULT_KNOWLEDGE_TOKEN_BUDGET` symbol, points at `.prospec.yaml` + `prospec check knowledge-size`), REQ-TESTS-049 (generated skill budget rendering contract, mutation-verified) | US-401; REQ-AGNT-035, REQ-TESTS-049 (ADDED) |
| 2026-07-12 | emit-trigger-scaffold | `prospec agent triggers` fill-missing scaffold (baseline single source `computeUnlocalizedSkills`); the agent-sync hint and quickstart/upgrade onboarding point at this command | US-439 (ADDED); REQ-AGNT-036, REQ-SERVICES-066, REQ-TESTS-052 (ADDED); REQ-AGNT-021, REQ-TEMPLATES-108, REQ-TEMPLATES-121 (MODIFIED) |
| 2026-07-12 | converge-skill-triggers | 8 skill trigger baselines converged to prospec-specific/collision-free/≥3 (removed bare generic terms, added plan's 3rd word) + .prospec.yaml Chinese mirror; ≥3 intent machine-enforced | US-411; REQ-TESTS-053 (ADDED); REQ-AGNT-033 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
