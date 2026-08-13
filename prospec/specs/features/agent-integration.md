---
feature: agent-integration
status: active
last_updated: 2026-08-13
story_count: 21
req_count: 83
---

# Agent Integration

## Who & Why

Serves developers who use Prospec together with a variety of AI Agents (Claude Code, Antigravity CLI, Copilot, etc.). Agent Integration detects installed AI CLI tools and generates the corresponding configuration and SDD Skill files, so that AI Agents operate within Prospec's structured development workflow. Through three-layer Progressive Disclosure and a language-neutralization mechanism, it ensures Skills work correctly across different Agents and language environments.

## Slices

- [US-400–US-402](./agent-integration/us-400.md)
- [US-410–US-430](./agent-integration/us-410.md)
- [US-431–US-433](./agent-integration/us-431.md)
- [US-434–US-438](./agent-integration/us-434.md)
- [US-439–US-442](./agent-integration/us-439.md)

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
| 2026-08-13 | guard-canonical-doc-drift | ADDED REQ-SERVICES-089; MODIFIED REQ-TEMPLATES-121 | REQ-SERVICES-089, REQ-TEMPLATES-121 |
| 2026-08-07 | measure-all-load-surfaces | MODIFIED REQ-AGNT-035 | REQ-AGNT-035 |
| 2026-07-30 | add-harness-capability-flags | ADDED REQ-TYPES-071; ADDED REQ-AGNT-038; ADDED REQ-TEMPLATES-167; ADDED REQ-TESTS-063 | REQ-TYPES-071, REQ-AGNT-038, REQ-TEMPLATES-167, REQ-TESTS-063 |
| 2026-07-30 | restore-cli-first | ADDED REQ-CLI-027; ADDED REQ-TEMPLATES-160; MODIFIED REQ-AGNT-012; MODIFIED REQ-TEMPLATES-158; MODIFIED REQ-TEMPLATES-108; MODIFIED REQ-TEMPLATES-121 | REQ-CLI-027, REQ-TEMPLATES-160, REQ-AGNT-012, REQ-TEMPLATES-158, REQ-TEMPLATES-108, REQ-TEMPLATES-121 |
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
| 2026-07-25 | align-language-policy-scope | Entry config renders the shared LanguageScope (both render sites); prospec-upgrade gains the consent-gated seeded-wording migration; the language-policy partial goes path-scoped | US-440 (ADDED); REQ-TEMPLATES-151/152 (ADDED); REQ-AGNT-020, REQ-TEMPLATES-121, REQ-SKILL-012 (MODIFIED) |
| 2026-07-29 | add-status-router | Session Start routes as code: the entry config points at read-only `prospec status` (net L0 reduction, CLI-unavailable fallback); both status-lifecycle copies carry the executable-copy pointer; the prose derivation's REQ-TEMPLATES-099 is MODIFIED in sdd-workflow (issue #97) | US-441; REQ-TEMPLATES-158 (ADDED) |
| 2026-07-30 | add-harness-capability-flags | Harness capabilities become declarative per-agent registry flags (`canSpawnSubagent`/`canWorktree`/`canBackground`) injected into the skill render context, with shared-output groups resolved to the conservative intersection; `_harness-capabilities.hbs` becomes the single source for degradation wording (issue #95) | US-443; REQ-TYPES-071, REQ-AGNT-038, REQ-TEMPLATES-167, REQ-TESTS-063 (ADDED) |
