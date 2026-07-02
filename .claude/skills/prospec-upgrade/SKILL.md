---
name: prospec-upgrade
description: "Prospec Version Upgrade Finisher - after `prospec upgrade` records the version, syncs agents, and reports gaps, scan the files `prospec init` created and update their format to the latest templates (asking consent per file), then localize triggers for newly-added skills and re-sync. Triggers: upgrade, upgrade prospec, migrate version, version bump, 升級, 升級 prospec, 版本遷移, 版本升級"
---

# Prospec Upgrade Skill

## Activation

When triggered, briefly describe:
- That `prospec upgrade` has recorded the new prospec version in `.prospec.yaml` and re-synced agents, and you'll finish the judgment steps it cannot do deterministically
- You'll scan the files `prospec init` created, offer to update any whose format has drifted from the latest templates (asking before each change), offer to set an artifact language if the project never chose one (a project from a pre-feature CLI), and localize triggers for skills that have none
- This is a periodic upgrade flow — re-runnable and self-terminating

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.

## Startup Loading

1. [DYNAMIC] Read `.prospec.yaml` — `version`, `artifact_language`, and `skill_triggers` drive the steps below

## Core Workflow

> This skill shells out to the `prospec` CLI (Bash), mirroring `prospec-quickstart`.
> When the CLI is unavailable, degrade gracefully — never fail silently.

### Step 0: Probe the CLI

Run `prospec --version` (Bash). When it is unavailable (not built / installed / linked),
STOP and tell the user to install or rebuild prospec, then re-run — never proceed silently.

### Step 1: Run the deterministic upgrade

Run `prospec upgrade --no-interactive` (Bash) and read its stdout. The `--no-interactive` flag is
required: without it `prospec upgrade` prompts to fill nudges on a terminal, which would block this
Bash call — you drive those choices in-conversation (Steps 3–4) instead. It has already (a) recorded
the running prospec version in `.prospec.yaml` `version` (comment-preserving in-place merge), and
(b) re-run `agent sync`. Parse the **Upgrade report**:
- `version <from> → <to>` — the prospec version delta
- `no artifact_language set …` — the project predates the artifact-language feature and never chose a
  language (Step 3). Mutually exclusive with the line below: an unset language resolves to English, so
  no triggers are reported missing.
- `skills missing triggers: …` — newly-added skills with no localized triggers (Step 4)

If `prospec upgrade` fails with `ConfigNotFound`, the project is not initialized — STOP and tell the
user to run `prospec init` first.

### Step 2: Refresh init-created doc formats (scan → diff → consent)

`prospec upgrade` deliberately does NOT touch any doc `prospec init` created — those may carry user
edits, so updating their format requires consent. Do it here:

1. **Locate the latest templates** shipped with the installed prospec version. **Source-repo
   short-circuit first**: if the project's own `package.json` `name` equals the prospec package name
   (`@benwu95/prospec`), the working directory IS the package root — use `.` and skip the resolution
   below. This is the dogfooding case; `require.resolve('@benwu95/prospec/package.json')` fails here
   because the package is absent from its own `node_modules` and the package has no `exports` field
   to enable Node self-referencing. Otherwise resolve the package root (e.g.
   `node -e "console.log(require.resolve('@benwu95/prospec/package.json'))"`, or check
   `node_modules/@benwu95/prospec`, or a global install via `npm root -g`). If `require.resolve`
   fails — a `pnpm link`/globally-linked install keeps the package outside the project's
   `node_modules` — derive the root from the running CLI instead: follow `$(which prospec)` (a
   shim/symlink to `<package-root>/dist/cli/index.js`) back up to `<package-root>`. The canonical
   convention docs are language-neutral templates under `src/templates/init/` (the package ships and
   loads them from `src/templates/`, not a root-level `templates/` — `tsc` does not copy `.hbs` into
   `dist/`). If the templates cannot be located, say so and SKIP this step (do not guess the latest
   format).
2. **Scan the init-created files** in the project's knowledge base and compare each to its latest
   template:
   - `prospec/ai-knowledge/_status-lifecycle.md` ← `src/templates/init/status-lifecycle.md.hbs`
   - `prospec/ai-knowledge/_module-readme-conventions.md` ← `src/templates/init/module-readme-conventions.md.hbs`
   - `prospec/ai-knowledge/_diagram-conventions.md` ← `src/templates/init/diagram-conventions.md.hbs`
   - `prospec/CONSTITUTION.md` (Constitution), `prospec/ai-knowledge/_conventions.md` — compare the **format/structure** (severity tags, section markers), never the user's authored wording
   - **Index Migration**: If `prospec/ai-knowledge/_index.md` exists, offer to migrate it to the new root location `prospec/index.md` using `src/templates/knowledge/index.md.hbs`. Preserve any user notes in the `<!-- prospec:user-start -->` block, and **copy the curated `Modules` table rows verbatim** into the new file's `prospec:auto` block — the Keywords / Aliases / Rationale / Depends On columns are human-curated and exist nowhere else. Do NOT run `prospec knowledge update` to rebuild the table: it fills only Module / Status / Description from `module-map.yaml` and blanks every curated column to `—`. Delete the old `prospec/ai-knowledge/_index.md` after a successful move.
