---
feature: feedback-promotion
status: active
last_updated: 2026-08-03
story_count: 4
req_count: 13
---

# Feedback Promotion Pipeline

## Who & Why

**Audience**: Developers and project maintainers using Prospec who want the team to "get smarter the more it is used" — session feedback can settle into shared experience.

**Problem solved**: Corrections during a session, repeated verify FAILs, and recurring review criticals currently do not flow back into durable rules (`.tasks/lessons.md` is only a personal note and does not enter Constitution/conventions). Every new session and every new hire starts over from the same baseline; goal G6 is absent in the current state. The industry (Claude memory, Cursor Team Rules, AGENTS.md) can do "correction → rule", but all lack an **auditable decision step** for whether a piece of feedback is worth promoting to a team-shared rule.

**Why it matters**: Prospec differentiates itself with its structured assets (archive cross-change statistics, module-map impact scope, Constitution as a gate) — turning the promotion decision into an **explicit, reproducible, version-control-traced** process rather than a black-box heuristic. This is the positive design for G6 "get smarter the more it is used".

---

## US-1: Automatically Collect Session Feedback into Personal Lessons [P1]

As a team developer,
I want Prospec to automatically consolidate session corrections and recurring problems into a personal lessons list,
so that I don't have to record them manually, and these lessons become material for subsequent judgments.

**Acceptance Scenarios:**
- WHEN a verify repeatedly FAILs on the same class of problem THEN record it into the version-controlled lessons ledger and tag the source change and occurrence count
- WHEN a change is archived THEN archive Phase 4.5 automatically extracts its quality_log + review.md + tasks×kind into the version-controlled ledger (survives across worktree/clone, no need to manually trigger `/prospec-learn`)
- WHEN a lesson has not yet accumulated across multiple changes THEN do not proactively suggest promotion (to avoid early noise)

#### REQ-TYPES-024: Register prospec-learn Skill
`prospec-learn` is registered in `SKILL_DEFINITIONS` (`src/types/skill.ts`) as a `Lifecycle`-type skill carrying `hasReferences: true`; the skill→reference mapping itself lives in `agent-sync`'s `getSkillReferences` referenceMap (`prospec-learn → promotion-format`, alongside the shared `drift-report-format`), and `prospec agent sync` — run on its own, or as part of `prospec quickstart` / `prospec upgrade` — renders that payload into every configured agent's skills directory (`prospec init` registers the structure and then tells the user to run the sync; it deploys no skills itself). The registry's current total is not asserted here — that count is owned by the factual-count generator and the contract assertion that pins it, so this REQ does not drift each time a skill is added.
- WHEN the registry is read, THEN `prospec-learn` is present with `type: Lifecycle` and `hasReferences` true, and its trigger words resolve from the English baseline plus any `skill_triggers` the project configured
- WHEN `prospec agent sync` runs, THEN the deployed payload includes `prospec-learn/SKILL.md` + `references/promotion-format.md` — and every other reference its `getSkillReferences` entry maps — in each configured agent's skills directory

#### REQ-TEMPLATES-093: Version-Controlled Lessons Ledger
The lessons ledger is placed under version control at `prospec/ai-knowledge/_lessons-ledger.md` (replacing the gitignored `.prospec/lessons.md`), registered in the root-level `index.md` Conventions (L2 load-on-demand, not core L1); the first version performs a one-time migration of existing frequency.
- WHEN checked out in a new worktree/clone, THEN the ledger's existing frequency accumulation is fully preserved (git can diff)
- WHEN migrating, THEN existing counts are not reset to zero and the old path is retired

#### REQ-TEMPLATES-094: tasks×kind Manual-Skip Harvest
archive Phase 4.5 crosses `tasks.md` completion status × kind: `[M]` manual tasks that are repeatedly left unchecked across changes are extracted into a `kind: playbook` process lesson; old changes lacking a kind marker are safely skipped.
- WHEN an `[M]` task is repeatedly incomplete across multiple changes, THEN generate a process lesson
- WHEN manual tasks are all complete or have no kind marker, THEN do not generate / safely skip

