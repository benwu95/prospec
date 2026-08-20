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
  otherwise              → _playbook.md                          # team lesson — L2 on-demand + TTL-governed
```

- `frequency` — how many distinct changes the lesson recurred across (an incremental counter, never re-derived).
- `|impact_modules|` — count of modules the lesson touches, from `module-map.yaml`.
- `kind` — a **label** on the lesson: `convention` (how we code) / `playbook` (a process lesson or gotcha) / `constitution` (a hard, enforceable principle). `constitution` escalates to the Constitution; everything else lands in `_playbook.md` (the single governed team tier). A `convention`-labelled entry stays in `_playbook.md` so it keeps TTL/needs-review governance; a human **may** later hand-move it into `_conventions.md` `prospec:user` section, but the pipeline does **not** auto-write `_conventions.md` (it is an L1 Core Convention read on every task and not TTL-governed).
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

- **key**: normalized signature (the rule/REQ/file-pattern the lesson concerns) — same lesson ⇒ same key; keys stay English (they are identifiers).
- **description**: written in the language of the original correction, including the provenance suffix — the ledger sits inside the English trust zone, so the Constitution's Language Policy names this column as its explicit exception: a lesson quoted in the words it was given in stays matchable and loses no nuance. Every other column stays English.
- **kind**: `convention` | `playbook` | `constitution` — selects the shared destination on promotion.
- **status**: `personal` | `suggest-promote` | `promoted` | `declined` | `retired` (root cause eliminated; the row is kept for history) — a **bare token**, independent of where the ledger lives. Approval, scoring and retirement provenance belongs in `description` (as a `｜ **Promotion**:` / `｜ **Retired**:` suffix), never appended to this column: prose here breaks the closed set every consumer reads.
- Carried forward across runs as the anchor; declined items are not re-suggested.
- **Version-controlled** at `prospec/ai-knowledge/_lessons-ledger.md` (not the gitignored `.prospec/`), so frequency counters survive worktree switches and clones — the durability that makes `frequency ≥ 3` reachable. Auto-fed at archive time (see **Harvest** below).

---

## Generalizability Heuristic (what to capture)

The single definition of which **conversational** corrections are worth capturing — followed by `/prospec-learn` Collect's session-correction folding and the L0 Checkpoint Correction Capture protocol. Harvest's structured sources below (`quality_log`/`review.md`/tasks×kind) are already curated and are NOT re-filtered by this heuristic.

- **Capture** only a rule with cross-file generality: an architecture/layering boundary, a type-contract rule, a testing-discipline rule, or a security rule — the kinds that recur and would re-bite a different file or a later session.
- **Exclude** the one-off: a hard-coded test mock/workaround, a one-off business-string or copy tweak, a temporary hack, or a pure business/requirement change. These never generalize, so capturing them only poisons and bloats the ledger.
- A captured lesson names the downstream project's modules (`module-map.yaml`) and domain terms (`_glossary.md`), and its `description` is written in the language of the original correction (the ledger exception above).
- A recurring pattern is unioned by `prospec learn upsert`'s distinct-source `frequency`, never appended as a duplicate row — the same dedup that keeps the ledger within budget.

---

## Harvest (archive-time auto-extraction)

`/prospec-archive` Phase 4.5 feeds this ledger automatically when a change is archived — the one moment the change's `quality_log` and `review.md` still exist before the worktree workflow can discard them. This is the **single definition** both `/prospec-archive` (producer) and `/prospec-learn` Collect (consumer) follow; neither restates the ledger table elsewhere.

- **Sources** (per archived change): `metadata.yaml` `quality_log` WARN/FAIL, `review.md` recurring criticals, and `tasks.md` × kind markers (kind schema: tasks-format reference).
- **Committed evidence pointer**: a `source_changes` name archived since this convention existed resolves to its committed record at `prospec/specs/_archived-history/{date}-{name}.md` (date-prefixed, name-aligned with the archive folder); a name predating it has no such file, and a missing record is never evidence that nothing happened — the ledger's own `git log -p` is the path that always resolves. Cite that file's `## Review & Verify` section (grade, criticals/majors, `quality_log` digest) as the durable evidence — never the gitignored `.prospec/archive/` bundle, which the worktree workflow can discard.
- **Keying**: assign each finding the same deterministic ledger key Collect uses (the single LLM step), then upsert.
- **Idempotent upsert**: re-archiving or re-running over the same change must not double-count — `source_changes` is a set; `frequency` increments once per *distinct* source change.
- **A `retired` row is never raised by harvest**: the refusal lives in `prospec learn upsert` — the single writer BOTH stations go through (learn Collect and archive Phase 4.5) — which leaves a retired row's `frequency`, `source_changes` and `impact_modules` untouched, reports `unchanged`, and warns naming the key. The guarantee is mechanical exactly as far as that writer is used, which is why neither station hand-edits the table. Recording the occurrence in `description`, or deliberately un-retiring a row whose pattern is live again, is a human act with the same approval bar as any other shared-tier write.
- **tasks×kind process lesson**: when `[M]` manual tasks recur unchecked across changes, record a `kind: playbook` lesson ("manual task systematically skipped"). A change whose manual tasks are all done contributes none; a `tasks.md` without kind markers (legacy) is skipped, not guessed.
- **Non-fatal**: harvest failure logs and continues — it never blocks archiving.
- **Auto-harvest ≠ auto-promote** (deliberate scope): harvest only accumulates and lets Score *suggest*; nothing reaches `_playbook.md`/Constitution without explicit human approval. Key matching is an LLM step — this is not a "deterministic flywheel".