3. For each file whose format has drifted, **show a diff and ask the user whether to update it** —
   migrate the FORMAT only, preserving authored content. Apply only the files the user approves;
   leave the rest unchanged.

### Step 3: Offer to set an artifact language (only when unset)

Run this step ONLY when Step 1's report shows `no artifact_language set` (a project scaffolded by a
pre-feature CLI — `prospec init` always writes the field). Skip it entirely otherwise; never re-ask a
project that already chose a language, including an explicit `English`.

1. Tell the user their project has no `artifact_language`, so AI-generated documents currently default
   to **English**, and ask which language they want for AI-generated documents (default: English).
2. **If they choose a non-English language**: capture `.prospec.yaml` verbatim as a snapshot, add the
   `artifact_language` key by a **minimal in-place edit** (insert the single key; never re-serialize or
   reorder), then read the file back to confirm it still parses — restore the snapshot if not. Every
   skill is now unlocalized, so Step 4 will localize them all.
3. **If they keep English**: add `artifact_language: English` by the same minimal in-place edit (so this
   prompt is self-terminating on the next upgrade), then skip Step 4 — English uses the baseline
   triggers and needs no `skill_triggers`.

### Step 4: Localize triggers for skills missing them (fill-missing) + re-sync

Re-read `.prospec.yaml` (Step 3 may have just set the language). When `artifact_language` is non-English,
localize every skill that still has **no `skill_triggers` entry** — that is Step 1's "skills missing
triggers" list, plus, when Step 3 just set the language, all skills. Skip entirely when the language is
English or every skill already has an entry.

1. **Capture the current `.prospec.yaml` content verbatim** as a snapshot to restore from
2. Translate ONLY those skills' English trigger baselines into `artifact_language`
3. **Show the proposed translations and wait for confirmation** before writing anything
4. On confirmation, add the new `skill_triggers` keys by a **minimal in-place edit** — insert only the
   missing keys; never re-serialize the file or touch existing keys, their order, or comments
5. Read `.prospec.yaml` back and confirm it still parses as valid YAML; if not, restore the snapshot
6. If anything changed in Step 2, Step 3, or Step 4, run `prospec agent sync` (Bash) so the language,
   localized triggers, and refreshed docs land in each SKILL.md frontmatter and the entry config

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] `prospec upgrade` ran and `.prospec.yaml` `version` equals the installed prospec version
- [ ] every init-created file whose format drifted was shown to the user and updated only on consent (or templates were unavailable and the step was skipped with a note)
- [ ] when the report flagged `no artifact_language set`, the user was asked which language to use and `artifact_language` was written to their choice (or they declined)
- [ ] every skill in the report's "missing triggers" list (and all skills, when Step 3 just set a non-English language) is localized (or the user declined)
- [ ] `prospec agent sync` ran when Step 2, Step 3, or Step 4 changed anything

### Failure Conditions
- updated an init-created file without showing a diff and getting confirmation
- set `artifact_language` (or wrote `skill_triggers`) without user confirmation
- wrote malformed `artifact_language` or `skill_triggers` to `.prospec.yaml`
- proceeded silently when the `prospec` CLI or its templates were unavailable

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

## NEVER

- **NEVER** update an init-created file without a diff preview AND explicit user confirmation — `prospec upgrade` never touches these, and the skill does so only with consent
- **NEVER** rewrite a doc's authored content/intent — migrate only its format/structure to the latest template
- **NEVER** set or change `artifact_language` for a project that already has one — Step 3 runs only when the report flags it unset
- **NEVER** set `artifact_language` without first asking the user which language they want
- **NEVER** re-translate or overwrite an existing `skill_triggers` entry — localize only the skills with no entry yet
- **NEVER** write `artifact_language` or `skill_triggers` without reading `.prospec.yaml` back to confirm it still parses
- **NEVER** proceed silently when the `prospec` CLI or its templates are unavailable — stop or skip with a note, then let the user decide

## Error Handling

| Scenario | Action |
|----------|--------|
| `prospec` CLI unavailable | Stop; tell the user to install/rebuild prospec, then re-run — do not proceed silently |
| `prospec upgrade` reports `ConfigNotFound` | Project not initialized — stop and instruct the user to run `prospec init` first |
| prospec templates cannot be located | Skip Step 2 with a note; still do Step 3 (artifact language) and Step 4 (trigger localization) |
| `prospec agent sync` reports no configured agent | Stop and instruct the user to re-run `prospec init` or add an agent to `.prospec.yaml` |
| `.prospec.yaml` fails to parse after writing `artifact_language` or triggers | Restore the captured pre-write snapshot verbatim, then report the malformed write |
| User declines setting an artifact language | Leave `.prospec.yaml` unchanged and skip Step 4; the next upgrade will offer again |
| User declines a doc-format update | Leave the file unchanged; record it as declined in the Output Summary |
