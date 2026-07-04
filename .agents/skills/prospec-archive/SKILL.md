---
name: prospec-archive
description: "Archive Changes - Archive completed changes, generate summary, sync requirements to feature specs, and gate archiving on Knowledge sync. Triggers: archive, clean up, wrap up, spec sync, 封存, 歸檔, 收尾, 規格同步, 清理"
---

# Prospec Archive Skill

## Activation

When triggered, briefly describe:
- That you'll scan `.prospec/changes/` for completed changes
- Each archived change will get a summary.md and be moved to `.prospec/archive/`
- Knowledge sync for affected modules is enforced by the Entry Gate before archiving

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] Read `prospec/CONSTITUTION.md` — prepare Constitution spot check
2. [STABLE] **MANDATORY** — Read [`references/archive-format.md`](references/archive-format.md) for summary.md format specification
3. [STABLE] **MANDATORY** — Read [`references/feature-spec-format.md`](references/feature-spec-format.md) for Feature Spec format
4. [STABLE] **MANDATORY** — Read [`references/product-spec-format.md`](references/product-spec-format.md) for Product Spec format
5. [DYNAMIC] Read `.prospec/changes/` — scan all change directories and their `metadata.yaml`

## Entry Gate

> Blocking precondition check per archive target. If any item FAILs, stop and tell the user what is missing — do not archive that change. This gate is the **single mandatory knowledge-sync checkpoint** in the lifecycle (`/prospec-verify` only reports this-change knowledge lag as informational).

- Archive target is `status: verified` — only `/prospec-verify` at grade S/A produces `verified` (lifecycle: `prospec/ai-knowledge/_status-lifecycle.md`).
- Knowledge is synced for this change: every affected module README (modules from delta-spec ADDED/MODIFIED/REMOVED REQ ID prefixes) reflects the change's final state — REMOVED behavior must no longer appear in the README. Not synced → FAIL: run `/prospec-knowledge-update` for the affected modules, then re-run `/prospec-archive`. A change that touches no modules (planning/docs-only) passes this item.
  - **`metadata.scale: quick`** has no delta-spec — derive affected modules from the **actual diff file paths** mapped through `prospec/ai-knowledge/module-map.yaml` instead (REQ-prefix extraction over an absent delta-spec is an empty set and would silently pass). The path mapping is deterministic; the same FAIL rule applies.
  - **`metadata.scale: backfill`** uses feature-first, feature-slug REQ IDs (e.g. `REQ-USER-PROFILE-001`), so REQ-prefix extraction does **not** map to modules — derive affected modules from `metadata.related_modules` plus (`**Feature:**` → `prospec/ai-knowledge/feature-map.yaml` `modules`) instead. `related_modules` is always written by `/prospec-promote-backfill`, so the set is **never silently empty**; the feature may not yet be in feature-map (brand-new feature) — then `related_modules` is the source. The same FAIL rule applies.
  - **`metadata.scale: standard` / `full`** with a **feature-prefixed REQ** — a delta-spec REQ prefix that matches a `req_prefixes` entry in `prospec/ai-knowledge/feature-map.yaml` is a feature prefix, **not** a module (e.g. `REQ-MCP-*`). Derive that REQ's affected modules from `metadata.related_modules` plus (`**Feature:**` → feature-map `modules`), exactly as backfill does — treating the prefix as a module name would target a module that does not exist (silent no-op + phantom `modules/<prefix>/` risk, BL-043). Module-prefix REQ IDs (`REQ-SERVICES-*` …) map to their module as before. The same FAIL rule applies.
- **Quick spec-impact check** (`metadata.scale: quick` only): compare the actual diff against existing `prospec/specs/features/` REQs — this comparison is an LLM judgment step (do not claim determinism).
  - Diff affects spec-covered behavior → **FAIL**: require a minimal **Spec Impact** section appended to proposal.md (REQ ID + ADDED/MODIFIED per affected requirement), then re-run. Phase 3.5 graduates from that section.
  - No spec impact → pass; record the diagnostic conclusion in summary.md and skip graduation.

## Core Workflow

> Phases 3.5 (Feature Spec Sync), 3.6 (Product Spec Regeneration), and 4.5 (Auto-Harvest Recurring Lessons) are intentional insertions added by later changes — kept on purpose, not a numbering gap.

### Phase 1: Scan and Confirm Targets

Scan `.prospec/changes/` for changes with `status: verified` — **only `verified` changes are archivable** (status lifecycle: `prospec/ai-knowledge/_status-lifecycle.md`).
Display a table of archivable changes:

| Change Name | Status | Created | Modules |
|-------------|--------|---------|---------|

If a change is not `verified`, do NOT archive it — tell the user to run `/prospec-verify` and reach grade S/A first (that is what sets `status: verified`). Confirm with user before proceeding.

