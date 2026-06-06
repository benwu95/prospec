# Change Status Lifecycle

> Canonical definition of the `status` field in a prospec change's `metadata.yaml`
> (`.prospec/changes/{name}/metadata.yaml`). All prospec skills MUST follow this — do not
> introduce statuses or transitions outside this file.

## States and transitions

```
story → plan → tasks → implemented → verified → archived
```

| From | To | Owning skill | Gate / precondition |
|------|----|--------------|---------------------|
| — | `story` | `/prospec-new-story` (or `/prospec-ff`) | change scaffolding + `proposal.md` created |
| `story` | `plan` | `/prospec-plan` (or `/prospec-ff`) | `plan.md` + `delta-spec.md` created |
| `plan` | `tasks` | `/prospec-tasks` (or `/prospec-ff`) | `tasks.md` created |
| `tasks` | `implemented` | `/prospec-implement` | all `tasks.md` checkboxes complete |
| `implemented` | `verified` | `/prospec-verify` | grade **S or A** (no FAIL, ≤ 2 WARN) |
| `verified` | `archived` | `/prospec-archive` | only `verified` is archivable |

## Gates (why some transitions are conditional)

- **`/prospec-ff`** fast-forwards `story → plan → tasks` in one pass — it is planning-only and stops at `tasks`.
- **`/prospec-implement`** sets `implemented` only when every `tasks.md` checkbox is done — this distinguishes "implemented, awaiting verify" from "tasks planned".
- **`/prospec-verify`** sets `verified` ONLY at grade S/A. Grade B/C/D leaves `status` unchanged (stays `implemented`); fix the WARN/FAIL items and re-run.
- **`/prospec-archive`** archives ONLY `verified` changes; any earlier status is refused (verify to S/A first), then archive sets `archived`.

## What each gate checks (artifact ownership)

Different derived artifacts have different rightful update times — the gates are scoped accordingly:

- **AI Knowledge** (module READMEs) tracks the current code; updated by `/prospec-knowledge-update` any time before verify. `/prospec-verify` gates on **Knowledge ↔ code** consistency.
- **Feature Specs** (`specs/features/`) describe *graduated* (shipped/archived) capabilities. They are updated **only** by `/prospec-archive` (Phase 3.5 graduation). A Feature Spec that does not yet reflect an un-archived change is the normal pre-archive state — so `/prospec-verify` **does NOT gate on Feature Spec freshness**; the spec graduates when the change archives. This keeps verify (gate) and archive (the sole Feature Spec writer) from forming a deadlock.

## Rules

- The skill that owns a transition MUST update `metadata.yaml` `status` when it completes its phase.
- No skill may skip ahead (e.g. `tasks → verified` without `implemented`, or archiving a non-`verified` change).
- These six are the only valid statuses. Adding one requires updating this file **and** every consuming skill.
