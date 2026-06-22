---
name: prospec-review
description: "Adversarial Code Review → Fix Loop - Between implement and verify, an independent fresh-context reviewer audits the whole change diff; verifier-confirmed criticals are auto-fixed, majors are proposed, and a spec-aware lens checks delta-spec/dependency-direction. Triggers: review, code review, adversarial review, find bugs, critical, 審查, 程式碼審查, 對抗式審查, 找 bug, 找問題"
---

# Prospec Review Skill

## Activation

When triggered, briefly describe:
- That an independent reviewer (fresh context) will audit the entire change diff between implement and verify
- That only verifier-confirmed criticals are auto-fixed; majors are proposed and passed to verify as WARN
- That the loop converges to zero unresolved critical or escalates to you at a hard cap — review never silently passes

## Startup Loading

1. [STABLE] Read `prospec/CONSTITUTION.md` — principles and dependency/layering rule
2. [STABLE] **MANDATORY** — Read [`references/review-format.md`](references/review-format.md) for the severity contract, review.md format, and reviewer lenses
3. [DYNAMIC] Read `.prospec/changes/[name]/tasks.md`, `plan.md`, `delta-spec.md`, `proposal.md` — the contract this change must honour
4. [DYNAMIC] Read `prospec/ai-knowledge/_conventions.md` + each affected module `README.md` — patterns and ripple effects
5. [DYNAMIC] Compute the change diff relative to the branch base (`git diff`), reviewing source + tests; exclude generated artifacts (`dist/`, lockfiles, deployed skills)

## Entry Gate

> Blocking precondition check before this skill runs. If any item FAILs, stop and tell the user what is missing — do not proceed.

- Implementation is done: metadata status is `implemented` and tasks.md **code-task** checkboxes are complete (unchecked `[M]`/`[V]` tasks do not block; kind schema: tasks-format reference); if still `tasks`, FAIL and point to `/prospec-implement`.
- Planning artifacts exist: proposal.md, plan.md, delta-spec.md, tasks.md. **Exception — `metadata.scale: quick`**: only proposal.md + tasks.md are required (a quick change legitimately has no plan/delta-spec); do not FAIL on their absence. **Exception — `metadata.scale: backfill`**: only proposal.md + delta-spec.md are required (a backfill change records existing code — no forward plan/tasks); do not FAIL on their absence.
- Prior unresolved WARN: read `metadata.yaml` `quality_log` and surface any unresolved WARN from earlier stages.

## Core Workflow

### Reviewer Modes

- **B — single reviewer, multi-lens (default)**: one fresh-context reviewer covers every must-run lens in a single pass. Token-friendly; independence from the implementer is already satisfied.
- **A — parallel lenses (opt-in)**: N independent lens agents run concurrently. Use for large or high-risk diffs, or Scale=Full. Higher first-round cost buys maximum inter-lens independence.

### Review Lenses

Must-run every round:
- **correctness & edge cases**
- **security & data integrity**
- **spec-architecture** — the prospec differentiator, always layered on regardless of reviewer engine: implementation vs `delta-spec` REQ intent, dependency direction `cli → services → lib → types`, module conventions, and unhandled ripple effects.
  - **Quick degradation** (`metadata.scale: quick`): the delta-spec REQ comparison is `not-applicable` (there is no delta-spec — never report it as PASS); dependency direction, module conventions, and ripple checks still run in full. Additionally, when the diff appears to touch behavior covered by existing `prospec/specs/features/` REQs, raise an early warning — the `/prospec-archive` Entry Gate re-checks this, but catching it at review is cheaper.

Conditional: **security & data integrity** (untrusted input, auth, external integrations), efficiency/performance (hot-path or data-layer changes), maintainability/DRY (new abstractions). When any conditional lens applies, load [`references/review-lenses-content.md`](references/review-lenses-content.md) **on demand** for its concrete, severity-pre-mapped criteria (OWASP/IDOR/SSRF/injection/secrets; N+1/CWV/blocking I/O; DRY/complexity/Rule-of-N) — severity vocabulary stays defined in `review-format.md`, the lens-content reference only maps onto it. This reference is on-demand only — it is NOT a Startup Loading item. A pluggable language-specific engine may add further language lenses; the spec-architecture lens is always added by prospec and is never replaced by the vendored lens criteria.

### Severity Routing

