---
name: prospec-promote-backfill
description: "Promote Backfill - Formalize a reviewed backfill-draft.md into the backfill change scaffold (proposal.md + delta-spec.md + metadata.yaml with scale: backfill, status: implemented) so brownfield behavior can graduate through verify → archive. A light scale like quick — no hollow plan.md/tasks.md; the single, repeatable draft→scaffold step; never writes the trust zone. Triggers: promote backfill, formalize backfill, backfill to delta-spec, promote draft, 晉升回填, 正式化回填, 回填轉正, 提升草稿"
---
<!-- Generated from src/templates/skills/prospec-promote-backfill.hbs by `prospec agent sync`. Edit the template, not this file — it is overwritten on the next sync. -->

# Prospec Promote Backfill Skill

## Activation

When triggered, briefly describe:
- That you'll formalize a **reviewed** `backfill-draft.md` into the backfill change scaffold — `proposal.md` + `delta-spec.md` + `metadata.yaml` — so it can graduate through `/prospec-verify` (backfill mode) → `/prospec-archive`
- That this is the single, repeatable draft→scaffold step — it replaces ad-hoc hand conversion and is where the `scale: backfill` marker is set
- That `backfill` is a **light scale** like `quick`: it records *existing* behavior, so there is **no `plan.md` and no `tasks.md`** (nothing to plan, no work to schedule). The scaffold enters the lifecycle directly at `status: implemented`
- That it **never** writes the trust zone (`prospec/specs/features/`) — `archive.service.ts` stays the sole writer

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] **MANDATORY** — Load the format references this scaffold must match: `references/proposal-format.md`, `references/delta-spec-format.md`
2. [DYNAMIC] Read `.prospec/changes/[name]/backfill-draft.md` — the reviewed source draft to formalize
3. [DYNAMIC] Read `prospec/index.md` + `prospec/ai-knowledge/module-map.yaml` — map the draft's traced `file:line` to module names for `related_modules`
4. [DYNAMIC] Read `prospec/specs/features/` — align the candidate feature slug to an existing Feature Spec when one fits

## Entry Gate

> Blocking precondition check before this skill runs. If any item FAILs, stop and tell the user what is missing — do not produce the scaffold.

- `.prospec/changes/[name]/backfill-draft.md` exists and is route-compatible (`**Feature:**`/`**Story:**` headers + User Story + Acceptance Criteria candidates).
- The draft has **no unresolved `[NEEDS CLARIFICATION]`** — promotion is a record of *confirmed* behavior; an unresolved marker means the user-review gate (`/prospec-backfill-spec` Phase 5) is incomplete. FAIL → send the user back to resolve it; never carry it into the scaffold.
- The candidate feature slug is confirmed and passes `isSafeResourceName` (reject separators / `..`).

## Core Workflow

> The draft is already fidelity-checked (every AC backed by `file:line`, no fabricated intent, no uncounted facts — `/prospec-backfill-spec` guarantees this). Promotion **reshapes** that material into the forward-path artifacts; it does not re-derive behavior and **adds no claim the draft did not already ground**.

### Phase 1: Validate and route the draft

