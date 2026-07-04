---
name: prospec-tasks
description: "Break Down Tasks - Decompose implementation plan into an actionable task checklist (tasks.md). Triggers: break down, tasks, task list, work items, how to split, 拆解, 任務, 任務清單, 工作項目, 如何拆分"
---

# Prospec Tasks Skill

## Activation

When triggered, briefly describe:
- That you'll read plan.md and delta-spec.md to understand the implementation scope
- Tasks will be organized by architecture layer (Types → Lib → Services → CLI → Tests)
- Each task will have complexity estimates and parallelization markers

## Language Policy

Write generated documents in the language defined by the Constitution's Language Policy rule. Keep code, identifiers, technical terms, and git commit messages in English.
## Startup Loading

1. [STABLE] Read `prospec/CONSTITUTION.md` — prepare test coverage check
2. [STABLE] **MANDATORY** — Read [`references/tasks-format.md`](references/tasks-format.md) for tasks.md format
3. [DYNAMIC] Read `.prospec/changes/[name]/plan.md` — parse implementation steps
4. [DYNAMIC] Read `.prospec/changes/[name]/delta-spec.md` — parse file changes and specifications
5. [DYNAMIC] Read `.prospec/changes/[name]/design-spec.md` (if exists) — identify UI components for task decomposition
6. [DYNAMIC] Read related module `README.md` from `prospec/ai-knowledge/modules/` (and any `{sub-module}.md` it links) — confirm architecture layers and dependency directions for task ordering

## Entry Gate

> Blocking precondition check before this skill runs. If any item FAILs, stop and tell the user what is missing — do not proceed.

- plan.md and delta-spec.md exist. **Exception — `metadata.scale: quick`**: only proposal.md is required (a quick change legitimately has no plan/delta-spec); decompose directly from proposal.md and advance status `story → tasks` (the legal quick transition — see `prospec/ai-knowledge/_status-lifecycle.md`).
- Prior unresolved WARN: read `metadata.yaml` `quality_log` and surface any unresolved WARN from earlier stages.

## Core Workflow

### Phase 1: Parse Planning Documents

Auto-identify current change, read plan.md and delta-spec.md, summarize implementation phases, file changes, and spec count.

> **Phase 1 Gate** — proceed when:
> - [ ] current change name resolved and plan.md + delta-spec.md (or proposal.md for `scale: quick`) read
> - [ ] implementation phases, file changes, and spec/REQ count summarized

### Phase 2: Create Scaffolding

| Scenario | Action |
|----------|--------|
| tasks.md doesn't exist | Create empty `tasks.md`, update `metadata.yaml` status → `tasks` |
| Already exists | Read and populate |

> **Phase 2 Gate** — proceed when:
> - [ ] `tasks.md` exists (created or read)
> - [ ] `metadata.yaml` status updated to `tasks`

### Phase 3: Decompose by Architecture Layer

Organize tasks following the layer order defined in `references/tasks-format.md`:

```
Types → Lib → Services → CLI → Tests
```

Each task format: `- [ ] [description] ~{lines} lines`. Add `[P]` marker for parallelizable tasks.

**Task kind tagging:** mark each non-code task with its kind — `[M]` (manual) or `[V]` (verification); leave code tasks unmarked. The kind schema is frozen in `references/tasks-format.md` (Task Kind Markers) — cite it, do not restate. Downstream, verify counts only code tasks in the completion rate and archive warns on unchecked tasks by kind.

**Decomposition principles:**
- Single responsibility: one task does one thing
- Verifiable: clear completion criteria
- Right-sized: ideal 15-25 tasks, each 20-100 lines
- Dependency direction: follow `cli → services → lib → types` order from `_conventions.md` — implement lower layers first

**UI task decomposition** (when design-spec.md exists):
- Reference specific component names from design-spec.md in each UI task description
- Annotate each UI task with: "Read precise design values from design tool via adapter MCP before implementing"
- This ensures the implement phase knows which components to look up and which MCP tools to use

> **Phase 3 Gate** — proceed when:
> - [ ] tasks written to `tasks.md`, grouped by architecture layer (Types → Lib → Services → CLI → Tests)
> - [ ] each task has a `~{lines} lines` estimate and non-code tasks carry `[M]`/`[V]` kind markers

### Phase 4: Mark Parallelization Opportunities

Identify tasks with no dependencies, mark with `[P]`. Independent tasks within the same layer are usually parallelizable.

> **Phase 4 Gate** — proceed when:
> - [ ] dependency-free tasks marked with `[P]` in `tasks.md`
> - [ ] no `[P]` marker placed on a task that depends on a lower layer

### Phase 5: Generate Summary

Add statistics at end of file: Total Tasks, Parallelizable Tasks, Total Estimated Lines.

