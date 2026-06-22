---
name: prospec-knowledge-update
description: "Incremental Knowledge Update - Parse delta-spec.md to identify affected modules, scan source code, and update module README, _index.md, and module-map.yaml incrementally. Triggers: knowledge update, incremental update, sync knowledge, update docs, 更新知識, 增量更新, 同步知識, 更新文件"
---

# Prospec Knowledge Update Skill

## Activation

When triggered, briefly describe:
- That you'll parse delta-spec.md to identify affected modules
- Only affected modules will be scanned (not the entire codebase)
- Module README.md (Recipe-First format), _index.md, and module-map.yaml will be updated incrementally
- User-written sections (prospec:user-start/end) are always preserved

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] Read `prospec/CONSTITUTION.md` — verify compliance constraints
2. [STABLE] Read `prospec/ai-knowledge/_conventions.md` — team conventions (incl. the Module READMEs pointer)
3. [STABLE] **MANDATORY** — Read `prospec/ai-knowledge/_module-readme-conventions.md` for the canonical README output format (section order, `# {ProperName}` title, `prospec:auto`/`prospec:user` marker contract)
4. [DYNAMIC] Read `.prospec/changes/[name]/delta-spec.md` — identify ADDED/MODIFIED/REMOVED requirements
5. [DYNAMIC] Read `prospec/ai-knowledge/_index.md` — current module index
6. [DYNAMIC] Read `prospec/ai-knowledge/module-map.yaml` — current dependency graph (if exists)

## Token Budget Reminder

Updated knowledge must respect these limits:

| Layer | Content | Budget |
|-------|---------|--------|
| L1 | Each module `README.md` (and each `{sub-module}.md`) | ≤ 400 tokens / ≤ 100 lines each |
| L0 | `_index.md` + `_conventions.md` | ≤ 1,500 tokens total |

After updating, verify the affected README stays within budget. If it overflows and has a content-rich, functionally-independent sub-area, extract a sub-module (see Phase 3a) rather than trimming away useful detail; otherwise trim Key Files and Public API, keeping Modification Guide and Pitfalls intact. Canonical rules: `prospec/ai-knowledge/_module-readme-conventions.md`.

## Core Workflow

### Phase 1: Parse Delta Spec

Parse delta-spec.md to extract affected modules:

| Section | Action | Example |
|---------|--------|---------|
| ADDED | Create new module README.md + add to _index.md + add to module-map.yaml | REQ-AUTH-001 → new `auth` module |
| MODIFIED | Update existing module README.md with current implementation | REQ-SERVICES-010 → update `services` README |
| REMOVED | Mark module as deprecated in README.md (do NOT delete) | REQ-LEGACY-001 → deprecate `legacy` module |

Extract module names from REQ IDs: `REQ-{MODULE}-{NNN}` → module name is `{MODULE}` (lowercased).

**Fallback (no delta-spec):** Ask user to specify module names manually.

> **Phase 1 Gate** — proceed when:
> - [ ] affected module names extracted from delta-spec.md REQ IDs (or specified manually via fallback)
> - [ ] each module classified as ADDED / MODIFIED / REMOVED

### Phase 2: Scan Affected Modules

For each affected module:
1. Locate module paths from `module-map.yaml` (or infer from module name)
2. Scan source files (max 20 key files per module)
3. Infer file descriptions from naming patterns (service.ts, test.ts, etc.)
4. Read the module's existing `README.md` **and any `{sub-module}.md`** linked from its `## Sub-Modules` section — an update may need to refresh a sub-module, not just the main README

> **Phase 2 Gate** — proceed when:
> - [ ] each affected module's source files located and scanned (≤ 20 key files per module)
> - [ ] existing README.md and any linked `{sub-module}.md` read for each module

### Phase 2.5: Format Drift Check (consent-gated)

Before writing, check whether the **existing** Knowledge files' format still matches the current
templates/conventions — independent of this change's content:
- `_index.md` column schema vs the canonical INDEX columns and `_module-readme-conventions.md`
- each affected module `README.md` section structure vs `_module-readme-conventions.md` (the section
  set + marker contract)
- `_conventions.md` `prospec:auto`/`user` marker structure

If a file's **format** has drifted (sections/columns/markers differ from the current conventions),
list the specific drift and **ask the user whether to update the format** in this run. Migrate the
format only on consent — never rewrite authored content. If the user declines, do the content
increment in the existing format and note the declined format update. When there is no drift, proceed
silently — do not prompt.

> **Phase 2.5 Gate** — proceed when:
> - [ ] existing Knowledge format compared against current conventions/templates
> - [ ] any drift listed and a format update applied only on user consent (or declined and noted)

