---
name: prospec-ff
description: "Fast-Forward Planning - Generate complete planning artifacts in one pass (Story → Plan → Tasks). Triggers: fast-forward, ff, all at once, quick plan, 快速規劃, 一次完成, 一次到位, 快轉"
---

# Prospec Fast-Forward Skill

## Activation

When triggered, briefly describe:
- That you'll generate all planning artifacts in one pass (Story → Plan → Tasks)
- A quick 3-question interview will be conducted first
- The metadata status will progress through story → plan → tasks (`scale: quick` skips plan: story → tasks)

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] Read `prospec/CONSTITUTION.md` — prepare Constitution check
2. [STABLE] **MANDATORY** — Load these format references (bundled with this skill):
   - [`references/proposal-format.md`](references/proposal-format.md)
   - [`references/plan-format.md`](references/plan-format.md) + [`references/delta-spec-format.md`](references/delta-spec-format.md)
   - [`references/tasks-format.md`](references/tasks-format.md)
3. [DYNAMIC] Read `prospec/ai-knowledge/_index.md` — identify related modules

## What Makes FF Unique

FF is not just "run three Skills sequentially." Its expert knowledge lies in:

1. **Chained derivation**: Output of each phase automatically feeds the next — no manual handoff needed
2. **Status lifecycle management**: metadata.yaml status progresses `story → plan → tasks` in sequence (`scale: quick`: `story → tasks`, plan skipped)
3. **Error recovery**: When any phase fails, preserve completed parts and offer recovery options
4. **Quick interview**: Only 3 core questions (goal, role, acceptance criteria) — no deep exploration

## Entry Gate

> Blocking precondition check before this skill runs. If any item FAILs, stop and tell the user what is missing — do not proceed.

- Constitution exists and is non-empty (ff runs the full story→plan→tasks chain).
- ff starts a new change — no prior `quality_log` to read on first run.

## Core Workflow

> Phases are numbered from 1 (no Phase 0).

### Phase 1: Quick Interview (3 questions to converge)

Collect: Core goal (one sentence), primary user, key acceptance criteria (3-5 points).
Derive kebab-case change name, confirm before proceeding.

> **Phase 1 Gate** — proceed when:
> - [ ] change name (kebab-case) confirmed
> - [ ] core goal, primary user, and 3-5 ACs collected

### Phase 2: Story Generation

| Step | Action |
|------|--------|
| Scaffold | Create `.prospec/changes/[name]/` + `metadata.yaml`(status: story) + `proposal.md` |
| Scale | Run the complexity assessment from `/prospec-new-story` Phase 3.5 (criteria table + quick veto); user confirms; write `metadata.scale`. Quick → slim proposal form |
| Populate | Write User Story and ACs per proposal-format.md |
| Check | Constitution check (3 most relevant principles) → PASS continue / FAIL pause |

**Scale routing:** when `scale: quick` is confirmed, SKIP Phase 3 entirely — no plan.md, no
delta-spec.md, and no module README loading (Phase 3's Layer 2 step; `_index.md` from Startup
Loading is still read). Status advances `story → tasks` directly
(a legal quick-path transition; see `prospec/ai-knowledge/_status-lifecycle.md`). The
`/prospec-archive` Entry Gate later re-checks spec and knowledge impact against the actual diff.

> **Phase 2 Gate** — proceed when:
> - [ ] `proposal.md` + `metadata.yaml`(status: story) created
> - [ ] `metadata.scale` confirmed by user and written
> - [ ] Constitution check passed (pause on FAIL)

### Phase 3: Plan Generation (skipped when `scale: quick`)

| Step | Action |
|------|--------|
| Knowledge | Layer 1 (_index.md) → Layer 2 (related module READMEs + any `{sub-module}.md` they link) |
| Scaffold | Create `plan.md` + `delta-spec.md`, update status → `plan` |
| Populate | Write per plan-format.md and delta-spec-format.md |
| Check | Constitution check → PASS continue / FAIL pause |

> **Phase 3 Gate** — proceed when:
> - [ ] (standard/full) `plan.md` + `delta-spec.md` created, status → `plan`
> - [ ] (quick) phase marked skipped per `scale: quick` — no plan artifacts produced

### Phase 4: Tasks Generation

| Step | Action |
|------|--------|
| Scaffold | Create `tasks.md`, update status → `tasks` |
| Populate | Decompose by architecture layer per tasks-format.md |
| Check | Test coverage check → PASS complete / WARN supplement |

### Completion: Summary Report

List all produced files, task statistics, suggest `/prospec-implement` as next step.

## Error Recovery

| Failed Phase | Preserved | Recovery Options |
|-------------|-----------|-----------------|
| Story fails | Change directory | Retry / switch to `/prospec-new-story` |
| Plan fails | proposal.md | Retry / switch to `/prospec-plan` |
| Tasks fails | proposal.md (+ plan.md + delta-spec.md for standard/full) | Retry / switch to `/prospec-tasks` |
| Severe Constitution violation | All parts completed before failure | Pause FF, switch to single-phase Skill |

## When to Use vs. Not to Use

| Suitable for FF | Not suitable for FF |
|----------------|-------------------|
| Requirements clear, well-explored | Requirements vague, need discussion |
| Similar feature done before | Major architectural changes |
| Independent scope, low risk | Uncertain tech choices |
| Tight schedule | First time with project |

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] proposal and tasks produced; plan produced unless `scale: quick` (quick: plan.md/delta-spec.md absent by contract)
- [ ] each stage's own Output Contract is satisfied (manual)

### Failure Conditions
- any stage artifact missing or failing its Output Contract (quick: plan artifacts are not missing — they are skipped by contract)

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

### Exit Gate (Constitution)

Verify the output against the Constitution. When rules carry RFC-2119 severity (BL-031), grade by weight — MUST→FAIL, SHOULD→WARN, MAY→informational (the grade vocabulary stays PASS/WARN/FAIL). A free-text Constitution falls back to judgment-based grading. Record each WARN/FAIL to `metadata.yaml` `quality_log` (`skill` / `date` / `result` / `warnings`). Advisory — surface issues, do not hard-block.

## NEVER

- **NEVER** use FF when requirements are vague — guide user to `/prospec-explore` first
- **NEVER** skip Constitution check at any phase — every phase must be checked
- **NEVER** ask more than 3 questions in Phase 1 — FF prioritizes speed, use `/prospec-explore` for depth
- **NEVER** inline full format prose into this skill body — load this skill's `references/` files (proposal / plan / delta-spec / tasks formats) directly
- **NEVER** skip metadata.yaml status progression — story → plan → tasks, or story → tasks only when `scale: quick`
- **NEVER** discard completed phases on failure — error recovery is FF's core capability
- **NEVER** skip Layer 2 knowledge loading for standard/full — Plan phase must load related module AI Knowledge (quick skips Plan and loads none)
- **NEVER** skip Phase 3 without a user-confirmed `scale: quick` in metadata.yaml — skipping plan is an explicit contract, not a shortcut

## Error Handling

| Scenario | Action |
|----------|--------|
| Constitution severe violation at any phase | Pause FF, preserve completed parts, switch to single-phase Skill |
| User changes requirements mid-flow | Restart from Phase 1 with new requirements |
| Module Knowledge insufficient | Proceed with available info, note gaps in plan.md Risk Assessment |
