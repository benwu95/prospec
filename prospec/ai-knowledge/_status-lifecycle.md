# Change Status Lifecycle

> Canonical definition of the `status` field in a prospec change's `metadata.yaml`
> (`.prospec/changes/{name}/metadata.yaml`). All prospec skills MUST follow this — do not
> introduce statuses or transitions outside this file.
>
> **Executable copy**: `prospec status` computes current/next station and blocking gates from these rules.

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
| `implemented` | `verified` | `/prospec-verify` | grade **S or A** (no FAIL, ≤ 2 WARN); machine dimensions adjudicated by `prospec check` |
| `verified` | `archived` | `/prospec-archive` | only `verified` is archivable **and** affected-module Knowledge is synced (at the verify S/A commit prompt; archive Entry Gate re-confirms as backstop) |

## Station order

The stations `prospec status` routes between, in canonical order. Wider than the six statuses: `design` and `promote` own no status transition of their own — design sits between plan and tasks (only when `proposal.md` declares `ui_scope` full/partial), and `promote` is the backfill entry that lands at `implemented`. `SDD_STATIONS` in `types/status.ts` is the **executable copy**, pinned against this line by a contract test.

`story → plan → design → tasks → promote → implement → review → verify → archive`

(The periodic `/prospec-learn` is not a linear station and is absent from this order.)

## Light-scale artifact matrix

Which artifacts each scale's contract forbids. `SCALE_FORBIDDEN_ARTIFACTS` in `types/change.ts` is the **executable copy**: `prospec change plan` / `prospec change tasks` refuse from it before writing anything, and a contract test pins this table against it in both directions — so the table and the registry cannot disagree. That a station actually honours a given row is proven by that station's own tests, not by this table.

| Scale | Forbidden artifacts | Why |
|-------|---------------------|-----|
| `quick` | `plan.md`, `delta-spec.md` | plan is skipped by contract; impact is re-checked at the archive Entry Gate |
| `standard` | — | the full forward path applies |
| `full` | — | the full forward path applies |
| `backfill` | `plan.md`, `tasks.md` | records existing code — nothing to plan, no work to schedule |

## Gates (why some transitions are conditional)