## Review-Queue Prioritization (knowledge_health)

When Score has produced suggestions, order the human-review queue by knowledge freshness: read the `prospec-report.json` file (`prospec check`) — its stale modules are `structural.knowledge_health.modules[]` filtered by `.stale` (there is no top-level `stale[]` array; report shape: the drift-report-format reference); a `convention`-kind lesson whose `impact_modules` intersect a stale module is raised in the queue and annotated "this module's knowledge is also stale — good moment to refresh on hand-move". If no report is present, fall back to default order (non-blocking). This drives **prioritization only** — the hand-move into `_conventions.md` stays a human action; the pipeline never auto-writes `_conventions.md`.

## Team Playbook Entry (`_playbook.md`, version-controlled, team tier)

All non-`constitution` promoted lessons land here — one governed home (L2 on-demand + TTL). The `kind` label distinguishes a coding `convention` from a `playbook` gotcha; a `convention`-labelled entry may later be hand-moved into `_conventions.md` `prospec:user` section by a human, but that is a manual step, not pipeline-automated.

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

## Staleness Sweep (pre-Collect)

`/prospec-learn` audits **both** governed files before Collect, so a run never keys a new occurrence against an entry the project has outgrown — and never raises the frequency of a pattern whose root cause is already gone. Four tests, each settled by first-hand evidence — the first three propose **retirement**; the fourth, **desynchronized**, proposes **re-syncing the gate (or re-annotating)** and never retires the still-valid entry:

