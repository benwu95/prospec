# Autonomous Pipeline Cascading Protocol Reference

This document defines the **Autonomous Pipeline Cascading Protocol** used by `/prospec-ff` and cascading execution workflows.

---

## Purpose

To eliminate the biological tax and friction of manual dispatch across SDD lifecycle stations (`story → plan → tasks → implement → review → verify → knowledge-update → archive`), this protocol enables **Type III Autonomous Execution**:
- The AI Agent autonomously manages state transitions and progressive context loading across stations.
- Verifier results (Plan Verifier, Tasks Verifier, Review findings, Verify 5+1 audit) serve as deterministic machine gates for stage progression.
- The human developer transitions from a step-by-step dispatcher to a high-level strategic director and **Tastemaker** (responsible for initial intent and final delivery sign-off).

---

## Scale-Driven Cascading Paths

The cascading workflow dynamically adapts its trajectory based on `metadata.scale`:

### 1. Scale: Quick (`scale: quick`)
- **Trajectory**: `story → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Plan Bypass**: Skips `plan.md` and `delta-spec.md` by contract; moves directly from `proposal.md` to `tasks.md`.
- **Review/Verify Light Execution**: Evaluates against `proposal.md` acceptance scenarios; delta-spec compliance (2/5) is `not-applicable`.

### 2. Scale: Standard (`scale: standard` or unset)
- **Trajectory**: `story → plan → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Linear Progression**: Each station advances immediately upon meeting its entry and exit gates.

### 3. Scale: Full (`scale: full`)
- **Trajectory**: `story → plan (Tournament) → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Tournament Selection**: In Phase 4 of Plan, generates orthogonal candidate architectures and executes symmetric pairwise tournament evaluation before cascading into tasks.

---

## Per-Station Execution Loop

Every station — whether reached via `prospec status` or by autonomous cascading — runs the SAME loop. Never skip Step 1 on the assumption that context memory already holds the station's rules:

1. **Step 1 [LOAD]** — Read the station's `SKILL.md` (the skill `prospec status` names for the station you are entering) with your file-reading tool. Re-read it on every transition — a long session's accumulated diff and logs dilute the station's initial instructions.
2. **Step 2 [ENTRY]** — Check the station's Entry Gates; if any FAILs, stop and resolve it before acting.
3. **Step 3 [EXEC]** — Execute the station per its `SKILL.md` and the references it loads on demand.
4. **Step 4 [GATE]** — Run the station's machine verifiers. On FAIL, apply the Oscillation Breaker (see `circuit-breaker.md`) — never loop unbounded.
5. **Step 5 [NEXT]** — Run `prospec status` for the next station, then return to Step 1.

---

## Station Transition Gates

An autonomous transition to the next station occurs **only** when all preconditions for the current station are satisfied:

| Current Station | Next Station | Transition Gate |
|-----------------|--------------|-----------------|
| **story** | `plan` (or `tasks` for quick) | `proposal.md` written with `## Stated Assumptions`; INVEST advisory check completed. |
| **plan** | `tasks` | Architecture Verifier PASS on five orthogonal dimensions (or documented Break-Glass override). |
| **tasks** | `implement` | Task Contract Verifier PASS (bidirectional coverage, DAG layering, TDD closure). |
| **implement** | `review` | 100% of code tasks checked off; `prospec change status implemented` executed. |
| **review** | `verify` | 0 unresolved critical findings; tests pass; review baseline stamped via `prospec check --record-review`. |
| **verify** | `knowledge-update` | Quality Grade **S** or **A** achieved (`status: verified`). |
| **knowledge-update** | `awaiting_signoff` | Affected module READMEs, `index.md`, and `module-map.yaml` synced incrementally. |
| **awaiting_signoff** | `archive` | Human sign-off granted and atomic feature commit created. |

---

## Tastemaker Presentation & Human Gate

When the pipeline completes Knowledge Update following Verify Grade S/A, automated cascading **strictly halts**:

1. **Presentation Payload**: The Agent presents a structured Tastemaker summary:
   - **Verify Grade & Status**: S/A rating with verified timestamp.
   - **Delta-Spec Summary**: Brief overview of added/modified/removed requirements.
   - **Knowledge Sync Summary**: Confirmation of updated module READMEs.
   - **Git Diff Summary**: Clean summary of modified/added files.
2. **Strict Invariant**: The Agent **NEVER** automatically commits, pushes, or archives without explicit human approval.
3. **Sign-off Options for Developer**:
   - **Approve**: Proceed with git commit (`feat: ...`) and run `/prospec-archive`.
   - **Steer / Adjust**: Request additional changes or refinements.

---

## Human Escape Hatch

- Developers may pass `--no-cascade` or invoke individual station skills (e.g. `/prospec-plan`, `/prospec-review`) at any point to step manually.
- If execution is interrupted, running `prospec status` indicates the current node and suggested next step for seamless resumption.

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