> **Phase 1 Gate** — proceed when:
> - [ ] Archivable-changes table listed only `status: verified` changes
> - [ ] User confirmed the set of changes to archive

### Phase 2: Generate Summary

For each change to archive:
1. Read `proposal.md` — extract User Story and acceptance criteria (and the Spec Impact section for a quick change that has one)
2. Read `delta-spec.md` — extract REQ IDs and affected modules (quick: absent — use the Spec Impact section and diff-derived modules from the Entry Gate)
3. Read `tasks.md` — calculate completion rate over **code tasks only** (kind schema: tasks-format reference). Unchecked code tasks → **warn and list them** before archiving; unchecked `[M]` manual tasks → reminder only, never blocking. (`scale: backfill` has no tasks.md — skip this step.)
4. Check for `design-spec.md` and `interaction-spec.md` — if present, note design artifacts in summary
5. Assemble the **Review & Verify** section from `metadata.yaml` `quality_log` (WARN/FAIL digest), `review.md` (critical/major counts + a short findings excerpt), and the verify report (grade + dimensions) — archiving is the one moment these still exist before the worktree workflow can discard them (same window as Phase 4.5 Harvest). When a source is absent, state it plainly (`Unverified`, `no review round`); **never fabricate** a grade or counts. Format: `references/archive-format.md` §6
6. Generate `summary.md` following `references/archive-format.md` specification — it MUST carry the `## Review & Verify` section from step 5

> **Phase 2 Gate** — proceed when:
> - [ ] `summary.md` generated per `references/archive-format.md` for each target change
> - [ ] `summary.md` carries the `## Review & Verify` section (grade + criticals/majors + `quality_log` digest; `Unverified`/`no review round` when a source is absent, never fabricated)
> - [ ] Code-task completion rate computed; any unchecked code tasks surfaced to the user

### Phase 3: Execute Archive

For each confirmed change:
1. Create `.prospec/archive/{YYYY-MM-DD}-{change-name}/`
2. Move all artifacts (proposal.md, plan.md, delta-spec.md, tasks.md, metadata.yaml, and design-spec.md + interaction-spec.md if present)
3. Place generated summary.md in archive directory
4. Update `metadata.yaml` to `status: archived`
5. Copy `summary.md` → `prospec/specs/_archived-history/{YYYY-MM-DD}-{change-name}.md` (date prefix = the archive date, same as the `.prospec/archive/{YYYY-MM-DD}-{change-name}/` folder) — the **committed** spec-history audit trail (`.prospec/archive/` is gitignored, so this copy is the only per-change record in version control). It lands in `_archived-history/` (drift-excluded via `ARCHIVED_EXCLUDES`), never flat under `prospec/specs/`. Non-fatal — a copy failure never blocks archiving. Format: `references/archive-format.md` §Spec Archiving.

> **Phase 3 Gate** — proceed when:
> - [ ] `.prospec/archive/{YYYY-MM-DD}-{change-name}/` created with all artifacts moved (originals not deleted)
> - [ ] `summary.md` placed in the archive directory
> - [ ] `metadata.yaml` `status` set to `archived`
> - [ ] `summary.md` copied to `prospec/specs/_archived-history/{YYYY-MM-DD}-{change-name}.md` (date-prefixed, committed spec history, non-fatal)

### Phase 3.5: Feature Spec Sync

> `/prospec-archive` is the **sole writer** of Feature Specs — requirements graduate into the permanent capability record here. `/prospec-verify` deliberately does not gate on Feature Spec freshness (see `_status-lifecycle.md`), so this graduation step is where `specs/features/` catches up to the change.

After archiving, sync User Stories and requirements to Feature Specs:

1. Read the archived `proposal.md` — extract User Stories (As a / I want / So that + Acceptance Scenarios)
2. Read the archived `delta-spec.md` — parse ADDED / MODIFIED / REMOVED sections with **Feature** and **Story** routing fields. **Graduation key by scale**: `standard`/`full` → delta-spec; `backfill` → delta-spec (same path — REQ + Story; feature-slug REQ ids route by `**Feature**` as usual); `quick` → the proposal's **Spec Impact** section (when the Entry Gate diagnosed no spec impact, skip graduation entirely — the summary.md diagnostic is the record)
3. For each requirement, route by the `**Feature**` field:
   - **ADDED (new Feature)**: Create `prospec/specs/features/{feature-slug}.md` following `references/feature-spec-format.md`. Insert User Story (from proposal) + REQ (from delta-spec) together
   - **ADDED (existing Feature)**: Merge User Story and REQ into the existing Feature Spec under the appropriate Story section
   - **MODIFIED**: Replace-in-place — update the User Story and REQ to their latest versions in the Feature Spec. Record the change in Change History table only (no inline Before/After)
   - **REMOVED**: Move the requirement to the Feature Spec's Deprecated Requirements section with removal reason and date
