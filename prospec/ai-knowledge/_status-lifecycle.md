# Change Status Lifecycle

> Canonical definition of the `status` field in a prospec change's `metadata.yaml`
> (`.prospec/changes/{name}/metadata.yaml`). All prospec skills MUST follow this — do not
> introduce statuses or transitions outside this file.

## States and transitions

```
story → plan → tasks → implemented → verified → archived
          ↑ skipped when metadata `scale: quick` (story → tasks)
  /prospec-promote-backfill ──────────↗ enters at implemented (metadata `scale: backfill`; brownfield code pre-exists)
```

| From | To | Owning skill | Gate / precondition |
|------|----|--------------|---------------------|
| — | `story` | `/prospec-new-story` (or `/prospec-ff`) | change scaffolding + `proposal.md` created |
| `story` | `plan` | `/prospec-plan` (or `/prospec-ff`) | `plan.md` + `delta-spec.md` created |
| `story` | `tasks` | `/prospec-ff` (or `/prospec-tasks`) | **quick path**: metadata `scale: quick` (user-confirmed) — no plan.md/delta-spec.md; spec & knowledge impact re-checked at the `/prospec-archive` Entry Gate |
| `plan` | `tasks` | `/prospec-tasks` (or `/prospec-ff`) | `tasks.md` created |
| — | `implemented` | `/prospec-promote-backfill` | **backfill path**: metadata `scale: backfill` — formalizes a reviewed `backfill-draft.md` into the light scaffold (proposal + delta-spec + metadata; **no plan/tasks** — records existing code); the brownfield code already exists, so it enters at `implemented` (no story/plan/tasks/implement transitions run) |
| `tasks` | `implemented` | `/prospec-implement` | all `tasks.md` **code-task** checkboxes complete (`[M]`/`[V]` kinds are reminders — see the tasks-format reference) |
| `implemented` | `verified` | `/prospec-verify` | grade **S or A** (no FAIL, ≤ 2 WARN) |
| `verified` | `archived` | `/prospec-archive` | only `verified` is archivable **and** affected-module Knowledge is synced (at the verify S/A commit prompt; archive Entry Gate re-confirms as backstop) |

## Gates (why some transitions are conditional)

- **`/prospec-ff`** fast-forwards `story → plan → tasks` in one pass (`scale: quick`: `story → tasks`, plan skipped) — it is planning-only and stops at `tasks`.
- **`/prospec-implement`** sets `implemented` only when every `tasks.md` **code-task** checkbox is done (unchecked `[M]`/`[V]` tasks are reminders, not blockers) — this distinguishes "implemented, awaiting verify" from "tasks planned".
- **`/prospec-verify`** sets `verified` ONLY at grade S/A. Grade B/C/D leaves `status` unchanged (stays `implemented`); fix the WARN/FAIL items and re-run.
- **`/prospec-archive`** archives ONLY `verified` changes; any earlier status is refused (verify to S/A first). Its Entry Gate is the **backstop** that re-confirms affected-module Knowledge is synced (the prevention is the verify S/A commit prompt) and still refuses to archive until affected-module READMEs reflect the change — then archive sets `archived`.
- **`/prospec-promote-backfill`** is the **backfill entry point**: it formalizes a reviewed `backfill-draft.md` into the light scaffold (proposal + delta-spec + metadata — `backfill` is a light scale like `quick`, with no plan/tasks) and sets `status: implemented` directly (the brownfield code already exists — there is nothing to story/plan/tasks/implement). Under metadata `scale: backfill`, `/prospec-verify` grades **spec-fidelity** (every delta-spec REQ's `file:line` must resolve) and records pre-existing code-quality gaps as informational tech debt, and `/prospec-archive` derives affected modules from `metadata.related_modules`/`**Feature:**`→feature-map (feature-slug REQ IDs do not map to modules by prefix).

## What each gate checks (artifact ownership)

Different derived artifacts have different rightful update times — the gates are scoped accordingly:

- **AI Knowledge** (module READMEs) tracks the current code; updated by `/prospec-knowledge-update` at any point. `/prospec-verify` grades only **pre-existing Knowledge ↔ code drift**; lag behind the change being verified is not a grade input (informational only). The knowledge-sync **prevention point is the `/prospec-verify` S/A commit prompt**: S/A is the last gate that can require code changes, so syncing there — folded into the feature commit — is not re-staled by later fixes, and a source-only commit therefore does not flip `knowledge-health` stale. The `/prospec-archive` Entry Gate is the **backstop**: it re-confirms the sync and still refuses to archive until affected-module READMEs reflect the change's final state (defense in depth — the sync is moved earlier, not removed).
- **Feature Specs** (`specs/features/`) describe *graduated* (shipped/archived) capabilities. They are updated **only** by `/prospec-archive` (Phase 3.5 graduation). A Feature Spec that does not yet reflect an un-archived change is the normal pre-archive state — so `/prospec-verify` **does NOT gate on Feature Spec freshness**; the spec graduates when the change archives. This keeps verify (gate) and archive (the sole Feature Spec writer) from forming a deadlock.

## Rules

- The skill that owns a transition MUST update `metadata.yaml` `status` when it completes its phase.
- No skill may skip ahead (e.g. `tasks → verified` without `implemented`, or archiving a non-`verified` change). The only legal skip is `story → tasks` under a user-confirmed `scale: quick`. Separately, `/prospec-promote-backfill` is a lifecycle **entry** (not a skip): it enters at `implemented` under metadata `scale: backfill` (the brownfield code it records already exists).
- These six are the only valid statuses. Adding one requires updating this file **and** every consuming skill. (`scale: backfill` is a metadata **scale** value, not a new status — it routes verify/archive, like `scale: quick`.)
