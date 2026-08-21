# Metadata (metadata.yaml) Format Reference

This document is a **reader's guide** to a change's `metadata.yaml`
(`.prospec/changes/{name}/metadata.yaml`). The file is **CLI-written, skill-read** (issue
#107): every mutation goes through a `prospec` command — `change story` (create),
`change scale`, `change auto-draft` (create), `change status`, `change log` (quality_log append), `verify record`,
`check --record-review` / `--record-tests`, `archive` — so skills never hand-serialize it.
What follows documents the shape those commands emit, so a skill reading the file (or
composing structured CLI input) knows what each field means.

> **Scope: format only.** Field *semantics*, types, and optionality are defined by the
> `ChangeMetadataSchema` (owned by the prospec CLI); `status` values and their transitions
> by `prospec/ai-knowledge/_status-lifecycle.md`; the required-field floor is enforced by
> the `metadata-completeness` drift check (`prospec check`). This reference does **not**
> restate any of them. When in doubt about a value's meaning, read those sources.

---

## Serialization conventions (what the CLI emits)

- **Block style**, 2-space indent; arrays are block sequences (`- item` on their own lines).
- **Key order is canonical and fixed** (see below).
- **Minimal quoting** — a scalar is quoted only when YAML requires it; user text is
  serialized as data, so escaping is by construction.
- **No Markdown inside values** — `related_modules` entries are bare module names
  (`- lib`), never `- "**lib**"`; descriptions are plain text.
- **`created_at` is a full ISO 8601 timestamp** (`2026-07-13T09:51:00.000Z`) — not a bare `YYYY-MM-DD`.
- **No document markers** (`---`/`...`) and exactly one trailing newline.

This is what `stringifyYaml` (the `yaml` library, default options) emits. A skill that
finds itself about to WRITE this shape by hand has taken a wrong turn — run the owning
`prospec` command instead.

## Canonical field order

`name` → `created_at` → `status` → `scale` → `related_modules` → `description` →
`quality_log` → `review_provenance` → `test_provenance` → `introduced_by` → `issue`

| Field | Required | Written by | Notes |
|-------|----------|-----------|-------|
| `name` | yes | `prospec change story` (create) | change dir name (kebab-case) |
| `created_at` | yes | `prospec change story` (create) | full ISO 8601 |
| `status` | yes | `prospec change plan/tasks/status` + `verify record` (S/A) + `archive` | one of the lifecycle values (`_status-lifecycle.md`), forward-only |
| `scale` | no (defaults `standard`) | `prospec change scale`, after user-confirmed assessment; also `change auto-draft` at create time, from the drift check that triggered it | one of the schema's `CHANGE_SCALES` values |
| `related_modules` | no | `prospec change story` (auto-match or `--related-module`); `change auto-draft` writes the module it attributed, or nothing | bare module names |
| `description` | no | `prospec change story --description` | one line, plain text |
| `quality_log` | no | `prospec change log` (any station) + `verify record` (append) | gate trail — see below |
| `review_provenance` | no | `prospec check --record-review` at review | machine-written baseline |
| `test_provenance` | no | `prospec check --record-tests` at verify | machine-written test baseline — see below |
| `introduced_by` | no | `prospec change story --introduced-by` (bug-fix changes only) | escaped-defect registration |
| `issue` | no | `prospec change story --issue`, `prospec change auto-draft --issue` | external-tracker registration — see below |

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

### `issue` — the external-tracker registration

```yaml
issue: "#412"                     # quoted: unquoted, `#` opens a YAML comment
```

The tracker item this change belongs to, written once at scaffold time
(`prospec change story --issue <ref>`). **Shape-free — its format is never validated**: prospec binds to no
forge, so a bare reference (`#412`), a full URL, and another tracker's id (`ABC-123`) are equally
valid, its shape is never judged, and nothing checks that the item exists or is still open. No API
is called. Three consequences worth knowing:

- **A value opening with `#` is emitted quoted** — it would otherwise read back as a YAML comment and
  the whole value would vanish. The serializer handles this; do not add quotes by hand.
- **Absent means unregistered.** A change that names no tracker item carries no `issue` key at all —
  never an empty string, never `null` — so "not registered" stays distinguishable from "registered as
  blank". A blank or whitespace-only value reads as unregistered, not as a registration.
- **Runs of whitespace collapse to one space**, line breaks included — the one way the value is
  normalized, and it is a safety measure, not a shape judgement. The reference is printed by
  `prospec status` and by the archive summary that is copied into the committed spec-history trail,
  where a second line would render a forged `##` heading or a forged `- **Quality Grade**:` row for
  real. Same defence the pipe-table and code-span writers apply to free-form text.

Like `introduced_by`, this is a **registration convention only**: outside the required-field floor
(no pre-existing change turns red for lacking it) and enforced by no drift check. And it is
deliberately not `introduced_by`, which names the *change* whose gates let a defect through — this
names the *external item* the change belongs to. Whether a project registers one at all, how its
tracker items map to changes, and how a merge closes them are that project's own conventions,
documented in its contributor docs; this field only makes the link machine-readable.
`prospec status` and the archive summary print it when present.

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
issue: "#412"
```

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Schema authority: the prospec CLI's `ChangeMetadataSchema` · Status authority: `prospec/ai-knowledge/_status-lifecycle.md`
