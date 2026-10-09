# Autonomous Pipeline Cascading Protocol Reference

This document defines the **Autonomous Pipeline Cascading Protocol** used by `prospec-ff` and cascading execution workflows.

---

## Scale-Driven Cascading Paths

The cascading workflow dynamically adapts its trajectory based on `metadata.scale`:

### 1. Scale: Quick (`scale: quick`)
- **Trajectory**: `story → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Plan Bypass**: Skips `plan.md` and `delta-spec.md` by contract; moves directly from `proposal.md` to `tasks.md`.
- **Review/Verify Light Execution**: Evaluates against `proposal.md` acceptance scenarios; delta-spec compliance (2/5) is `not-applicable`.

### 2. Scale: Standard (`scale: standard` or unset)
- **Trajectory**: `story → plan → [plan sign-off, when paused] → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Linear Progression**: Each station advances immediately upon meeting its entry and exit gates.

### 3. Scale: Full (`scale: full`)
- **Trajectory**: `story → plan (candidates + metrics) → [plan sign-off, when paused] → tasks → implement → review → verify → knowledge-update → Tastemaker Sign-off`
- **Candidate Selection**: In Phase 4 of Plan, generates orthogonal candidate architectures, measures them with `prospec validate candidates`, and selects in-session. Without the pause the cascade continues into tasks and NEVER asks the human to choose.

### 4. Scale: Backfill (`scale: backfill`)
- **Trajectory**: `promote → review → verify → knowledge-update → Tastemaker Sign-off`
- **Entry, not a skip**: `prospec-promote-backfill` formalizes a reviewed `backfill-draft.md` and lands at `implemented`; plan and tasks are forbidden by contract, and `prospec status` never routes a backfill to them.

On standard and full, the plan sign-off pause (by default for a verified `ai-proposed` Premise, or via `workflow.pause_at: [plan]`; `PROSPEC_PAUSE_AT` decides alone per run, empty or `none` = no pause) has `prospec status` hold the change for a human plan sign-off — NEVER set `PROSPEC_PAUSE_AT` to skip it without an explicit human instruction.

A UI change (`proposal.md` `ui_scope` full/partial) inserts `design` between `plan` and `tasks` on the standard/full trajectory. Every next station above is what `prospec status` computes — the cascade consults it at each Step 5 [NEXT] and never keeps a route table of its own.

---

## Per-Station Execution Loop

Every station — whether reached via `prospec status` or by autonomous cascading — runs the SAME loop:

1. **Step 1 [LOAD]** — Run `prospec status`, then load the station it names: invoke — or re-invoke — its `prospec-<name>` Skill through this host's own skill mechanism, and read the fallback file it prints when that mechanism is unavailable — on every transition and re-entry, never from memory. If neither route yields the instructions, stop and name what is missing.
2. **Step 2 [ENTRY]** — Check the station's Entry Gates; if any FAILs, stop and resolve it before acting.
3. **Step 3 [EXEC]** — Execute the station per its `SKILL.md` and the references it loads on demand; loading a station never means its references arrived.
4. **Step 4 [GATE]** — Run the station's machine verifiers. On FAIL, apply the Oscillation Breaker (stop if state flips FAIL → PASS → FAIL ≥ 2) — never loop unbounded.
5. **Step 5 [NEXT]** — Run `prospec status` for the next station. `code: ESCALATE_TO_HUMAN`, HALT immediately and emit the CLI-produced `EscalationReport` with persisted lifetime ordinal, trigger and reasons; do NOT return to Step 1. `code: AWAITING_HUMAN_PLAN_SIGNOFF`: HALT; present scale-specific plan sign-off material, no `EscalationReport` (not a failure); resume Step 1 after human sign-off. `code: KNOWLEDGE_INPUT_INVALID`: HALT; present the named invalid knowledge-sync input, no `EscalationReport`; resume Step 1 after repair. Otherwise, return to Step 1.

---

## Station Transition Gates

An autonomous transition to the next station occurs **only** when all preconditions for the current station are satisfied:

| Current Station | Next Station | Transition Gate |
|-----------------|--------------|-----------------|
| **story** | `plan` — or `tasks` (`scale: quick`), or `promote` (`scale: backfill`) | `proposal.md` written with `## Stated Assumptions`; INVEST advisory check completed (recorded, never blocking). |
| **plan** | `design` (proposal `ui_scope` full/partial) — otherwise `tasks` | Architecture Verifier PASS (or advisory WARN) on five orthogonal dimensions, recorded via `prospec change log --skill prospec-plan --verifier-report <file>` (a Break-Glass grant alone never satisfies the verifier gate); a recorded FLAWS keeps `prospec status` on plan until a later PASS/WARN; under the plan sign-off pause the change also needs a human sign-off that counts for its current plan. |
| **design** | `tasks` | `design-spec.md` + `interaction-spec.md` produced. |
| **tasks** | `implement` | Task Contract Verifier PASS (or advisory WARN) on bidirectional coverage, DAG layering and TDD closure, recorded via `prospec change log --skill prospec-tasks --verifier-report <file>`; a recorded FLAWS keeps `prospec status` on tasks until a later PASS/WARN. |
| **promote** | `review` | Promotion scaffold complete (`prospec validate promote-scaffold`) and `status: implemented` set — the backfill entry. |
| **implement** | `review` | 100% of code tasks checked off; `prospec change status implemented` executed. |
| **review** | `verify` | 0 unresolved critical findings; tests pass; review baseline stamped via `prospec check --record-review`. |
| **verify** | `knowledge-update` — or `archive` when affected-module Knowledge is already synced — or back to `verify` | Quality Grade **S** or **A** achieved (`status: verified`); a B/C/D grade — even after an earlier S/A — is routed back to verify by `prospec status`, never to archive. |
| **knowledge-update** | `archive` (after Tastemaker sign-off and the human commit) | Knowledge/count/generated assets synced; final evidence matches resulting inputs — when the sync changed inputs, the provenance gates send the change through review and verify again before sign-off. |

