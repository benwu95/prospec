# Drift Report (prospec-report.json) Format Reference

This document describes the **shape of `prospec-report.json`** — the machine-readable
output of the deterministic, zero-LLM drift engine. It exists so skills that consume the
report (`/prospec-verify`, `/prospec-learn`) read the right fields instead of hand-writing
field paths that drift from the schema.

> **Scope: shape only.** The authoritative schema is the prospec CLI's `DriftReportSchema`
> (Zod). The `structural.knowledge_health` field is a **frozen
> contract** consumed downstream (Knowledge Flywheel, MCP server) — changing it is a breaking
> change. When in doubt about a field's type or optionality, read that schema; this reference
> only maps where each fact lives.

---

## How the report is produced

`prospec check --json` **writes** the report to `prospec-report.json` in the project root. The
`--json` flag does **not** print JSON to stdout — stdout shows the human-readable formatted
summary (per-check `PASS`/`WARN`/`FAIL`/`SKIP` lines, a `Findings:` block when any exist, a
coverage line when `knowledge_health` is present, and a one-line summary), never JSON. **To read
structured facts, open the `prospec-report.json` file**, not stdout. The CLI is a required file (every skill probes it and STOPs when it is
missing or older than the floor), so "no report" is never a state to work around: run
`prospec check --json` and never fabricate a report.

## Top-level shape

```jsonc
{
  "version": 1,
  "generated_at": "<ISO timestamp>",
  "change_digest": "<code fingerprint, or null outside a git worktree>",
  "structural": { "checks": [ … ], "findings": [ … ], "knowledge_health": { … }, "constitution": { … } },
  "semantic":   { "status": "not-checked", "note": "…" },
  "summary":    { "fail_count": 0, "warn_count": 0, "skipped_count": 0 }
}
```

`change_digest` is the code fingerprint the report was generated against (the same digest the
review/test-provenance checks compare). `prospec verify record` recomputes it and **refuses a stale
report** rather than grading yesterday's verdicts — so regenerate the report (`prospec check --json`)
after any code edit. It is `null` outside a git worktree, where the freshness guard skips honestly.

## `structural.checks[]` — one entry per check, keyed by `id`

A **flat array** — locate a check by its `id` (`checks.find(c => c.id === '…')`), never by array
position. Each entry: `{ id, status, reason? }`.

- `status` ∈ `pass` | `warn` | `fail` | `skipped`. A `skipped` check carries a `reason` and is
  **never** treated as `pass` — skipped means unchecked.
- `id` ∈ the frozen `DRIFT_CHECK_IDS` set: `req-references`, `file-paths`, `import-direction`,
  `knowledge-health`, `task-completion`, `dangling-prefix`, `feature-modules`,
  `mcp-readme-counts`, `review-provenance`, `metadata-completeness`, `knowledge-size`,
  `test-provenance`, `constitution-severity`, `artifact-language`, `spec-counters`,
  `delta-spec-provenance`, `unjustified-budget-override`, `canonical-doc-drift`,
  `delta-spec-landing-fidelity`, `req-id-uniqueness`.

`artifact-language` reports change artifacts whose PROSE carries no character in the project's
artifact language (fenced code blocks are stripped before the test, so a quoted sample does not
make a file count as compliant). Every finding is `warn`-class — the fail tier for the committed record waits on a
shrink-only legacy exemption — and it skips, with that reason, whenever the artifact language's NAME
is absent from its name→script table (every Latin-script language, English included, and any name
declaring a Latin orthography) or one of four recorded conditions holds: a scope root outside the
repository lexically or via symlink, a scan that raises, or a file that cannot be read. Those four
degrade the whole check to a skip rather than reporting clean. It is not vacuity-proof beyond them:
whatever the canonical scanner filters — build-artifact directory names, symlinked entries,
dotfiles, secret-shaped names, depth over 10 — and a root whose own PARENT is unreadable are all
indistinguishable from genuine absence and pass.

`delta-spec-provenance` reports an audited change whose `delta-spec.md` no longer matches the
fingerprint recorded alongside its review baseline — `fail`-class, and the only check aimed at an
artifact rather than at code. It exists because `computeChangeDigest` excludes `.prospec/`, which
leaves the `**Spec:**` blocks archive copies VERBATIM into the trust zone outside every other gate:
when a review round corrects a REQ's behavior and the correction never reaches its landing block,
`review-provenance` and `test-provenance` both stay green while archive graduates the pre-review
text. Three branches fail — no baseline recorded, the fingerprint moved, and the delta-spec present
but unreadable (its own reason, so the remedy is not "edit the file you cannot read"). It passes
without comparing for a scale that carries no delta-spec, and for a backfill proven by
`backfill-draft.md`, which never runs review and could therefore never hold a baseline. The audited
statuses are the shared `PROVENANCE_AUDITED_STATUSES`, so all three provenance gates cover the same
window — `verified` included, which is where this one matters, since landing blocks graduate at
archive.