### Phase 3: Update Knowledge Files

#### 3a: Module README.md (ADDED/MODIFIED) — Recipe-First Format

For ADDED modules:
- Create `prospec/ai-knowledge/modules/{module}/README.md`
- Generate full README in Recipe-First format:

```
# {module_name}
> One-line description

<!-- prospec:auto-start -->
## Key Files         (top 10 most important files)
## Public API        (signature + 1-line, max 8 entries)
## Dependencies      (depends_on with WHY, used_by)
## Modification Guide (step-by-step for common changes)
## Ripple Effects    (what breaks when this changes)
## Pitfalls          (common mistakes, non-obvious constraints)
<!-- prospec:auto-end -->
<!-- prospec:user-start -->
<!-- prospec:user-end -->
```

For MODIFIED modules:
- Read existing README.md
- Regenerate `prospec:auto-start/end` sections with updated information
- **Preserve** all content within `prospec:user-start/end` markers via ContentMerger
- Update Key Files table, Public API list, dependency info
- **Refresh Modification Guide** — if implementation patterns changed, update guidance
- **Refresh Ripple Effects** — if new dependencies were added, update impact list
- **Maintain sub-modules** — if the module already has `## Sub-Modules` links, update the affected `{sub-module}.md` (and the link's one-liner) instead of cramming the detail back into the README. If the change pushes the README over budget and a content-rich, independent sub-area now exists, extract a new sub-module (`{module}/{sub-module}.md`) and add it to `## Sub-Modules` — do NOT add it to `_index.md`.

#### 3b: Module README.md (REMOVED)

- Add deprecated banner at top of README.md
- Do NOT delete the file or directory
- Update status in _index.md to "Deprecated"

#### 3c: _index.md

Update the module table within `prospec:auto-start/end` markers using the current format:

```
| Module | Keywords | Aliases | Status | Description | Rationale | Depends On |
```

- Add new modules (ADDED) with Rationale explaining why the module exists, plus Aliases (synonyms + user-language terms that should match this module)
- Update descriptions, keywords, and aliases (MODIFIED)
- Mark as Deprecated (REMOVED)
- Ensure Loading Rules section is present and accurate
- If the _index.md uses `### {Category}` grouped sub-tables, keep the grouping — place each module under its primary category (`module-map.yaml` `category[0]`); an ADDED module goes under a derived category consistent with existing groups, listed under its primary heading only

#### 3d: module-map.yaml

- Add new module entries (ADDED)
- Update relationships if changed (MODIFIED)
- Remove module entries (REMOVED)
- Preserve each existing module's `category` (do NOT re-guess it); for an ADDED module, derive an ordered `category: [primary, …]` consistent with existing grouping and write it
- Skip if module-map.yaml doesn't exist

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] every affected module README updated
- [ ] _index.md and module-map.yaml synced
- [ ] REMOVED requirements marked deprecated (not deleted)

### Failure Conditions
- no delta-spec and no manually specified module
- an affected module left stale

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

## NEVER

- **NEVER** overwrite content between `prospec:user-start/end` markers — always preserve user notes
- **NEVER** migrate an existing Knowledge file's format without listing the drift and getting user consent (Phase 2.5) — content increments are fine, format rewrites need a yes
- **NEVER** delete module directories for REMOVED requirements — mark as deprecated only
- **NEVER** scan the entire codebase — only scan modules identified from delta-spec
- **NEVER** run without either delta-spec.md or manual module specification — one input source is required
- **NEVER** skip _index.md update — the index must always reflect current module state
- **NEVER** ignore module-map.yaml when it exists — dependency graph must stay in sync
- **NEVER** generate api-surface.md, dependencies.md, or patterns.md — all info goes in README.md (or its sub-module files) only
- **NEVER** exceed 100 lines per module README or sub-module — when it overflows, extract an independent sub-area to `{module}/{sub-module}.md` and link it from `## Sub-Modules` before resorting to lossy trimming
- **NEVER** list sub-modules in `_index.md` or `module-map.yaml` — they are reached only via the parent README's `## Sub-Modules` links

## Error Handling

| Scenario | Action |
|----------|--------|
| delta-spec.md not found | Ask user to specify modules manually or point to delta-spec path |
| module-map.yaml not found | Skip module-map update, proceed with README and _index.md only |
| Module directory doesn't exist (MODIFIED) | Treat as ADDED — create new module directory and README |
| ContentMerger conflict | Prefer new auto content, always preserve user sections |
| Source scan returns 0 files | Generate minimal README with module name only, warn user |
| README exceeds 100 lines after update | Trim Key Files and Public API; keep Modification Guide and Pitfalls |
