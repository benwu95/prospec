# Review Format Reference

This document defines the **severity contract** (review's Output Contract), the `review.md` persistence format, and the reviewer lenses used by the **prospec-review** Skill.

---

## Purpose

`prospec-review` runs an adversarial, fresh-context review of a change diff between implement and verify. This reference fixes *what counts as which severity*, *what gets auto-fixed*, and *how findings are recorded* — so the loop is reproducible across runs and reviewers.

---

## Severity Criteria

Three levels only — the same PASS/WARN/FAIL-family vocabulary used across prospec (no fourth state).

### critical — blocks the loop, auto-fixed (when drop-in)

A finding is critical only if it is one of:

1. **Real defect**: not fixing it causes a genuine bug, security hole, data loss, or production incident. (Do not inflate criticals — speculative or "could theoretically" risks are not critical.)
2. **Dependency-direction violation**: an import or call that breaks the project's declared dependency direction — from its Constitution / `_conventions.md` (never upward).
3. **Spec contradiction**: the implementation logically contradicts a `delta-spec` REQ's stated intent.
4. **Single-source bypass on an autonomous or write path**: the change re-implements a guard, normalizer, or writer that the project's knowledge base documents as the single source (or that an existing service already provides), AND the duplicate sits on an autonomous or write path — *autonomous*: executed without a human in the loop (a scheduled, CI, hook, or agent-driven job); *write path*: code that creates or mutates an artifact, record, or configuration — both conditions required; a duplicate off those paths stays major (DRY). This two-condition definition lives here only — the plan rubric and the lens reference cite it by name.

> REQ *completeness* ("this REQ is only partially covered") is **not** a review critical — it is left to `/prospec-verify` dimension 1–2. Review checks correctness and spec-*contradiction*, not coverage.

### major — does not block, proposed, passed to verify as WARN

- **Performance** and **maintainability** concerns. Recorded and handed to `/prospec-verify` as an advisory WARN (via `quality_log`); **not counted in verify's grade** — review and verify stay on separate axes. Never auto-fixed.

### nit — dropped, not reported

- Style, naming, formatting, speculative risk, or anything already handled. Dropped silently to keep signal density high.

---

## Auto-Fix Boundary

Only a critical that is **confirmed to exist** — by running its `repro` and reading the cited code, with an independent verifier's `[confirmed]` verdict — **and** has a **concrete, local, drop-in** fix is auto-applied to the working tree. A `critical` therefore always carries a `repro`: the confirmation is an execution, not a reading of relayed prose. A critical whose fix is **architectural, a large refactor, or ambiguous** is **escalated to the human** with the analysis — never auto-applied. Every applied fix is followed by a full test re-run; a fix that turns a test red is rolled back.

---

## review.md Format

Persisted at `.prospec/changes/{name}/review.md`, cumulative across rounds. The table is
**CLI-written**: emit each round's findings as JSON and run `prospec review merge --findings <file>`
— never hand-edit the table. Canonical shape the CLI renders:

```markdown
# Review Findings: {change-name}

| ID | Location | Severity | Lens | Status | Summary | Repro |
|---|---|---|---|---|---|---|
| F-1 | src/lib/foo.ts:42 | critical | spec-architecture | fixed | off-by-one in loop bound | pnpm vitest run tests/unit/lib/foo.test.ts -t 'bound' |
| F-2 | src/services/bar.ts:88 | major | maintainability | proposed | duplicated matcher |  |

<!-- prospec:evidence-section -->
## Evidence

<!-- prospec:evidence F-1 -->
### F-1

read foo.ts:38-46 — the `<=` bound overruns when n === len.
<!-- prospec:evidence-end -->
<!-- prospec:evidence-section-end -->
```

- **Two surfaces carry the finding's evidence half.** `Repro` is a table column — one command, so it
  rides the same `\|` escaping the table already round-trips exactly. The prose lives in the
  marker-anchored `## Evidence` section below, keyed by finding `id`. Both are cumulative across
  rounds: a round that re-reports a finding without them keeps what the artifact holds, because a fix
  round reports a status and must not erase the reason the finding existed. A round with no evidence
  writes no section at all. The two markers delimit a CLI-owned region — a sentence of your own (the artifact-language summary a clean round must carry) goes BELOW the closing marker, and the merge puts it back on every write. The relayed-field ceilings, the `repro` forms and the payload contract
  behind all of this are in [`delegated-evidence-format.md`](delegated-evidence-format.md) — this
  document does not restate the numbers, so there is one set of them.

- **Summary and evidence prose follow the artifact language** the Constitution's Language Policy
  assigns to `.prospec/changes/**` — the same rule the change's other artifacts obey. Keep file paths,
  identifiers, API names, the `Repro` command, and the Severity/Lens/Status enums in English; write
  the Summary sentence and the evidence in the artifact language. (The CLI is language-agnostic:
  whatever the findings JSON carries is what lands in the artifact.)
- **A claim of mutation verification must name the mutations.** When a finding's Summary asserts
  that an assertion was (or was not) mutation-verified, it states each mutation applied and whether
  that mutation turned the test red. This governs the reviewer's own output, not the change: an
  unnamed mutation set is indistinguishable from none, and the recurring failure is not skipped
  verification but mutations chosen by whoever wrote the assertion — naming them is what makes the
  choice auditable by the next reader.
- **Identity is the reviewer-supplied `id`** — reuse the prior round's id for a finding you judge to
  be the same one (line numbers drift as fixes land, so the CLI never infers identity from the
  Location string). An id no existing row carries **opens a new row**, even when a row already sits
  at that Location and lens; the one exception is a row carrying no id at all — the pre-ids
  hand-written shape, which a new id adopts. Omitting the id keys the finding by location+lens
  against the rows that **predate this round** — each claimable once, in table order, and never a
  row you name by id elsewhere in the same round. Withholding an id costs cross-round tracking,
  never the finding's own row, so **two id-less findings you file at one Location in one round stay
  two rows**.
- The CLI's deterministic bookkeeping: merge by identity, **severity taken as the maximum**, rows
  **carried forward** across rounds as the anchor (resolved items are not re-raised), prose around
  the table preserved.
- Round counting and convergence stay the skill's narration; the structured round counts come from
  the merge command's report (`criticals_found` / `criticals_fixed` / `majors`).

---

## Reviewer Lenses

| Lens | When | Looks for |
|------|------|-----------|
| correctness & edge cases | always | logic errors, boundary conditions, error paths |
| security & data integrity | always | injection, auth gaps, unsafe writes, data loss |
| **spec-architecture** | always (prospec) | vs `delta-spec` REQ intent, dependency direction, module conventions, ripple effects |
| efficiency / performance | hot-path or data-layer change | N+1, needless allocation, blocking I/O |
| maintainability / DRY | new abstractions introduced, or an existing helper / guard / writer re-implemented | duplication, leaky abstraction, dead branches, documented single-source bypass |

A pluggable language-specific engine may add language lenses; the **spec-architecture** lens is always layered on by prospec — it is what a generic code-review tool cannot provide.

---

## Reference Information

- Project name: `prospec`
- Severity vocabulary: critical / major / nit (PASS/WARN/FAIL family — no fourth state)
- Constitution file: `prospec/CONSTITUTION.md`