---

## Tastemaker Presentation & Human Gate

Prepare final inputs before reaching this boundary:

- **Sync affected-module Knowledge**: Run `prospec-knowledge-update` into the feature commit for the modules `prospec knowledge update --change` reports as created or README-pending ∪ `metadata.related_modules` ∪ the modules a working-tree diff attributes through the module map (generated artifacts included) (`scale: backfill`: the modules `prospec knowledge update --change` reports ∪ `metadata.related_modules`, minting nothing). Update descriptions only without citing ungraduated REQs. Stamp freshness via `prospec knowledge verify <modules...>`.
- **Re-derive factual counts**: If the project has a factual count generator, run it to synchronize documentation counts; otherwise re-derive from source.

When the pipeline completes final Verification with Grade S/A, reaching this boundary marks the **single commit point** for the change:

1. **Commit Boundary & Confirmation (S/A only)**:
   - **Confirm validated inputs**: Confirm Knowledge sync, freshness stamps and factual counts already belong to the validated inputs. If preparation is incomplete, return to the preparation above, then obtain final review/tests/verify again before presenting S/A.
   - **Final evidence order**: sync → final review → tests → verify → equivalent commit. If synchronization changed effective inputs, return to final review/tests/verify after sync; present only the resulting S/A. Existing current records need no rerun merely because staging, commit, amend or equivalent history changed.
2. **Tastemaker Presentation Payload**: Present a structured delivery summary for the human Tastemaker:
   - **Verify Grade & Status**: S/A rating with verified timestamp.
   - **Delta-Spec Summary**: Overview of added/modified/removed requirements.
   - **Knowledge Sync Summary**: Confirmation of updated module READMEs and stamped freshness.
   - **Git Diff Summary**: Clean summary of modified/added files.
   - **Audited Deviations & Limitations**: Disclose any unadjudicated requirements, baseline limitations, or deviation findings with their `verify.md` anchors, rather than submerging them in an aggregate PASS.
3. **Strict Invariant — Human Commit Prompt**:
   - The Agent **NEVER** automatically commits, pushes, or archives without explicit human approval.
   - Prompt the user to commit the change as a single atomic-by-feature commit folding implement, review, and verify fixes plus knowledge sync together (`feat: <description>`).
   - After the commit lands and before pushing, re-run the project's knowledge-sync mechanical gate if declared. Before re-verifying, inspect `knowledge-health`; if accurate Knowledge needs reconfirmation, stamp the modules and validate the changed inputs again. Commit equivalence preserves content evidence, while Knowledge freshness is assessed separately.
4. **Sign-off Options for Developer** (the final delivery sign-off; the plan sign-off is a separate Step 5 loop-exit):
   - **Approve**: Run the git commit command and advance to `prospec-archive`.
   - **Steer / Adjust**: Request additional changes, refinements, or re-verification.

**Presenting a human decision**: for each viable option, state its concrete reversal cost — what is redone if it proves wrong now, and after implementation. Cite the rule or evidence behind the recommendation, and give the strongest non-recommended option the condition under which it would be right. Draw on the gate's existing material rather than restating whole reports. A decision the human already stated is not asked again, and nothing here adds a question where the station decides autonomously.

---

## Human Escape Hatch

- Developers may pass `--no-cascade` or invoke individual station skills (e.g. `prospec-plan`, `prospec-review`) at any point to step manually.
- If execution is interrupted, running `prospec status` indicates the current node and suggested next step for seamless resumption.

## Escalation Decision (CLI-Owned)

- Present CLI trigger/lifetime ordinal/exits/recommendation; stop.
- Only human `Manual override: <reason>` composed WARN grants one event/station attempt; observations/report warnings grant none. Replay consumes none; resolution expires grants; tests independent.
- Re-scope keeps amendment gates/status, no unlock. After PASS retain history/adjacent prose/fences.

### Abandon an attempt

Run `prospec change abandon <name> --reason <text>`; retain `.prospec/abandoned/`. `--overturned <field>`: disproved leaves. Save work → move → terminal metadata; inspect partial failures. Every scale: retry `retry_difference`.

Report preservedFileCount (manifest entries, no gitlink pins); work tree not restored. Ask human: keep or restore via preservation/version control. Restore only with explicit authorization; reuse prior decision.