4. Update each affected Feature Spec's Change History table
5. Update frontmatter counters (`story_count`, `req_count`, `last_updated`)

**Feature Spec Sync is non-fatal** — if it fails, archiving still succeeds. Warn the user to manually update Feature Specs.

> **Phase 3.5 Gate** — proceed when:
> - [ ] Each ADDED/MODIFIED/REMOVED requirement routed into its Feature Spec under `prospec/specs/features/` (or graduation skipped for a quick change diagnosed as no-impact)
> - [ ] Affected Feature Specs' Change History tables and frontmatter counters updated
> - [ ] Any sync failure logged and surfaced to the user (non-fatal)

### Phase 3.6: Product Spec Regeneration

After Feature Spec Sync completes:

1. Scan all `prospec/specs/features/*.md` — read frontmatter (`feature`, `status`, `story_count`)
2. Extract P0 User Stories from each active Feature Spec for the Core Stories summary
3. Regenerate `prospec/specs/product.md` following `references/product-spec-format.md`
4. Regenerate `prospec/ai-knowledge/feature-map.yaml` — the feature→module index, scanned alongside `product.md` from the same `specs/features/*.md`. **Bootstrap-once + no-clobber**: an existing index (and its human-curated `req_prefixes`) is never overwritten; on first creation `modules` is seeded from each feature's module-prefix REQ headings and `req_prefixes` is left empty for human curation. The archive service writes it as an idempotent, non-fatal safety net (mirrors the raw-scan refresh below).

**Product Spec and feature-map regeneration are non-fatal** — if either fails, Feature Spec Sync results are still valid.

> **Phase 3.6 Gate** — proceed when:
> - [ ] `prospec/specs/product.md` regenerated per `references/product-spec-format.md`
> - [ ] Core Stories reflect P0 User Stories from all active Feature Specs
> - [ ] `prospec/ai-knowledge/feature-map.yaml` present (bootstrapped on first archive; existing curated index left untouched)

### Phase 4: Knowledge Sync Re-check

The Entry Gate already required Knowledge to be synced — this phase re-confirms the gate held through archiving (no prompt, no question):

1. Extract affected module names from delta-spec REQ ID prefixes (e.g., `REQ-SERVICES-010` → `services`, `REQ-CLI-005` → `cli`); for `scale: quick`, reuse the Entry Gate's diff-derived module set (module-map.yaml path mapping); for `scale: backfill`, reuse the Entry Gate's `metadata.related_modules` + `**Feature:**`→feature-map module set (REQ-prefix extraction does not apply to feature-slug REQ IDs); for `scale: standard`/`full`, a REQ prefix matching a feature-map `req_prefixes` entry is a feature prefix — resolve it via `metadata.related_modules` + `**Feature:**`→feature-map, not as a module name (BL-043)
2. Confirm each affected module README still reflects the archived change; list the confirmed modules:
   ```
   Knowledge sync confirmed for this change:
   - [module-1]: [N] requirements reflected
   - [module-2]: [N] requirements reflected
   ```
3. If a gap is found (gate state regressed since the Entry Gate), STOP: run `/prospec-knowledge-update` for the gap, then continue — do not fall back to an optional prompt
4. Refresh the deterministic project-structure snapshot so `prospec/ai-knowledge/raw-scan.md` reflects the just-archived code for the next `/prospec-knowledge-generate`. CLI fallback ladder (no LLM, Windows-safe, no Python/bash): `prospec knowledge init --raw-scan-only` (PATH) → `pnpm exec prospec knowledge init --raw-scan-only` / `npx -y prospec knowledge init --raw-scan-only` (project devDep). Non-fatal — if no Node toolchain is available, note it and continue (the archive service runs the same raw-scan regeneration as an idempotent safety net when invoked programmatically).

> The archive service additionally auto-triggers a knowledge update AND the same `prospec knowledge init --raw-scan-only` as idempotent safety nets — with the Entry Gate already satisfied and the refresh just run, they are no-ops, not a substitute for the gate or for step 4. For `scale: backfill` the service **skips** the auto knowledge-update entirely: its feature-slug REQ ids (`REQ-{FEATURE-SLUG}-NNN`) are not module names, so the REQ-prefix-driven update would mint phantom modules — backfill module sync stays owned by the Entry Gate (`related_modules`/`**Feature:**`→feature-map).

> **Phase 4 Gate** — proceed when:
> - [ ] Every affected module README re-confirmed to reflect the archived change (no regression since the Entry Gate)
> - [ ] Confirmed modules listed with their reflected requirement counts; any gap resolved via `/prospec-knowledge-update`
> - [ ] `raw-scan.md` refreshed via `prospec knowledge init --raw-scan-only` (or CLI-unavailable noted)

### Phase 4.5: Auto-Harvest Recurring Lessons