Apply `references/review-format.md`. In short: **critical** blocks the loop and is auto-fixed; **major** does not block (proposed, passed to verify as WARN, never counted in verify's grade); **nit** is dropped.

### The Loop

1. Spawn the reviewer (mode B or A) over the change diff. The reviewer reads whole functions/classes and greps ripple, not just diff hunks.
2. For each reported **critical**, spawn an **independent verifier** to confirm the issue's **existence** — it Reads the code and cites Evidence, marking `[confirmed]` / `[not-found]`. Only confirmed criticals with a concrete, local, drop-in fix are auto-fixed; architectural, large-refactor, or ambiguous fixes are **escalated to the human**, not auto-applied.
3. Apply each fix to the **working tree** (no commit), then **re-run `pnpm test`**; the suite must stay green — if a fix turns a test red, roll that fix back and re-decide, never proceed on red.
4. Re-review (mode B narrow pass) to confirm criticals are resolved with no regression, until **0 unresolved critical** (review-clean).
5. **Hard cap**: 3 rounds (maximum 5). **Early-stop** if a round resolves 0 new criticals or reverts a previously-applied fix.
6. **Escalation**: at the cap or early-stop with unresolved criticals, stop and hand the list of unresolved criticals plus attempted fixes to the human for decision — never silently pass.

### Harness Degradation

If the execution harness cannot spawn an independent sub-agent, **offer a choice** — use the harness's own reviewer command, or fall back to a single-pass fresh-context review — and say so explicitly. Never silently skip review.

### Persistence

Write findings to `.prospec/changes/[name]/review.md`: a cumulative table (`location | severity | lens | status`), deduplicated by Location with severity taken as the maximum, carried forward across rounds as the anchor so resolved items are not re-raised and verdicts stay consistent. Confirmed cross-change recurring criticals may be flagged for promotion (feeds the feedback-promotion pipeline).

## Output Contract

> After running, self-assess and emit a concise Output Summary. Every Success Criterion must be objectively checkable (file existence / grep / test result / count) — no subjective adjectives.

### Success Criteria
- [ ] no unresolved critical (loop converged, or escalated to the human with the list)
- [ ] every fix round left `pnpm test` green
- [ ] `review.md` written with the findings table
- [ ] every auto-fixed critical was verifier-confirmed before the fix (manual)

### Failure Conditions
- a critical auto-fixed without an existence-verification step
- tests left red, or the loop exceeded the hard cap without escalating

### Output Summary
Emit one line: `Met N/M | Unmet: <items> | Overall: PASS|WARN|FAIL | Next: <one-line>`

### Exit Gate (Constitution)

Verify the output against the Constitution. When rules carry RFC-2119 severity (BL-031), grade by weight — MUST→FAIL, SHOULD→WARN, MAY→informational (the grade vocabulary stays PASS/WARN/FAIL). A free-text Constitution falls back to judgment-based grading. Record this review's unresolved **major** findings (and any FAIL) to `metadata.yaml` `quality_log` (`skill: prospec-review` / `date` / `result` / `warnings`) so the next stage (`/prospec-verify`) surfaces them; majors are advisory and do not block. Then suggest `/prospec-verify`.

## NEVER

- **NEVER** auto-fix a critical that was not independently confirmed to exist — acting on a hallucinated finding edits correct code and erodes trust
- **NEVER** proceed to the next round with the test suite red — a fix that breaks a test must be rolled back; silent green→red regression defeats the loop
- **NEVER** loop without a hard cap or silently pass unresolved criticals — unbounded retries waste tokens; unresolved criticals must escalate to the human
- **NEVER** auto-apply an architectural or large-refactor fix — only concrete, local, drop-in fixes are safe to apply unattended; the rest are proposed
- **NEVER** count major findings in verify's grade — review and verify are separate axes; majors pass as advisory WARN, not as a grade penalty
- **NEVER** silently skip review when sub-agents are unavailable — offer a degraded path so the developer decides knowingly
- **NEVER** commit during review — the commit boundary is after `/prospec-verify` reaches S/A; review only edits the working tree

## Error Handling

| Scenario | Action |
|----------|--------|
| metadata status not `implemented` | Stop; point to `/prospec-implement` to finish tasks first |
| No change diff vs branch base | Report nothing to review; suggest proceeding to `/prospec-verify` |
| Sub-agent spawn unavailable | Offer the harness reviewer or single-pass fallback; do not skip |
| Fix repeatedly turns tests red | Roll back, mark the critical unresolved, escalate to the human |
| Reviewer and verify disagree on layering | Keep both — review catches it first, verify re-checks independently; no mutual exemption |

## Next-Step Handoff

After the Output Summary, recommend the next step in the SDD workflow order
(`story → plan → tasks → implement → review → verify → archive`, then periodic `learn`) — read
`metadata.yaml` status and `prospec/ai-knowledge/_status-lifecycle.md` (review and learn own no
status transition, so follow this order, not status alone). Then ask **"Run <next-step> now? (Y/n)"**:
on **Y**, invoke it in this session; on **n**, stop and leave the suggestion — never auto-run without
the Y. If the stage is terminal (`archived`), the linear flow is complete — point to periodic `/prospec-learn`
rather than a workflow successor. If the result does not advance (e.g. verify grade B/C/D), say so and
point to the corrective step instead of offering the next skill.