`spec-counters` reports an active feature spec whose frontmatter `story_count`/`req_count` disagrees
with its own body — one `warn` finding per disagreeing field, naming the declared and the actual
value. The body is counted with the same matcher `archive finalize` writes with (REQ headings at ANY
level outside `## Deprecated Requirements`; stories at both `## US-` and `### US-`), so the check
cannot police a rule the writer does not follow. `warn`-class because `archive finalize` normally
corrects the value on the next archive — with one exception that matters: when the body would zero a
counter the frontmatter declares above zero, finalize refuses to write and this warn is what persists
until a human converges the spec. It skips, with the reason, when the features directory is absent,
holds no spec, or holds none that parses, and a counter the frontmatter never declares is out of scope
rather than a finding.

`unjustified-budget-override` reports `token_budget` values configured in `.prospec.yaml` that exceed their default threshold without an adjacent YAML comment explaining the reason. Every finding is `fail`-class, ensuring that knowledge thresholds are only raised with documented justification. It skips when no `knowledge.token_budget` section is configured.

`canonical-doc-drift` reports a canonical initialization document (e.g., README.md or core conventions) whose current on-disk content diverges from what its template renders for this project. Every finding is `warn`-class — divergent docs should be replaced with their canonical templates via `prospec upgrade` (which hands off to the skill) or manual sync. It skips when the file is absent.

`delta-spec-landing-fidelity` reports a MODIFIED delta-spec entry whose `**Spec:**` landing block would drop an authored trust-zone `WHEN/THEN` bullet WITHOUT declaring it under `**Dropped:**` — `fail`-class, naming the REQ and the bullet. Because the landing block replaces the whole REQ body verbatim at archive, an un-restated, undeclared bullet leaves the trust zone; archive already refuses that write fail-closed, but only at the last station, after the feature commit. This surfaces the SAME loss at every `prospec check`, deriving the undeclared set from the exact comparison the archive write path uses (never a second implementation that could drift from it). A declared drop passes; a declaration matching no computed drop is a stale declaration (`warn`); a non-empty `**Dropped:**` block that parses to zero list items `warn`s so a prose "none" is not mistaken for a verified assertion. ADDED entries, entries with no `**Spec:**` block, and REQs with no resolvable existing body are excluded. Unlike the provenance gates it is NOT audit-scoped — it reads every in-progress change's delta-spec so the loss is caught before archive, and skips only when `.prospec/changes/` is absent.

`req-id-uniqueness` reports a REQ id defined (as a heading) in more than one place across the Feature Specs — `fail`-class, one finding per definition site, naming the id and every `source_path`/line. REQ ids are module-scoped but authored per feature, so two features can independently number the same id for different requirements; `req-references` only proves a cited id is defined somewhere, never that it is defined exactly once, so a collision could enter the trust zone silently. Slices are grouped with their parent feature (a REQ defined once, in main OR a slice, is not a duplicate). It skips when the features directory is absent or holds no parseable spec.


Gates skills read by id: `review-provenance` (review recorded and not stale), `delta-spec-provenance` (the landing blocks archive graduates match what review saw),
`task-completion` (code-task completion), `knowledge-health` (module staleness — see below),
`test-provenance` (a test run recorded, current, and green — `skipped` when the project has no
resolvable test command, so a project that cannot satisfy it is never permanently barred; a
recorded **non-zero exit still FAILs** even then — a known-red run is a fact no unresolvable
command can suppress).

**These are verdicts, not hints.** `/prospec-verify`'s machine dimensions (1/5 `task-completion`,
4/5 `knowledge-health`, 5/5 `test-provenance`) take their result from the check's `status` verbatim;
a `skipped` machine check makes its dimension `not-adjudicated`, never `pass`.

## `structural.findings[]` — problems only

`{ check, severity, source_path, line?, detail, knowledge_size? }`. Findings exist **only** for `warn`/`fail`
outcomes — a `pass` or `skipped` check produces none. `severity` ∈ `warn` | `fail`. For
`check: 'task-completion'`, each finding carries the `source_path` + `line` of one unchecked
code task — use these instead of recounting tasks.md by hand. For `check: 'knowledge-size'`, each
finding also carries an optional `knowledge_size` object — `{ surface, budget_key, budget, actual, unit, tier, remedy? }`,
the structured facts behind its prose `detail` (additive and optional, so a report without it still
validates); `unit` ∈ `tokens` | `lines`, `tier` ∈ `over` | `headroom`, and `remedy` is absent for the `headroom` tier.