Archiving is the **one moment** this change's `quality_log` and `review.md` still exist before the worktree workflow can discard them — so harvest them into the version-controlled ledger now, rather than only pointing the user at `/prospec-learn` later (which, in a fresh worktree, would find the archive already gone).

Follow the **Harvest** definition in [`references/promotion-format.md`](references/promotion-format.md) (read it on demand; do not restate the ledger table here):

1. Scan this change's `metadata.yaml` `quality_log` (WARN/FAIL) and `review.md` (recurring criticals); cross `tasks.md` × kind markers for `[M]` manual tasks left unchecked.
2. Assign each finding its deterministic ledger key and **upsert** into `prospec/ai-knowledge/_lessons-ledger.md`: `source_changes` is a set and `frequency` increments once per distinct change, so re-archiving is **idempotent** (no double-count). A recurring unchecked-`[M]` pattern records a `kind: playbook` "manual task systematically skipped" lesson; a `tasks.md` without kind markers is skipped, not guessed.
3. This is **non-fatal** (try/catch + log, like Feature Spec Sync / knowledge update) — a harvest failure never blocks archiving.

Then point the user at `/prospec-learn` for Score/Promote — auto-harvest only accumulates; nothing is promoted to `_playbook.md`/Constitution without explicit human approval.

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] summary.md generated
- [ ] Feature Spec sync completed
- [ ] metadata status set to archived
- [ ] knowledge sync confirmed (Entry Gate held through Phase 4 re-check)

### Failure Conditions
- archived a non-verified change without confirmation
- Feature Spec sync skipped

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

## NEVER

- **NEVER** archive without user confirmation — accidental archiving moves active work out of changes/; recovery requires manual file moves
- **NEVER** archive a change that is not `status: verified` — only `/prospec-verify` at grade S/A produces `verified`; archiving `story` / `plan` / `tasks` / `implemented` bypasses the verification gate and risks meaningless summaries, broken Spec Sync, or unverified work entering the permanent record. Tell the user to verify to S/A first (lifecycle: `prospec/ai-knowledge/_status-lifecycle.md`)
- **NEVER** skip summary.md generation — summary is the permanent record in the archive directory; without it, the change has no audit trail
- **NEVER** emit a summary.md that lacks the `## Review & Verify` section — the review/verify evidence (grade, criticals/majors, `quality_log`) lives only in the gitignored bundle otherwise, and the `_archived-history` copy is the sole durable record; when a source is absent record `Unverified`/`no review round`, never fabricate
- **NEVER** delete original files instead of moving — deletion is irreversible; archive preserves all artifacts for future reference and debugging
- **NEVER** modify the content of artifacts during archive — artifacts are the historical record; any modification falsifies the development history
- **NEVER** bypass the Entry Gate knowledge-sync check — a failed `/prospec-knowledge-update` means the gate stays FAIL; fix it and re-run, then archive. Archiving with stale Knowledge writes a permanent record that contradicts the code, and no later checkpoint will force the sync
- **NEVER** archive without reading delta-spec.md — affected modules drive both Spec Sync and Knowledge Update; skipping produces orphaned requirements (`scale: quick` is the exception: modules come from diff paths and graduation from the Spec Impact section; `scale: backfill` derives modules from `related_modules`/`**Feature:**`→feature-map, graduating via the delta-spec as usual)
- **NEVER** skip the quick spec-impact check or treat its empty REQ-prefix module set as "touches no modules" — an absent delta-spec is not evidence of no impact; the actual diff is

## Error Handling

| Scenario | Action |
|----------|--------|
| No changes found in changes/ | Inform user that there are no changes to archive |
| Entry Gate knowledge-sync FAIL | Guide user to run `/prospec-knowledge-update` for the affected modules, then re-run `/prospec-archive` |
| Change missing metadata.yaml | Skip that change, warn user about incomplete change directory |
| Change missing delta-spec.md | `scale: quick`: expected — run the quick spec-impact check instead. Otherwise: archive with partial summary, note missing spec in summary.md |
| Archive directory already exists | Warn user, ask whether to overwrite or skip |
| File move fails | Roll back that specific change's archive, report error, continue with others |

## Next-Step Handoff

After the Output Summary, recommend the next step in the SDD workflow order
(`story → plan → tasks → implement → review → verify → archive`, then periodic `learn`) — read
`metadata.yaml` status and `prospec/ai-knowledge/_status-lifecycle.md` (review and learn own no
status transition, so follow this order, not status alone). Then ask **"Run <next-step> now? (Y/n)"**:
on **Y**, invoke it in this session; on **n**, stop and leave the suggestion — never auto-run without
the Y. If the stage is terminal (`archived`), the linear flow is complete — point to periodic `/prospec-learn`
rather than a workflow successor. If the result does not advance (e.g. verify grade B/C/D), say so and
point to the corrective step instead of offering the next skill.