#### REQ-TEMPLATES-128: Canonical _archived-history Evidence Pointer
The promotion-format Harvest and the `_lessons-ledger.md` header both state where a lesson's committed review/verify evidence lives, and both state it conditionally: a `source_changes` name archived since the `specs/_archived-history/{date}-{name}.md` convention existed resolves to that file (cite its `## Review & Verify` section), a name predating it has none, and a missing record is never evidence that nothing happened — the ledger's own `git log -p` is the path that always resolves. Neither relies on the gitignored `.prospec/archive/` bundle, which the worktree workflow can discard.
- WHEN auditing the lesson evidence of a source_change archived under the convention, THEN point to the committed `_archived-history/{date}-{name}.md`, not the gitignored bundle
- WHEN the name predates the convention and no record exists, THEN read the ledger's own git history and never treat the absence as evidence that the lesson was unfounded
- WHEN promotion-format renders, THEN both the prospec-learn and prospec-archive copies of `promotion-format.md` carry this pointer in its conditional form

---

## US-2: Auditable Promotion Decision (Core Differentiator) [P1]

As a project maintainer,
I want Prospec to judge whether a lesson is worth promoting to a team-shared rule using explicit, reproducible criteria rather than a black-box heuristic,
so that the promotion decision can be reviewed, trusted, and is consistent across people.

**Acceptance Scenarios:**
- WHEN a lesson's cross-change frequency reaches the threshold and its number of impacted modules (checked against module-map) meets the bar THEN mark it "suggested for promotion" and list the decision basis (frequency / impact scope / whether it falls within the Constitution's scope)
- WHEN a lesson appears only once or has minimal impact THEN keep it at the personal tier and do not suggest promotion
- WHEN the promotion decision produces a result THEN each suggestion carries traceable scoring details (not merely a "should be promoted" conclusion)

#### REQ-TEMPLATES-069: Collect + Auditable Deterministic Scoring
`prospec-learn` Collect + Score: scans archived changes' quality_log/review.md + the existing ledger, extracts/matches by a **deterministic key**, and incrementally updates frequency/impact_modules/scope/source (placed under version control at `prospec/ai-knowledge/_lessons-ledger.md`, surviving across worktree/clone; fed automatically by `/prospec-archive` Phase 4.5); Score applies **explicit numeric rules** to mark "suggested for promotion" with scoring details.
- WHEN the same class of problem recurs across changes, THEN record it into the ledger with source and frequency
- WHEN frequency and impacted modules reach the threshold, THEN mark "suggested for promotion" + scoring details; the same ledger ⇒ the same output (explicit rules + keyed ledger, not a black box)
- WHEN it occurs only once or has minimal impact, THEN keep it at the personal tier

#### REQ-TEMPLATES-072: Promotion Format Reference
`references/promotion-format.md`: explicit promotion rules (default freq≥3 / impact_modules≥2, overridable via `.prospec.yaml`) + version-controlled ledger (`_lessons-ledger.md`) / playbook entry / approval record / TTL structure, and is the **single definition of the Harvest (archive Phase 4.5 feed), Review-Queue Prioritization, and Staleness Sweep rules**. Making the rules explicit = a reproducible/auditable basis (reproducibility is conditioned on a stable ledger key).
- WHEN referenced, THEN includes explicit numeric thresholds + `.prospec.yaml` configurability + structure definitions + a single definition of Harvest/Review-Queue Prioritization/Staleness Sweep
- WHEN it duplicates an existing Constitution rule, THEN suggest "strengthen the existing one" rather than adding a new one
- WHEN the ledger table is described, THEN it declares the `description` column (provenance suffix included) as the Language Policy's named in-zone exception — written in the language of the original correction, so downstream projects inherit the adjudication instead of only prospec's own hand-written header carrying it
- WHEN the `status` column is described, THEN it is a closed bare-token set (`personal`/`suggest-promote`/`promoted`/`declined`/`retired`) and approval/scoring/retirement provenance is directed to `description`, never appended to `status`
- WHEN the Staleness Sweep is described, THEN it fixes the three expiry tests with their evidence bar, the per-tier removal semantics (retire in place, counters untouched, permanent `PB-{NNN}` ids, `## Retired Entries`), that mechanized ≠ retired, that one tier owns a rule's prose (a promoted row's narrative lives in the playbook; a `personal` row's description IS its promotion evidence and is never compressed), that a stale cross-reference is itself expired content to correct — swept across both files, the skills AND the shipped Feature Specs, where the only legal correction is a MODIFIED REQ graduated at archive — and that the per-occurrence narrative a compressed row sheds is recoverable from the ledger's own `git log -p`, with `_archived-history/` resolving only for changes archived after that convention existed

