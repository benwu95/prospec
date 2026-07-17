# Drift Report (prospec-report.json) Format Reference

This document describes the **shape of `prospec-report.json`** — the machine-readable
output of the deterministic, zero-LLM drift engine. It exists so skills that consume the
report (`/prospec-verify`, `/prospec-learn`) read the right fields instead of hand-writing
field paths that drift from the schema.

> **Scope: shape only.** The authoritative schema is `DriftReportSchema` in
> `src/types/drift-report.ts` (Zod). The `structural.knowledge_health` field is a **frozen
> contract** consumed downstream (Knowledge Flywheel, MCP server) — changing it is a breaking
> change. When in doubt about a field's type or optionality, read that schema; this reference
> only maps where each fact lives.

---

## How the report is produced

`prospec check --json` **writes** the report to `prospec-report.json` in the project root. The
`--json` flag does **not** print JSON to stdout — stdout shows the human-readable formatted
summary (per-check `PASS`/`WARN`/`FAIL`/`SKIP` lines, a `Findings:` block when any exist, a
coverage line when `knowledge_health` is present, and a one-line summary), never JSON. **To read
structured facts, open the `prospec-report.json` file**, not stdout. When `prospec check` is unavailable (not built/installed), there is no file — fall
back to the manual signal the consuming skill documents; never fabricate a report.

## Top-level shape

```jsonc
{
  "version": 1,
  "generated_at": "<ISO timestamp>",
  "structural": { "checks": [ … ], "findings": [ … ], "knowledge_health": { … } },
  "semantic":   { "status": "not-checked", "note": "…" },
  "summary":    { "fail_count": 0, "warn_count": 0, "skipped_count": 0 }
}
```

## `structural.checks[]` — one entry per check, keyed by `id`

A **flat array** — locate a check by its `id` (`checks.find(c => c.id === '…')`), never by array
position. Each entry: `{ id, status, reason? }`.

- `status` ∈ `pass` | `warn` | `fail` | `skipped`. A `skipped` check carries a `reason` and is
  **never** treated as `pass` — skipped means unchecked.
- `id` ∈ the frozen `DRIFT_CHECK_IDS` set: `req-references`, `file-paths`, `import-direction`,
  `knowledge-health`, `task-completion`, `dangling-prefix`, `feature-modules`,
  `mcp-readme-counts`, `review-provenance`, `metadata-completeness`, `knowledge-size`.

Gates skills read by id: `review-provenance` (review recorded and not stale),
`task-completion` (code-task completion), `knowledge-health` (module staleness — see below).

## `structural.findings[]` — problems only

`{ check, severity, source_path, line?, detail }`. Findings exist **only** for `warn`/`fail`
outcomes — a `pass` or `skipped` check produces none. `severity` ∈ `warn` | `fail`. For
`check: 'task-completion'`, each finding carries the `source_path` + `line` of one unchecked
code task — use these instead of recounting tasks.md by hand.

## `structural.knowledge_health` (optional) — module freshness + coverage

```jsonc
{
  "modules": [
    { "name": "lib", "last_src_commit": "<ISO|null>", "last_readme_commit": "<ISO|null>", "stale": true }
  ],
  "coverage": { "documented": 23, "total": 23 }
}
```

- Per-module staleness lives on **each element of `modules[]`** as the boolean `stale`.
  `knowledge_health` has **no** top-level `stale[]` array — to get the stale modules, filter
  `knowledge_health.modules` by `.stale`: `knowledge_health.modules.filter(m => m.stale)`.
- `coverage` is `{ documented, total }` module README counts.
- The whole object is **optional** (absent when the module map is unavailable). Absent →
  treat as "no freshness facts", not as all-fresh.

## `semantic` and `summary`

- `semantic.status` is **always** `not-checked` — semantic consistency is `/prospec-review`'s
  job and must never be presented as `pass` from this report.
- `summary` carries `fail_count` / `warn_count` / `skipped_count` (aggregates over `checks`).

---

## Reference Information

- Project name: `prospec`
- Schema authority: `src/types/drift-report.ts` (`DriftReportSchema`, `DRIFT_CHECK_IDS`)
- Produced by: `prospec check --json` (writes `prospec-report.json`)
