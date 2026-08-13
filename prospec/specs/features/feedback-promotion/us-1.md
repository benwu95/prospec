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
`prospec learn upsert --lesson <file>` executes the ledger's mechanical half. The skill decides whether an occurrence is the same lesson — the `key` — and hands it over as JSON (`key`, `description`, `kind`, `source_change`, `impact_modules`); the CLI performs the keyed upsert, increments `frequency` only for a **distinct** `source_change` (incremented, never recomputed by re-scanning), unions `source_changes`/`impact_modules`, applies the `freq≥3 ∧ modules≥2` rule with a reproducible audit string, renders the canonical table through the shared `lib/markdown-table` while preserving the surrounding prose, and lists playbook entries past their TTL review-by date — parsed per `### ` entry block located through the shared line-ending primitive, skipping any block that carries a retirement marker. A `retired` ledger row is refused rather than raised: no counter moves, nothing is unioned, and the refusal is reported. `references/promotion-format` remains the format authority the parser follows, and the thresholds stay overridable via `.prospec.yaml` `learn.thresholds`.
- WHEN the same key is upserted from an already-recorded source change, THEN it is idempotent: metadata unions, `frequency` does not increment, and no duplicate row appears
- WHEN a lesson qualifies, THEN only a `personal` row advances to `suggest-promote` (`promoted`/`declined`/`retired` are never revisited, so a declined lesson is not re-suggested) and the suggestion carries the reproducible detail `frequency=N · impact_modules=M · kind=… · rule=…`
- WHEN `impact_modules` names a module absent from `module-map.yaml`, THEN it is dropped from scoring with a warning; with no module-map at all the list is used as supplied and flagged unverifiable
- WHEN an existing `_lessons-ledger.md` is round-tripped, THEN every row survives — including rows after the hand-edited blank lines inside the table — and a `kind` mismatch against the ledger is surfaced as a warning with the ledger's value kept
- WHEN a playbook entry carries a retirement marker, THEN it is absent from the TTL needs-review report however far past its review-by date it is — a settled decision is never re-opened — while a live sibling entry in the same file past its own date is still reported
- WHEN a lesson is upserted onto a row whose `status` is `retired`, THEN the command reports `unchanged`, leaves `frequency`/`source_changes`/`impact_modules` untouched and warns naming the key — the refusal is mechanical for every writer that goes through this command, which is both stations (learn Collect and archive Phase 4.5, whose harvest invokes it rather than hand-editing the table); recording the occurrence in `description`, or un-retiring the row, stays a human act
- WHEN a playbook line carries `UN-RETIRED` alongside `RETIRED`, THEN it is NOT read as a retirement marker — a live entry's retire-then-revive provenance keeps the entry on the TTL report; the marker is the upper-case `- **RETIRED {date}**` line, matched case-sensitively
- WHEN the playbook is read with CRLF line endings, THEN its entry blocks are located exactly as in the LF form, so a live entry past its review-by date is still reported and a retirement marker still excludes a settled one

---