#### REQ-TESTS-024: Pipeline Contract Tests
contract verifies the shipped skill count (17); `prospec-learn`'s five Core Workflow phases asserted as an ordered sequence — Sweep, Collect, Score, Promote, Govern — plus explicit numeric rules, the human approval gate, Output Contract and Entry/Exit gates; plan/implement include playbook-loading text; promotion-format renders and carries its Staleness Sweep semantics.
- WHEN contract runs, THEN assert section-scoped; removing any phase or the approval gate → turns red
- WHEN the phase list is asserted, THEN it is compared as an ordered sequence, so relocating Sweep after Collect turns it red — presence alone would pass
- WHEN the sweep contract runs, THEN it pins the three expiry tests, the executor clause of the evidence bar, the explicit-approval requirement, the ledger-protection NEVERs and Failure Condition, the full-playbook Startup Loading item, and the reference's retire-in-place semantics including that a `personal` row is never compressed

#### REQ-TEMPLATES-095: knowledge_health Review-Queue Prioritization
After `prospec-learn` Score, read the `prospec-report.json` file: stale modules are `structural.knowledge_health.modules[]` filtered by `.stale` (there is no top-level `stale[]`); when a `convention`-kind lesson's impact_modules ∩ stale, raise its priority + annotate it in the human review queue; the pipeline never automatically writes `_conventions.md` at any point.
- WHEN a convention lesson's impact ∩ stale ≠ ∅, THEN raise queue priority + annotate
- WHEN there is no report, THEN fall back to the default ordering (non-blocking); `_conventions.md` is never automatically written

#### REQ-TESTS-025: Flywheel Contract + Fixture Corpus
`skill-format.test.ts` flywheel block (relocated-path, Phase 4.5 non-fatal/idempotent, Entry Gate ledger-OR-archive, negative no automatic write to `_conventions.md`, section-scoped) + a version-controlled synthetic archive fixture set (recurrence / all-complete scenarios). harvest output is an LLM step, verified by dogfood, not vitest.
- WHEN contract runs, THEN assert section-scoped; a mutation removing the corresponding behavior → turns red
- WHEN fixture corpus, THEN well-formed + scenarios distinguishable (not relying on real archives)

