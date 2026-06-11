# Change Status Lifecycle

> Canonical definition of the `status` field in a prospec change's `metadata.yaml`
> (`.prospec/changes/{name}/metadata.yaml`). All prospec skills MUST follow this — do not
> introduce statuses or transitions outside this file.

## States and transitions

```
story → plan → tasks → implemented → verified → archived
          ↑ skipped when metadata `scale: quick` (story → tasks)
```

| From | To | Owning skill | Gate / precondition |
|------|----|--------------|---------------------|
| — | `story` | `/prospec-new-story` (or `/prospec-ff`) | change scaffolding + `proposal.md` created |
| `story` | `plan` | `/prospec-plan` (or `/prospec-ff`) | `plan.md` + `delta-spec.md` created |
| `story` | `tasks` | `/prospec-ff` (or `/prospec-tasks`) | **quick path**: metadata `scale: quick` (user-confirmed) — no plan.md/delta-spec.md; spec & knowledge impact re-checked at the `/prospec-archive` Entry Gate |
| `plan` | `tasks` | `/prospec-tasks` (or `/prospec-ff`) | `tasks.md` created |
| `tasks` | `implemented` | `/prospec-implement` | all `tasks.md` **code-task** checkboxes complete (`[M]`/`[V]` kinds are reminders — see the tasks-format reference) |
| `implemented` | `verified` | `/prospec-verify` | grade **S or A** (no FAIL, ≤ 2 WARN) |
| `verified` | `archived` | `/prospec-archive` | only `verified` is archivable **and** affected-module Knowledge is synced (archive Entry Gate) |

## Gates (why some transitions are conditional)

- **`/prospec-ff`** fast-forwards `story → plan → tasks` in one pass (`scale: quick`: `story → tasks`, plan skipped) — it is planning-only and stops at `tasks`.
- **`/prospec-implement`** sets `implemented` only when every `tasks.md` **code-task** checkbox is done (unchecked `[M]`/`[V]` tasks are reminders, not blockers) — this distinguishes "implemented, awaiting verify" from "tasks planned".
- **`/prospec-verify`** sets `verified` ONLY at grade S/A. Grade B/C/D leaves `status` unchanged (stays `implemented`); fix the WARN/FAIL items and re-run.
- **`/prospec-archive`** archives ONLY `verified` changes; any earlier status is refused (verify to S/A first). Its Entry Gate additionally requires affected-module Knowledge to be synced — the lifecycle's single mandatory knowledge-sync checkpoint — then archive sets `archived`.

## What each gate checks (artifact ownership)

Different derived artifacts have different rightful update times — the gates are scoped accordingly:

- **AI Knowledge** (module READMEs) tracks the current code; updated by `/prospec-knowledge-update` at any point. `/prospec-verify` grades only **pre-existing Knowledge ↔ code drift**; lag behind the change being verified is the normal pre-archive state, reported as informational only — by design, since fixes after verify (review fixes, FAIL remediation) would re-stale any earlier sync. The **single mandatory knowledge-sync checkpoint is the `/prospec-archive` Entry Gate**, which checks the change's final state and refuses to archive until affected-module READMEs reflect it.
- **Feature Specs** (`specs/features/`) describe *graduated* (shipped/archived) capabilities. They are updated **only** by `/prospec-archive` (Phase 3.5 graduation). A Feature Spec that does not yet reflect an un-archived change is the normal pre-archive state — so `/prospec-verify` **does NOT gate on Feature Spec freshness**; the spec graduates when the change archives. This keeps verify (gate) and archive (the sole Feature Spec writer) from forming a deadlock.

## Rules

- The skill that owns a transition MUST update `metadata.yaml` `status` when it completes its phase.
- No skill may skip ahead (e.g. `tasks → verified` without `implemented`, or archiving a non-`verified` change). The only legal skip is `story → tasks` under a user-confirmed `scale: quick`.
- These six are the only valid statuses. Adding one requires updating this file **and** every consuming skill.