| test | question | evidence that settles it |
|---|---|---|
| mechanized | does a gate, test, type, or CLI check now enforce this? | the mechanism (`file:line`, a `DRIFT_CHECK_IDS` id, a test name) **and its executor** (a CI job, a station's Entry Gate) — a checker nothing runs is not a mechanism — plus "no occurrence postdates it" |
| no longer applicable | is the artifact, station, command, or config it governs gone? | the removal (commit / absent path) and the absence of occurrences after it |
| contradicted | does it conflict with a Constitution rule, a shipped spec, or a newer entry? | both statements quoted side by side, so the human arbitrates the real conflict |
| desynchronized | is an entry annotated `Inlined into gate` / `Mechanized`, but a later `Strengthened` clause never reached the gate the annotation names? | the annotation's `Landing:` anchor (below), the `file:line` in that gate where the strengthened clause is **absent**, **and its executor** (the review station that loads the lens every round, the contract test that reads the anchor each CI run) — a claim the gate is synced that does not point at the missing clause is not evidence. Remedy is human-chosen: land the clause in the gate, or re-annotate the entry to state the clause is deliberately not inlined and why — never a silent retire |

Removal semantics differ per tier — both files are audit artifacts, so expiry means **retire + compress**, never delete:

- **Ledger row**: never deleted, never re-keyed. It becomes `status: retired` with a `｜ **Retired**:` suffix carrying reason + date + the eliminating mechanism, while `frequency`, `impact_modules` and `source_changes` stay untouched — those counters are the only evidence the pattern was real. A retired row is never re-opened: an occurrence that predates the fix goes in `description`, never into `frequency`.
- **Playbook entry**: the `PB-{NNN}` id is permanent and never reused. Retirement keeps the provenance head line, replaces `TTL` + `Guidance` with `- **RETIRED {date}**: {reason + mechanism}` — upper-case `RETIRED`, matched case-sensitively, and never on a line that also carries `UN-RETIRED`: a retire-then-revive history is recorded as `- **Retired {date}, UN-RETIRED {date}**` on a live entry and deliberately does NOT mark it retired — and moves the entry under a `## Retired Entries` section — an inactive rule that still reads as an instruction is the PB-003 claim⊆implementation failure inside the governance file itself. `prospec learn upsert`'s TTL report skips entries carrying that marker, so a retired rule never returns to the needs-review list.
- **Mechanized ≠ retired**: when the gate enforces the rule but the entry is still the canonical statement of WHY, keep it and annotate (`- **Inlined into gate {date}**` / `- **Mechanized {date}**`). Retire only when the failure mode can no longer occur. Every such annotation MUST carry a **`Landing:` anchor**: a sentence beginning `Landing:` that lists one or more `path` (marker) pairs — each `path` a backtick-quoted gate file the rule was inlined into (a skill reference `references/*.hbs`, a skill `prospec-*.hbs`, or a repo-relative code path such as `tsconfig.typecheck.json`), each `(marker)` a parenthesised string that occurs in that file (a section heading, a `NEVER`-bullet keyword, a symbol name). The anchor is what makes the inlining machine-checkable: the contract test asserts each `path` exists and contains its `marker`, and the **desynchronized** test reads it to locate the gate a later `Strengthened` clause must also reach. When a strengthening lands new clauses in the gate, extend the annotation (or add a fresh `- **Inlined into gate {date}**` line) so the anchor keeps naming the current landing.
- **One tier owns a rule's prose**: once a lesson is `promoted`, `_playbook.md` holds the rule and its re-evidence; the ledger row keeps the one-line failure mode, its `PB-{NNN}` pointer, and the latest re-evidence clause. Per-occurrence narrative beyond that is git history — `git log -p` on the ledger itself is the one path that always resolves; a `source_changes` name additionally resolves to `prospec/specs/_archived-history/{date}-{name}.md` only for changes archived after that convention existed, so never treat a missing record as evidence that nothing happened. A `personal` row is the opposite case — its description **is** the promotion evidence, so it is never compressed.
- **Stale cross-references are expired content too**: after any status change, grep the entry id across both files, the skills, AND the shipped Feature Specs (`prospec/specs/features/**`, where a graduated REQ body can assert a status) — then correct every sentence that describes its old status. A spec-borne one is corrected the only way the trust zone may be written: a MODIFIED REQ in the next change's delta-spec, graduated at archive.

Retirement is a shared-tier write: the Approval Record below governs it exactly as it governs promotion, and an unevidenced expiry claim leaves the entry active and listed as unresolved.

---

## Governance — TTL & Conflict

- Each shared rule carries a **TTL** and a source reference.
- **Needs-review list**: a rule past its TTL, in **conflict** with another (including contradictory cross-author feedback), or expired by one of the Staleness Sweep tests above, is surfaced for human retirement/arbitration — never auto-resolved.
- Retirement is version-controlled with reason + date.

---

## Reference Information

- Project name: `prospec`
- Tiers: accumulating `prospec/ai-knowledge/_lessons-ledger.md` (version-controlled, durable across worktrees) → team `_playbook.md` (VC, L2, TTL-governed; `kind` label) → `CONSTITUTION.md` ConstitutionRule (kind: constitution). `_conventions.md` is human-hand-moved only, never pipeline-written.
- Constitution file: `prospec/CONSTITUTION.md`