> **Phase 5 Gate** — proceed when:
> - [ ] statistics block appended at end of `tasks.md` (Total Tasks, Parallelizable Tasks, Total Estimated Lines)
> - [ ] Total Tasks count reconciles with the checkboxes in the file

### Phase 6: Constitution Test Check (site-specific: TDD)

Check only this station's **site-specific** Constitution rule — **TDD / test coverage** — NOT a generic multi-principle scan (the full every-principle audit is `/prospec-verify` V3/5 only). Ensure each new/modified module has corresponding test tasks. If coverage is insufficient, add test tasks or raise a warning.

> **Phase 6 Gate** — proceed when:
> - [ ] every new/modified module has a corresponding test task in `tasks.md`
> - [ ] any test-coverage gap is resolved by added test tasks or a recorded warning

### Phase 7: Knowledge Quality Gate

Before finalizing, verify task decomposition against Knowledge:

| Check Item | PASS | WARN |
|------------|------|------|
| Architecture layers confirmed | Layer order matches module dependency graph | Layer order assumed without README verification |
| File paths verified | All task file paths exist or are clearly new | Some paths uncertain |
| Test tasks included | Every new/modified module has test tasks | Some modules missing test coverage |

WARN items do not block — add clarification notes to affected tasks.

> **Phase 7 Gate** — proceed when:
> - [ ] each Knowledge Quality Gate check item graded PASS or WARN
> - [ ] every WARN item has a clarification note added to the affected task

### Phase 8: Summary + Next Steps

Suggest: `/prospec-implement` or manual review.

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] tasks cover every delta-spec REQ (quick: every proposal acceptance scenario — no delta-spec by contract)
- [ ] tasks grouped by architecture layer
- [ ] each task has a ~lines estimate
- [ ] every new/modified module has a test task

### Failure Conditions
- no plan.md present (does not apply to `scale: quick`)
- > 30 tasks, or a modified module has no test task

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

### Exit Gate (Constitution)

Verify the output against this skill's **site-specific** Constitution rule (**TDD / test coverage**) — not the full Constitution; the every-principle audit is `/prospec-verify` V3/5 only. When the rule carries RFC-2119 severity (BL-031), grade by weight — MUST→FAIL, SHOULD→WARN, MAY→informational (the grade vocabulary stays PASS/WARN/FAIL). A free-text Constitution falls back to judgment-based grading. Record each WARN/FAIL to `metadata.yaml` `quality_log` (`skill` / `date` / `result` / `warnings`). Advisory — surface issues, do not hard-block.

## NEVER

- **NEVER** produce more than 30 tasks — indicates Story scope creep; large task lists overwhelm AI context and lose coherence
- **NEVER** create overly fine-grained tasks (<10 lines) — micro-tasks inflate task count and add checkbox overhead without meaningful progress tracking
- **NEVER** create overly coarse tasks (>200 lines) — unverifiable; if a 200-line task fails, the entire block must be debugged and reworked
- **NEVER** forget to update metadata.yaml status to `tasks` — downstream Skills check status to determine workflow stage (full lifecycle: `prospec/ai-knowledge/_status-lifecycle.md`)
- **NEVER** start decomposition without plan.md — tasks without architecture context produce random file edits instead of layered implementation (`scale: quick` is the exception: decompose from proposal.md, there is no plan by contract)
- **NEVER** skip test tasks — Constitution requires test coverage; untested modules are deployment blockers in Verify phase
- **NEVER** forget to mark `[P]` — Implement Skill uses this to suggest parallel developer assignment; missing markers force sequential execution
- **NEVER** use S/M/L complexity markers — `~{lines} lines` provides actionable estimates for progress tracking and commit sizing

## Error Handling

| Scenario | Action |
|----------|--------|
| plan.md not found | `scale: quick`: expected — decompose from proposal.md. Otherwise guide user to run `/prospec-plan` first |
| Task count exceeds 30 | Suggest splitting the Story or merging fine-grained tasks |
| Insufficient test coverage | Offer options: add test tasks / document test debt |

## Next-Step Handoff

After the Output Summary, recommend the next step in the SDD workflow order
(`story → plan → tasks → implement → review → verify → archive`, then periodic `learn`) — read
`metadata.yaml` status and `prospec/ai-knowledge/_status-lifecycle.md` (review and learn own no
status transition, so follow this order, not status alone). Then ask **"Run <next-step> now? (Y/n)"**:
on **Y**, invoke it in this session; on **n**, stop and leave the suggestion — never auto-run without
the Y. If the stage is terminal (`archived`), the linear flow is complete — point to periodic `/prospec-learn`
rather than a workflow successor. If the result does not advance (e.g. verify grade B/C/D), say so and
point to the corrective step instead of offering the next skill.