#### REQ-CLI-030: `prospec learn upsert` Ledger Engine
`prospec learn upsert --lesson <file>` executes the ledger's mechanical half. The skill decides whether an occurrence is the same lesson — the `key` — and hands it over as JSON (`key`, `description`, `kind`, `source_change`, `impact_modules`); the CLI performs the keyed upsert, increments `frequency` only for a **distinct** `source_change` (incremented, never recomputed by re-scanning), unions `source_changes`/`impact_modules`, applies the `freq≥3 ∧ modules≥2` rule with a reproducible audit string, renders the canonical table through the shared `lib/markdown-table` while preserving the surrounding prose, and lists playbook entries past their TTL review-by date — parsed per `### ` entry block, skipping any block that carries a retirement marker. A `retired` ledger row is refused rather than raised: no counter moves, nothing is unioned, and the refusal is reported. `references/promotion-format` remains the format authority the parser follows, and the thresholds stay overridable via `.prospec.yaml` `learn.thresholds`.
- WHEN the same key is upserted from an already-recorded source change, THEN it is idempotent: metadata unions, `frequency` does not increment, and no duplicate row appears
- WHEN a lesson qualifies, THEN only a `personal` row advances to `suggest-promote` (`promoted`/`declined`/`retired` are never revisited, so a declined lesson is not re-suggested) and the suggestion carries the reproducible detail `frequency=N · impact_modules=M · kind=… · rule=…`
- WHEN `impact_modules` names a module absent from `module-map.yaml`, THEN it is dropped from scoring with a warning; with no module-map at all the list is used as supplied and flagged unverifiable
- WHEN an existing `_lessons-ledger.md` is round-tripped, THEN every row survives — including rows after the hand-edited blank lines inside the table — and a `kind` mismatch against the ledger is surfaced as a warning with the ledger's value kept
- WHEN a playbook entry carries a retirement marker, THEN it is absent from the TTL needs-review report however far past its review-by date it is — a settled decision is never re-opened — while a live sibling entry in the same file past its own date is still reported
- WHEN a lesson is upserted onto a row whose `status` is `retired`, THEN the command reports `unchanged`, leaves `frequency`/`source_changes`/`impact_modules` untouched and warns naming the key — the refusal is mechanical for every writer that goes through this command, which is both stations (learn Collect and archive Phase 4.5, whose harvest invokes it rather than hand-editing the table); recording the occurrence in `description`, or un-retiring the row, stays a human act
- WHEN a playbook line carries `UN-RETIRED` alongside `RETIRED`, THEN it is NOT read as a retirement marker — a live entry's retire-then-revive provenance keeps the entry on the TTL report; the marker is the upper-case `- **RETIRED {date}**` line, matched case-sensitively

---

## US-3: Three-Tier Promotion and Human Approval Gate [P1]

As a project maintainer,
I want lessons to be promoted from the personal tier to the team-shared tier or Constitution rules only after human approval, with the entire process traced in version control,
so that changes to shared rules can be reviewed, diffed, and traced back to their source.

**Acceptance Scenarios:**
- WHEN a lesson is suggested for promotion to playbook/Constitution THEN it must be explicitly approved by a human before being written, and record the source change / decision criteria / approver
- WHEN promoted to a Constitution/conventions rule THEN it enters version control and can be referenced by subsequent verify
- WHEN the user rejects a promotion THEN the lesson stays at the personal tier, records the rejection, and is not suggested again

#### REQ-TEMPLATES-070: Human-Gated Promotion (kind-labelled)
Personal ledger → team `_playbook.md` (L2 load-on-demand, TTL governance) → Constitution. `kind` is a label: `constitution` (hard rules) → `CONSTITUTION.md`'s `ConstitutionRule` (BL-031 form); the rest (`convention`/`playbook`) → `_playbook.md`, a single governed team tier. The `convention` label lets a human later **manually** move it into the `prospec:user` section of `_conventions.md` — the pipeline does **not** automatically write `_conventions.md` (an L1 core convention that must be actively read at the start of a task, with no TTL governance). Writing to `_playbook`/Constitution **requires explicit human approval**, keeping source/criteria/kind/approver under version control; a rejection is recorded and no longer prompts.
- WHEN suggesting promotion, THEN route by kind (`constitution`→Constitution; the rest→`_playbook.md`), and it must be explicitly approved by a human before being written
- WHEN promoted to a Constitution rule, THEN it enters version control and can be referenced by verify (ConstitutionRule form)
- WHEN the user rejects, THEN keep it at the personal tier + record the rejection

---

## US-4: Shared Rule Governance and Entry Loading [P2]

As a newly joined member,
I want to automatically obtain the relevant team-shared lessons when loading work, and for expired or conflicting rules to be periodically cleaned up,
so that I directly benefit from the team's accumulated experience and am not misled by stale or contradictory rules.