## `structural.knowledge_health` (optional) — module freshness + coverage

```jsonc
{
  "modules": [
    { "name": "lib", "last_src_commit": "<ISO|null>", "last_readme_commit": "<ISO|null>", "last_sub_module_commit": "<ISO>", "stale": true, "last_verified": "<ISO>" }
  ],
  "coverage": { "documented": 23, "total": 23 }
}
```

- Per-module staleness lives on **each element of `modules[]`** as the boolean `stale`.
  `knowledge_health` has **no** top-level `stale[]` array — to get the stale modules, filter
  `knowledge_health.modules` by `.stale`: `knowledge_health.modules.filter(m => m.stale)`.
- `last_verified` is the module's explicit confirmation time (`module-map.yaml`, stamped by
  `prospec knowledge verify`) and is **absent** when the module declares none. It
  is the freshness reference: for a **documented** module `stale` recomputes as `last_src_commit`
  vs `last_verified` **compared by UTC calendar day** (or stale when `last_verified` is absent) —
  day granularity so a source commit made the same day it was verified reads fresh. A module with no README is stale by
  the coverage rule — that verdict rides its `coverage gap` finding and is deliberately not
  recomputable from these timestamps.
- `last_readme_commit` / `last_sub_module_commit` remain in the frozen shape (the latter **absent**
  when the module has no sub-module, never null-filled) but no longer drive `stale` — they are
  reported for continuity of the downstream contract.
- `coverage` is `{ documented, total }` module README counts.
- The whole object is **optional** (absent when the module map is unavailable). Absent →
  treat as "no freshness facts", not as all-fresh.

## `structural.constitution` (optional) — the rule inventory verify audits against

```jsonc
{
  "rules": [
    { "name": "Language Policy", "severity": "MUST", "has_verify_hint": true, "line": 10 },
    { "name": "Legacy untagged rule", "severity": null, "has_verify_hint": false, "line": 42 }
  ]
}
```

- One entry per `###` heading in the Constitution's `## Principles` section, in file order.
- `severity` ∈ `MUST` | `SHOULD` | `MAY` | `null`. `null` means the heading carries no RFC-2119 tag —
  it is **never** defaulted to a severity, and `constitution-severity` warns on it.
- `/prospec-verify` 3/5 audits **1:1 against this list** (statement count ≥ entry count) and takes
  each severity from here rather than re-reading the file — so no rule is skipped and no severity is
  reassigned. Judging whether the code violates a rule is not mechanizable and stays with the agent.
- The whole object is **optional** (absent when the Constitution is missing or declares no
  principles). Absent → audit from the file and record the missing-inventory WARN.

## Sibling report — `escaped-defect-report.json`

`prospec check --escaped-defects [--json]` writes a **separate** report (schema authority: the prospec CLI's escaped-defect schema): `{ version, generated_at, archive_available, ledger_available, sample_count, gates[], samples[], unresolved_references[] }`,
where each `gates[]` entry is `{ gate, passed, escaped, escaped_rate }`. It aggregates `introduced_by`
across `.prospec/changes/` **and** `.prospec/archive/` to give per-gate escaped-defect rate. It is a
historical aggregate, not a drift check: it produces no findings and never affects `--strict`'s exit
code.

Three honesty flags, each answering a different question — never collapse them:

- `ledger_available: false` — **no records were read at all** (neither ledger directory exists).
- `sample_count: 0` — records were read and **none registered** `introduced_by`; `gates` is then empty
  rather than a table of 0% rates.
- `archive_available: false` — the sample is **honestly partial** (the archive is gitignored by design).

`escaped` counts DISTINCT blamed changes, matching `passed`, so `escaped_rate` stays within 0..1; a
name that resolves to no change — or to more than one — lands in `unresolved_references` rather than
being attributed to an arbitrary winner.

## `semantic` and `summary`

- `semantic.status` is **always** `not-checked` — semantic consistency is `/prospec-review`'s
  job and must never be presented as `pass` from this report.
- `summary` carries `fail_count` / `warn_count` / `skipped_count` (aggregates over `checks`).

---

## Reference Information

- Project name: `prospec`
- Schema authority: the prospec CLI's `DriftReportSchema` / `DRIFT_CHECK_IDS`
- Produced by: `prospec check --json` (writes `prospec-report.json`)