Confirm the Entry Gate held. Cluster the draft's stories under the confirmed feature slug; align to an existing `prospec/specs/features/{slug}.md` when one fits. Map each story's traced `file:line` to module names via `prospec/ai-knowledge/module-map.yaml` — this set becomes `related_modules` (archive's backfill module-derivation source; it must be non-empty).

> **Phase 1 Gate** — proceed when:
> - [ ] Entry Gate satisfied; feature slug confirmed + `isSafeResourceName`-valid
> - [ ] every story's traced `file:line` mapped to ≥1 module → `related_modules` set (non-empty)

### Phase 2: proposal.md

Write `proposal.md` per `references/proposal-format.md`: each draft story → an INVEST User Story (As a / I want / So that + WHEN/THEN Acceptance Scenarios from the draft's AC). Carry the draft's *So that* / role verbatim — they were confirmed at review. Edge Cases and FR/SC trace to the draft's behaviors. (`/prospec-archive` Phase 3.5 graduates the Feature Spec from this proposal + the delta-spec below.)

### Phase 3: delta-spec.md

Write `delta-spec.md` per `references/delta-spec-format.md`: each draft AC candidate → a REQ under `## ADDED` with `**Feature:**` (the confirmed slug) and `**Story:**` routing. Keep the feature-first REQ-id (`REQ-{FEATURE-SLUG}-NNN`) — archive routes by `**Feature:**` and derives modules from `related_modules`/feature-map, so the REQ-id need not be module-based. Every AC keeps its `file:line` citation so `/prospec-verify` can re-confirm fidelity.

### Phase 4: metadata.yaml

Write `.prospec/changes/[name]/metadata.yaml` with: `name`, `scale: backfill`, `status: implemented` (brownfield code pre-exists — this is backfill's lifecycle entry point; no earlier transition runs), `related_modules` (from Phase 1), and the change `description`. Serialize as data (the same path the change services use) so user-provided text is escaped by construction.

> **No `plan.md` and no `tasks.md`.** Backfill records existing code: there is no forward implementation to plan and no work to schedule, so producing them would be hollow make-work that exists only to satisfy a forward-path gate. `verify`/`review`/`archive` are scale-aware for `backfill` (Entry Gate requires only proposal + delta-spec; verify 1/5 task-completion is `not-applicable`). The draft's traced architecture/call-chain already lives in `backfill-draft.md` and the delta-spec AC `file:line` citations — it is not re-presented here.

> **Phase 4 Gate** — proceed when:
> - [ ] `metadata.yaml` written with `scale: backfill` + `status: implemented` + non-empty `related_modules`
> - [ ] only `proposal.md` + `delta-spec.md` (+ `metadata.yaml`) staged — no `plan.md`/`tasks.md`
> - [ ] nothing written under `prospec/specs/features/`

### Phase 5: Handoff

Present the produced scaffold and route the user to `/prospec-verify` — under `scale: backfill`, verify grades **spec-fidelity** (every REQ's `file:line` must resolve) and treats pre-existing code-quality gaps as informational tech debt, so a faithful draft reaches grade S/A → `verified` → archivable.

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / count) — no subjective adjectives.

### Success Criteria
- [ ] `proposal.md` + `delta-spec.md` written under `.prospec/changes/[name]/` (grep); **no `plan.md`/`tasks.md`** (backfill is a light scale)
- [ ] `metadata.yaml` has `scale: backfill`, `status: implemented`, and non-empty `related_modules` (grep)
- [ ] no `[NEEDS CLARIFICATION]` in any produced artifact (grep)
- [ ] nothing written under `prospec/specs/features/` (trust zone untouched)

### Failure Conditions
- produced a scaffold carrying an unresolved `[NEEDS CLARIFICATION]`
- wrote a hollow `plan.md`/`tasks.md`, or anything under `prospec/specs/features/`
- `related_modules` empty, or a REQ AC stripped of its `file:line` citation

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

## NEVER

- **NEVER** write under `prospec/specs/features/` — promotion only stages the change scaffold under `.prospec/changes/[name]/`; `archive.service.ts` stays the sole writer of the trust zone
- **NEVER** carry an unresolved `[NEEDS CLARIFICATION]` into the scaffold — a backfill change records *confirmed* behavior; send the user back to the draft's review gate instead
- **NEVER** add a behavior, count, or cross-module flow the draft did not already ground in `file:line` — promotion reshapes the fidelity-checked draft, it does not re-extract or fabricate
- **NEVER** leave `related_modules` empty — archive's backfill knowledge-sync derives affected modules from it; an empty set would silently pass the gate
- **NEVER** strip a REQ's `file:line` citation — `/prospec-verify` needs it to re-confirm spec-fidelity
- **NEVER** set `scale` to anything but `backfill`, or `status` to anything but `implemented` — promotion is the backfill lifecycle entry; other values misroute verify/archive

## Error Handling

| Scenario | Action |
|----------|--------|
| `backfill-draft.md` missing | Guide user to run `/prospec-backfill-spec` first (it stages the draft) |
| Unresolved `[NEEDS CLARIFICATION]` in the draft | STOP; send the user back to `/prospec-backfill-spec` Phase 5 to resolve before promoting |
| Candidate feature slug fails `isSafeResourceName` | Reject; ask the user to confirm a safe slug |
| No module resolves from the draft's `file:line` | STOP; `related_modules` cannot be empty — the draft's tracing is incomplete |

## Next-Step Handoff

After the Output Summary, recommend the next step in the SDD workflow order
(`story → plan → tasks → implement → review → verify → archive`, then periodic `learn`) — the
scaffold lands at `status: implemented`, so the next step is `/prospec-verify` (which grades
spec-fidelity under `scale: backfill`); read `metadata.yaml` status and
`prospec/ai-knowledge/_status-lifecycle.md`. Then ask **"Run `/prospec-verify` now? (Y/n)"**:
on **Y**, invoke it in this session; on **n**, stop and leave the suggestion — never auto-run without
the Y.