**Acceptance Scenarios:**
- WHEN starting to plan or implement a change THEN the playbook lessons relevant to that change are loaded as reference (progressive disclosure, avoiding context bloat)
- WHEN a shared rule exceeds its TTL or conflicts with another THEN it appears in the "pending review list" for human retirement
- WHEN a shared rule is retired THEN version control records the reason and time of retirement
- WHEN a shared rule's root cause has been eliminated by a mechanism, its subject no longer exists, or it contradicts current governance THEN the pre-Collect Sweep surfaces it with its evidence for human retirement
- WHEN a rule is retired THEN it is retired in place — the ledger row keeps every counter and the playbook entry keeps its permanent id, so the audit trail survives the cleanup

#### REQ-TEMPLATES-071: Governance + Progressive Playbook Loading
Govern: shared rules carry a TTL and source; on expiry, conflict, or a Staleness Sweep verdict → needs-review list, with the retirement reason kept under version control. Retirement has a fixed shape per tier: a ledger row turns `status: retired` with a `｜ **Retired**:` suffix naming reason, date and the eliminating mechanism while every counter stays untouched; a playbook entry keeps its permanent `PB-{NNN}`, replaces TTL + Guidance with a `- **RETIRED {date}**:` line, and moves under a `## Retired Entries` section. Create `_playbook.md` (version-controlled) and register it in the root-level `index.md` Conventions; plan/implement Startup loads the **relevant** playbook entries (progressive disclosure) while `/prospec-learn` — the one station that must reason about the whole team tier — reads it in full; archive Phase 4.5 **automatically extracts into the version-controlled ledger upon archiving (non-fatal/idempotent)** through `prospec learn upsert` — the single writer `/prospec-learn` Collect also uses, so both stations inherit its keyed upsert and its refusal to raise a `retired` row instead of hand-editing the table — and the learn Entry Gate's "has material" = an archived change exists **OR** a non-empty ledger (to avoid false-blocking in a new worktree).
- WHEN planning/implementing a change, THEN the relevant playbook lessons are loaded (progressive disclosure, not full loading, `if present` safeguard)
- WHEN `/prospec-learn` starts, THEN it reads `_playbook.md` in full — the Sweep's team-tier input and Promote's duplicate-check baseline — the single deliberate exception to per-change relevance loading
- WHEN a shared rule exceeds its TTL, conflicts, or is judged expired by a Sweep test, THEN it enters the needs-review list; the retirement reason is kept under version control
- WHEN a rule is retired, THEN the ledger row keeps every counter and the playbook entry keeps its id under `## Retired Entries` with its TTL and Guidance body removed, so no reader mistakes a dead rule for a live instruction
- WHEN archive Phase 4.5 harvests, THEN it writes through `prospec learn upsert` rather than editing the ledger table by hand, so the retired-row refusal holds on the unattended path too
- WHEN `_playbook.md` is registered in the root-level `index.md` Conventions, THEN the skill loads it on demand (L2 load-on-demand, not entering core L1)

#### REQ-TEMPLATES-174: Pre-Collect Staleness Sweep
`/prospec-learn` opens with a **Sweep** station, before Collect, that audits BOTH governed files — `_lessons-ledger.md` and `_playbook.md` — for entries the project has outgrown, so a run never keys a new occurrence against a dead rule nor raises the frequency of a pattern whose root cause is gone. The three expiry tests, their evidence bar and the per-tier removal semantics are defined once in `references/promotion-format.md`; the skill states the station and its flow.
- WHEN `/prospec-learn` runs, THEN Sweep executes first — before Collect — and covers both the ledger and the playbook
- WHEN an entry is judged expired, THEN the verdict cites exactly one of three tests — mechanized (a gate, test, type or CLI check now enforces it), no longer applicable (the artifact, station, command or config it governs is gone), contradicted (it conflicts with a Constitution rule, a shipped spec, or a newer entry)
- WHEN an expiry claim is made, THEN it names the mechanism AND its executor and confirms no occurrence postdates it; a checker nothing runs is not a mechanism, and an unevidenced claim leaves the entry active and listed as unresolved
- WHEN a mechanized root cause leaves the entry as the canonical statement of WHY, THEN the entry is annotated rather than retired — retirement requires that the failure mode can no longer occur
- WHEN Sweep proposes a retirement, THEN it reaches the human as a needs-review item with its evidence and waits for explicit approval — retirement is a shared-tier write under the same approval discipline as promotion
- WHEN a retirement is approved, THEN it is applied in place: no ledger row is deleted, no `frequency`/`source_changes`/`impact_modules` value is edited, and no `PB-{NNN}` id is renumbered or reused
- WHEN a later occurrence predates the fix that retired a row, THEN it is recorded in that row's `description` and never increments its `frequency`

