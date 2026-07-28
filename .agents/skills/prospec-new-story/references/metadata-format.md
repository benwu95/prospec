# Metadata (metadata.yaml) Format Reference

This document defines the **serialization format** for a change's `metadata.yaml`
(`.prospec/changes/{name}/metadata.yaml`). It exists so every skill that creates or
appends to `metadata.yaml` emits byte-consistent YAML instead of inventing field order,
quoting, or date format per invocation.

> **Scope: format only.** Field *semantics*, types, and optionality are defined by the
> `ChangeMetadataSchema` in `src/types/change.ts`; `status` values and their transitions
> by `prospec/ai-knowledge/_status-lifecycle.md`; the required-field floor is enforced by
> the `metadata-completeness` drift check (`prospec check`). This reference does **not**
> restate any of them — it governs how the data is written to disk. When in doubt about a
> value's meaning, read those sources; when in doubt about how to lay it out, read this.

---

## Serialization conventions

- **Block style**, 2-space indent — never flow/inline maps or sequences for the top-level
  fields. Arrays are block sequences (`- item` on their own lines).
- **Key order is canonical and fixed** (see below) — write keys in this order; do not reorder
  to match how you happened to gather the data.
- **Minimal quoting** — quote a scalar only when YAML requires it (leading special char,
  a value that would otherwise parse as a non-string, an embedded `:` + space). Do not
  wrap plain prose or dates in quotes by habit; do not use `>-`/`|` block scalars for a
  one-line `description`.
- **No Markdown inside values** — `related_modules` entries are bare module names
  (`- lib`), never `- "**lib**"`; descriptions are plain text.
- **`created_at` is a full ISO 8601 timestamp** (`2026-07-13T09:51:00.000Z`), matching the
  CLI path's `new Date().toISOString()` in `change-story.service.ts` — not a bare `YYYY-MM-DD`.
- **No document markers** (`---`/`...`) and exactly one trailing newline.

This is exactly what `stringifyYaml` (the `yaml` library, default options) emits, so the
skill-authored file and the CLI-authored file (`prospec change story`) converge.

## Canonical field order

`name` → `created_at` → `status` → `scale` → `related_modules` → `description` →
`quality_log` → `review_provenance` → `test_provenance` → `introduced_by`

| Field | Required | Written by | Notes |
|-------|----------|-----------|-------|
| `name` | yes | new-story / ff (create) | change dir name (kebab-case) |
| `created_at` | yes | new-story / ff (create) | full ISO 8601 |
| `status` | yes | every stage that owns a transition | one of the lifecycle values (`_status-lifecycle.md`) |
| `scale` | no (defaults `standard`) | new-story / ff, after user-confirmed assessment | one of the schema's `CHANGE_SCALES` values |
| `related_modules` | no | new-story / ff | bare module names |
| `description` | no | new-story / ff | one line, plain text |
| `quality_log` | no | new-story, ff, plan, tasks, review, verify, learn (append) | gate trail — see below |
| `review_provenance` | no | `prospec check --record-review` at review | machine-written baseline |
| `test_provenance` | no | `prospec check --record-tests` at verify | machine-written test baseline — see below |
| `introduced_by` | no | new-story (bug-fix changes only) | escaped-defect registration |

### `test_provenance` — the recorded test run

```yaml
test_provenance:
  command: pnpm test              # the command as run (argv, no shell syntax)
  exit_code: 0                    # recorded even when non-zero — a failing suite IS the fact
  digest: 3f9c…                   # code fingerprint the run exercised
  date: 2026-07-28                # bare ISO 8601 date
```

Written by the CLI, never by hand: it is what makes `/prospec-verify` 5/5 a machine verdict rather
than a self-report. The `test-provenance` drift check fails when this block is absent, when its
`digest` no longer matches the code, or when `exit_code` is non-zero. It is deliberately **not** part
of the `metadata-completeness` required-field floor — requiring it would retroactively fail every
change archived before the field existed.

## `quality_log` entry shape

Each station appends one entry. Fixed keys `skill` / `date` / `result` / `warnings`, plus
optional structured keys that only certain stations write:

```yaml
quality_log:
  - skill: prospec-review          # the station name
    date: 2026-07-13               # bare ISO 8601 date
    result: WARN                   # gate three-state ONLY: PASS | WARN | FAIL
    warnings:
      - "one finding per array item"
    criticals_found: 0             # review only (optional)
    criticals_fixed: 0             # review only (optional)
    majors: 1                      # review only (optional)
  - skill: prospec-verify
    date: 2026-07-13
    result: PASS                   # still the gate three-state
    warnings: []
    grade: S                       # verify quality grade goes HERE, never in `result`
    dimensions:                    # verify only (optional)
      - name: task-completion
        result: PASS
        adjudicator: machine       # who decided: machine | judgment
      - name: tests
        result: PASS
        adjudicator: machine
      - name: delta-spec-compliance
        result: WARN
        adjudicator: judgment
```

- **`result` is always the gate three-state `PASS` / `WARN` / `FAIL`.** The `/prospec-verify`
  quality grade (`S`/`A`/`B`/`C`/`D`) is written to the separate `grade` key and is **never in
  `result`** — `result: A` is malformed.
- **A `dimensions` entry's `result` has a wider vocabulary than the gate's**: `PASS` / `WARN` /
  `FAIL` / `not-applicable` / `not-adjudicated`. Any dimension that does not apply to the change is
  recorded `not-applicable` — never omitted and never `PASS`, so an unchecked dimension stays
  distinguishable from a passed one. This covers every skip reason, not just scale: no delta-spec
  under `quick`, no tasks.md under `backfill`, the design dimension under `ui_scope: none`, and the
  knowledge dimension when no Knowledge base exists. `not-adjudicated` is the **different** case
  where the dimension applies but its machine adjudicator could not run (drift engine unavailable, or
  its check `skipped`) — "no verdict", not "moot". Both are valid **only** here, never as the
  entry-level `result`.
- **`adjudicator`** (optional, verify only) records who decided the dimension: `machine` for the
  engine-adjudicated ones (task completion, knowledge, tests) and `judgment` for the ones a
  fresh-context reviewer grades. Absent on entries written before the field existed.
- `warnings` is always present (use `[]` when none); each entry is one string.
- Omit the optional keys entirely when they do not apply — do not write them as `null`/empty.

## Canonical example (a standard change mid-lifecycle)

```yaml
name: add-widget-export
created_at: 2026-07-13T09:51:00.000Z
status: tasks
scale: standard
related_modules:
  - services
  - tests
description: Add CSV export to the widget service
quality_log:
  - skill: prospec-ff
    date: 2026-07-13
    result: PASS
    warnings: []
```

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Schema authority: `src/types/change.ts` · Status authority: `prospec/ai-knowledge/_status-lifecycle.md`
