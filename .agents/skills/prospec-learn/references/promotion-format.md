# Feedback Promotion Format Reference

This document fixes the **explicit promotion rule** and the structured formats used by the **prospec-learn** Skill. Because the rule is written down and applied to stored data, the promotion decision is **reproducible and auditable** — not a black-box heuristic.

> **Scope of the guarantee**: reproducibility is *conditional on a stable ledger* — given the same keyed ledger, the same suggestions and score details follow (the rule and the stored counters are fixed). Assigning a finding its **ledger key** is the single semantic (LLM) step in Collect; once keyed, counting and scoring are deterministic. So "same input ⇒ same output" means *same ledger ⇒ same decision*, not bit-reproducibility from raw archives.

---

## Promotion Rule (explicit, reproducible)

Applied per lesson ledger entry. Defaults (overridable in `.prospec.yaml` → `learn.thresholds`):

```
suggest_promote = (frequency ≥ 3) AND (|impact_modules| ≥ 2)
tier:
  kind == "constitution" → CONSTITUTION.md (ConstitutionRule)   # hard, verify-graded principle (MUST/SHOULD)
  otherwise              → _playbook.md                          # team lesson — L1 on-demand + TTL-governed
```

- `frequency` — how many distinct changes the lesson recurred across (an incremental counter, never re-derived).
- `|impact_modules|` — count of modules the lesson touches, from `module-map.yaml`.
- `kind` — a **label** on the lesson: `convention` (how we code) / `playbook` (a process lesson or gotcha) / `constitution` (a hard, enforceable principle). `constitution` escalates to the Constitution; everything else lands in `_playbook.md` (the single governed team tier). A `convention`-labelled entry stays in `_playbook.md` so it keeps TTL/needs-review governance; a human **may** later hand-move it into `_conventions.md` `prospec:user` section, but the pipeline does **not** auto-write `_conventions.md` (it is L0 always-loaded and not TTL-governed).
- Below either threshold → stays **personal**, not suggested (avoids early noise).
- Every suggestion emits a **score detail**: `frequency=N · impact_modules=M · kind=… · rule=freq≥3 ∧ modules≥2 ⇒ suggest`.
- **Duplicate check**: if a lesson matches an existing Constitution rule, recommend **strengthening the existing rule**, not adding a new one.

`.prospec.yaml` override example:

```yaml
learn:
  thresholds:
    frequency: 3        # min recurrences across changes
    impact_modules: 2   # min modules touched
```

---

## Lessons Ledger (`prospec/ai-knowledge/_lessons-ledger.md`, version-controlled, accumulating tier)

Keyed by a deterministic signature so counting is reproducible:

```markdown
| key | description | frequency | impact_modules | kind | source_changes | status |
|-----|-------------|-----------|----------------|------|----------------|--------|
| test/toContain-false-green | section-scope contract slices + mutation-verify | 3 | 2 (templates,tests) | convention | add-output-contract, add-entry-exit-gates, add-review-fix-loop | suggest-promote |
```

- **key**: normalized signature (the rule/REQ/file-pattern the lesson concerns) — same lesson ⇒ same key.
- **kind**: `convention` | `playbook` | `constitution` — selects the shared destination on promotion.
- **status**: `personal` | `suggest-promote` | `promoted` | `declined` — a lesson's promotion state, independent of where the ledger lives.
- Carried forward across runs as the anchor; declined items are not re-suggested.
- **Version-controlled** at `prospec/ai-knowledge/_lessons-ledger.md` (not the gitignored `.prospec/`), so frequency counters survive worktree switches and clones — the durability that makes `frequency ≥ 3` reachable. Auto-fed at archive time (see **Harvest** below).

---

## Harvest (archive-time auto-extraction)

`/prospec-archive` Phase 4.5 feeds this ledger automatically when a change is archived — the one moment the change's `quality_log` and `review.md` still exist before the worktree workflow can discard them. This is the **single definition** both `/prospec-archive` (producer) and `/prospec-learn` Collect (consumer) follow; neither restates the ledger table elsewhere.

- **Sources** (per archived change): `metadata.yaml` `quality_log` WARN/FAIL, `review.md` recurring criticals, and `tasks.md` × kind markers (kind schema: tasks-format reference).
- **Keying**: assign each finding the same deterministic ledger key Collect uses (the single LLM step), then upsert.
- **Idempotent upsert**: re-archiving or re-running over the same change must not double-count — `source_changes` is a set; `frequency` increments once per *distinct* source change.
- **tasks×kind process lesson**: when `[M]` manual tasks recur unchecked across changes, record a `kind: playbook` lesson ("manual task systematically skipped"). A change whose manual tasks are all done contributes none; a `tasks.md` without kind markers (legacy) is skipped, not guessed.
- **Non-fatal**: harvest failure logs and continues — it never blocks archiving.
- **Auto-harvest ≠ auto-promote** (deliberate scope): harvest only accumulates and lets Score *suggest*; nothing reaches `_playbook.md`/Constitution without explicit human approval. Key matching is an LLM step — this is not a "deterministic flywheel".

## Review-Queue Prioritization (knowledge_health)

When Score has produced suggestions, order the human-review queue by knowledge freshness: read `prospec-report.json` (`prospec check`) `knowledge_health.stale[]`; a `convention`-kind lesson whose `impact_modules` intersect a stale module is raised in the queue and annotated "this module's knowledge is also stale — good moment to refresh on hand-move". If no report is present, fall back to default order (non-blocking). This drives **prioritization only** — the hand-move into `_conventions.md` stays a human action; the pipeline never auto-writes `_conventions.md`.

## Team Playbook Entry (`_playbook.md`, version-controlled, team tier)

All non-`constitution` promoted lessons land here — one governed home (L1 on-demand + TTL). The `kind` label distinguishes a coding `convention` from a `playbook` gotcha; a `convention`-labelled entry may later be hand-moved into `_conventions.md` `prospec:user` section by a human, but that is a manual step, not pipeline-automated.

```markdown
### PB-{NNN}: {one-line rule}
- **Source**: {change(s)} · **Criteria**: freq=N, modules=M · **Kind**: {convention|playbook} · **Approved-by**: {name} · **Date**: {YYYY-MM-DD}
- **TTL**: {date or "review by …"}
- **Guidance**: {what to do / avoid, and why}
```

## Constitution Promotion (top tier)

Emit a `ConstitutionRule` (BL-031 form) so `/prospec-verify` can grade it:
`{ severity: MUST|SHOULD|MAY, name, description, rationale, check }` — plus the same Source/Criteria/Approved-by/Date provenance in the Change History.

---

## Approval Record (mandatory for team/Constitution writes)

No shared-tier write occurs without an explicit human approval capturing: **source change(s)**, the **criteria that fired**, the **approver**, and the **date**. A rejection is recorded as `status: declined` in the ledger and is not re-suggested.

---

## Governance — TTL & Conflict

- Each shared rule carries a **TTL** and a source reference.
- **Needs-review list**: a rule past its TTL, or in **conflict** with another (including contradictory cross-author feedback), is surfaced for human retirement/arbitration — never auto-resolved.
- Retirement is version-controlled with reason + date.

---

## Reference Information

- Project name: `prospec`
- Tiers: accumulating `prospec/ai-knowledge/_lessons-ledger.md` (version-controlled, durable across worktrees) → team `_playbook.md` (VC, L1, TTL-governed; `kind` label) → `CONSTITUTION.md` ConstitutionRule (kind: constitution). `_conventions.md` is human-hand-moved only, never pipeline-written.
- Constitution file: `prospec/CONSTITUTION.md`