---

## Edge Cases

- Early project with few changes and insufficient samples: do not generate promotion suggestions, only accumulate personal lessons
- Cross-person preference conflict (two developers giving opposite feedback): the decision layer flags the conflict and defers to human arbitration, not automatically picking a side
- A lesson duplicates an existing Constitution rule: detect the duplication and suggest "strengthen the existing one" rather than adding a new one
- Promotion write failure: do not fail silently; retain the pending-promotion queue and report it

## Success Criteria

- **SC-1**: A lesson that recurs across multiple changes can complete the full cycle of "collect → decision suggestion → human approval → write to shared rule → referenceable by verify"
- **SC-2**: The promotion decision produces the same output for the same ledger, with each suggestion carrying traceable scoring details (not a black box; reproducibility is conditioned on a stable ledger key)
- **SC-3**: All shared-tier/Constitution promotions have a version-controlled diff recording the source change and approver
- **SC-4**: Expired or conflicting shared rules 100% enter the pending review list and are not silently carried over

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace the existing version
2. **Functional Grouping**: New requirements are inserted under the corresponding User Story
3. **No Inline Provenance**: Historical attribution lives only in the Change History table
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-08-03 | add-learn-staleness-sweep | ADDED REQ-TEMPLATES-174; MODIFIED REQ-TEMPLATES-071; MODIFIED REQ-TEMPLATES-072; MODIFIED REQ-CLI-030; MODIFIED REQ-TESTS-024; MODIFIED REQ-TEMPLATES-128; MODIFIED REQ-TYPES-024 | US-4 (MODIFIED), REQ-TEMPLATES-174, REQ-TEMPLATES-071, REQ-TEMPLATES-072, REQ-CLI-030, REQ-TESTS-024, REQ-TEMPLATES-128, REQ-TYPES-024 |
| 2026-07-30 | restore-cli-first | ADDED REQ-CLI-030 | REQ-CLI-030 |
| 2026-06-08 | add-feedback-promotion-pipeline | Establish the G6 feedback promotion pipeline: collect → auditable decision → human-approved three-tier promotion → governance | US-1~4; REQ-TYPES-024, REQ-TEMPLATES-069/070/071/072, REQ-TESTS-024 |
| 2026-06-12 | add-knowledge-flywheel | Version-control the ledger (survives across worktree) + archive Phase 4.5 automatic extraction + tasks×kind feed + knowledge_health review prioritization | US-1/2/4 reshaped; MODIFIED REQ-TEMPLATES-069/071/072; ADDED REQ-TEMPLATES-093/094/095, REQ-TESTS-025 |
| 2026-07-04 | carry-review-verify-evidence | The committed evidence for each source_changes in the ledger points to `_archived-history/{date}-{name}.md` (explicitly carried in the promotion-format Harvest + ledger header), replacing the evaporated gitignored bundle (issue #56) | US-1; REQ-TEMPLATES-128 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-25 | align-language-policy-scope | promotion-format declares the ledger description/status language exception, so downstream ledgers inherit it | REQ-TEMPLATES-072 (MODIFIED) |