- **`/prospec-ff`** fast-forwards `story → plan → tasks` in one pass (`scale: quick`: `story → tasks`, plan skipped) — it is planning-only and stops at `tasks`.
- **`/prospec-implement`** sets `implemented` only when every `tasks.md` **code-task** checkbox is done (unchecked `[M]`/`[V]` tasks are reminders, not blockers) — this distinguishes "implemented, awaiting verify" from "tasks planned".
- **`/prospec-verify`** sets `verified` ONLY at grade S/A. Grade B/C/D leaves `status` unchanged — status never regresses, so an already-`verified` change re-entering after a post-verify edit stays `verified`. `status` does not record the new grade, but `metadata-completeness` does: for a `verified` change it reads only the LATEST `/prospec-verify` entry, so a B/C/D re-verify turns it red until a fresh S/A is earned (an `archived` change keeps the any-entry reading, so stable history cannot flip). The report and that check, not the status, say the change is not archivable. Fix the WARN/FAIL items and re-run until S/A. Its machine dimensions are adjudicated by `prospec check` (verdicts adopted verbatim), its judgment dimensions in fresh context; an unavailable engine yields `not-adjudicated` (S unreachable, A attainable). Division of labour: verify's Key Difference section.
- **`/prospec-archive`** archives ONLY `verified` changes; any earlier status is refused (verify to S/A first). Its Entry Gate is the **backstop** that re-confirms affected-module Knowledge is synced (the prevention is the verify S/A commit prompt) and still refuses to archive until affected-module READMEs reflect the change; it also refuses on any of the three provenance checks FAILing (see Provenance audit scope) — then archive sets `archived`.
- **`/prospec-promote-backfill`** is the **backfill entry point**: it formalizes a reviewed `backfill-draft.md` into the light scaffold (proposal + delta-spec + metadata — `backfill` is a light scale like `quick`, with no plan/tasks) and sets `status: implemented` directly (the brownfield code already exists — there is nothing to story/plan/tasks/implement). Under metadata `scale: backfill`, `/prospec-verify` grades **spec-fidelity** (every delta-spec REQ's `file:line` must resolve) and records pre-existing code-quality gaps as informational tech debt, and `/prospec-archive` derives affected modules from `metadata.related_modules`/`**Feature:**`→feature-map (feature-slug REQ IDs do not map to modules by prefix). A backfill change that has **not yet reached `implemented`** has an unfinished promotion: `prospec status` routes it to the `promote` station (`/prospec-promote-backfill`), never to plan or tasks — both refuse that scale.

## Stations without a status transition

Some workflow stations participate in the SDD order but own **no** `status` transition — they operate on the working tree and leave `status` to the stations above. Resume logic must place them by workflow order, not by `status`:

- **`/prospec-design`** — engages **only when `proposal.md` has `ui_scope != none`**; sits **between `plan` and `tasks`** (it consumes the proposal/plan and produces `design-spec.md`/`interaction-spec.md` for tasks to decompose). For a backend/CLI change (`ui_scope: none`) it does not run at all, and `/prospec-verify`'s design dimension (6) is `not-applicable` — the lifecycle is identical to a change that never invoked design. Under `scale: quick` the router does not suggest design (quick skips `plan`); run `/prospec-design` manually.
- **`/prospec-review`** — sits **between `implemented` and `verified`** (adversarial review before verify — division of labour: verify's Key Difference); records `review_provenance` but does not change `status`. It also re-runs **after** `verified` when a post-verify edit staled that baseline — owning no status, it needs no transition to be re-enterable, and its Entry Gate status item is a floor.
- **`/prospec-learn`** — periodic; promotes lessons, owns no `status`.

## What each gate checks (artifact ownership)

Different derived artifacts have different rightful update times — gates are scoped accordingly:

- **AI Knowledge** (module READMEs) tracks current code; updated by `/prospec-knowledge-update` anytime. `/prospec-verify` grades only **pre-existing Knowledge ↔ code drift** (lag behind the change under verification is informational). Knowledge-sync's **prevention point is the `/prospec-verify` S/A commit prompt** — folded into the feature commit, so a later source-only commit doesn't flip `knowledge-health` stale; the `/prospec-archive` Entry Gate is the **backstop** that still refuses to archive until affected-module READMEs reflect the change's final state.
- **Feature Specs** (`specs/features/`) describe *graduated* capabilities, updated **only** by `/prospec-archive` (Phase 3.5 graduation). A spec not yet reflecting an un-archived change is the normal pre-archive state — so `/prospec-verify` **does NOT gate on Feature Spec freshness**, keeping verify (gate) and archive (sole spec writer) from deadlocking.

## Provenance audit scope

Which statuses `review-provenance`, `test-provenance` and `delta-spec-provenance` audit. `PROVENANCE_AUDITED_STATUSES` in `types/change.ts` is the **executable copy**, pinned against this table both ways; all three gates read that one registry, so none can cover a window the others do not.

| Status | Audited | Why |
|--------|---------|-----|
| `story` | No | review is not due — no baseline to be stale against |
| `plan` | No | as above |
| `tasks` | No | as above |
| `implemented` | Yes | review and the test run precede verify |
| `verified` | Yes | S/A ends neither the audit nor the need to re-review — code edited afterwards would graduate requirements no review saw |
| `archived` | No | unreachable rather than exempt: the bundle has left `.prospec/changes/`, so no collector enumerates it |

HEAD is in the digest, so the verify S/A feature commit itself stales both baselines — an honest red. Re-record **after** committing (`--record-review`, then `--record-tests`), then archive.

## Escaped-defect registration (`introduced_by`)

A bug-fix change MAY name the earlier change whose gates let the defect through, making
per-gate escaped-defect rate trackable (the only ground-truth accuracy signal) — `prospec check
--escaped-defects` aggregates it across `.prospec/changes/` and `.prospec/archive/`. In `metadata.yaml`:

```yaml
introduced_by: <change-name>   # the change whose gates missed this defect
```

- **Value**: the offending change's directory name (a plain string) — e.g. `introduced_by: fix-init-clobber-add-upgrade`. The aggregator resolves it against both ledgers, dated archive directories included; an unresolved or ambiguous name is reported, never dropped.
- **Optional, convention-only**: absent on non-bug-fix changes; the schema neither requires it nor verifies the referenced change exists (a registration convention, not a referential-integrity check).
- **When to set it**: once the offending change is identified — at `/prospec-new-story`, or back-filled onto the bug-fix change's metadata.

## Rules

- The skill that owns a transition MUST update `metadata.yaml` `status` when it completes its phase.
- No skill may skip ahead (e.g. `tasks → verified` without `implemented`, or archiving a non-`verified` change). The only legal skip is `story → tasks` under a user-confirmed `scale: quick`. Separately, `/prospec-promote-backfill` is a lifecycle **entry** (not a skip): it enters at `implemented` under metadata `scale: backfill` (the brownfield code it records already exists).
- These six are the only valid statuses. Adding one requires updating this file **and** every consuming skill. (`scale: backfill` is a metadata **scale** value, not a new status — it routes verify/archive, like `scale: quick`.)
