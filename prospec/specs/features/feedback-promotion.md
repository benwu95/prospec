---
feature: feedback-promotion
status: active
last_updated: 2026-07-04
story_count: 4
req_count: 11
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
`SKILL_DEFINITIONS` adds the 13th skill `prospec-learn` (type `Lifecycle`, hasReferences); `agent-sync`'s `getSkillReferences` referenceMap adds `prospec-learn → promotion-format`. No new metadata schema, no lib/cli code (collection sources reuse quality_log/review.md).
- WHEN `prospec agent sync`, THEN deployed includes `prospec-learn/SKILL.md` + `references/promotion-format.md`
- WHEN registered, THEN `SKILL_DEFINITIONS` has 13 skills

#### REQ-TEMPLATES-093: Version-Controlled Lessons Ledger
The lessons ledger is placed under version control at `prospec/ai-knowledge/_lessons-ledger.md` (replacing the gitignored `.prospec/lessons.md`), registered in the root-level `index.md` Conventions (L2 load-on-demand, not core L1); the first version performs a one-time migration of existing frequency.
- WHEN checked out in a new worktree/clone, THEN the ledger's existing frequency accumulation is fully preserved (git can diff)
- WHEN migrating, THEN existing counts are not reset to zero and the old path is retired

#### REQ-TEMPLATES-094: tasks×kind Manual-Skip Harvest
archive Phase 4.5 crosses `tasks.md` completion status × kind: `[M]` manual tasks that are repeatedly left unchecked across changes are extracted into a `kind: playbook` process lesson; old changes lacking a kind marker are safely skipped.
- WHEN an `[M]` task is repeatedly incomplete across multiple changes, THEN generate a process lesson
- WHEN manual tasks are all complete or have no kind marker, THEN do not generate / safely skip

#### REQ-TEMPLATES-128: Canonical _archived-history Evidence Pointer
The promotion-format Harvest explicitly states that the committed review/verify evidence for each `source_changes` in the ledger is located at `specs/_archived-history/{date}-{name}.md` (that file's `## Review & Verify` section), replacing the gitignored `.prospec/archive/` bundle that has evaporated along with the worktree; the `_lessons-ledger.md` header carries this pointer as well.
- WHEN auditing the lesson evidence of a source_change, THEN point to the committed `_archived-history/{date}-{name}.md`, not relying on the gitignored bundle
- WHEN promotion-format renders, THEN both the prospec-learn and prospec-archive copies of `promotion-format.md` carry this pointer

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
`references/promotion-format.md`: explicit promotion rules (default freq≥3 / impact_modules≥2, overridable via `.prospec.yaml`) + version-controlled ledger (`_lessons-ledger.md`) / playbook entry / approval record / TTL structure, and is the **single definition of the Harvest (archive Phase 4.5 feed) and Review-Queue Prioritization rules**. Making the rules explicit = a reproducible/auditable basis (reproducibility is conditioned on a stable ledger key).
- WHEN referenced, THEN includes explicit numeric thresholds + `.prospec.yaml` configurability + structure definitions + a single definition of Harvest/Review-Queue Prioritization
- WHEN it duplicates an existing Constitution rule, THEN suggest "strengthen the existing one" rather than adding a new one

#### REQ-TESTS-024: Pipeline Contract Tests
contract verifies skill count is 13; `prospec-learn` four phases (section-scoped) + explicit numeric rules + human approval gate + Output Contract + Entry/Exit gates; plan/implement include playbook-loading text; promotion-format renders.
- WHEN contract runs, THEN assert section-scoped; removing any phase or the approval gate → turns red

#### REQ-TEMPLATES-095: knowledge_health Review-Queue Prioritization
After `prospec-learn` Score, read the `prospec-report.json` file: stale modules are `structural.knowledge_health.modules[]` filtered by `.stale` (there is no top-level `stale[]`); when a `convention`-kind lesson's impact_modules ∩ stale, raise its priority + annotate it in the human review queue; the pipeline never automatically writes `_conventions.md` at any point.
- WHEN a convention lesson's impact ∩ stale ≠ ∅, THEN raise queue priority + annotate
- WHEN there is no report, THEN fall back to the default ordering (non-blocking); `_conventions.md` is never automatically written

#### REQ-TESTS-025: Flywheel Contract + Fixture Corpus
`skill-format.test.ts` flywheel block (relocated-path, Phase 4.5 non-fatal/idempotent, Entry Gate ledger-OR-archive, negative no automatic write to `_conventions.md`, section-scoped) + a version-controlled synthetic archive fixture set (recurrence / all-complete scenarios). harvest output is an LLM step, verified by dogfood, not vitest.
- WHEN contract runs, THEN assert section-scoped; a mutation removing the corresponding behavior → turns red
- WHEN fixture corpus, THEN well-formed + scenarios distinguishable (not relying on real archives)

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

#### REQ-TEMPLATES-071: Governance + Progressive Playbook Loading
Govern: shared rules carry a TTL and source; on expiry/conflict → pending review list, with the retirement reason kept under version control. Create `_playbook.md` (version-controlled) and register it in the root-level `index.md` Conventions; plan/implement Startup loads the **relevant** playbook (progressive disclosure); archive Phase 4.5 **automatically extracts into the version-controlled ledger upon archiving (non-fatal/idempotent)**, and the learn Entry Gate's "has material" = an archived change exists **OR** a non-empty ledger (to avoid false-blocking in a new worktree).
- WHEN planning/implementing a change, THEN the relevant playbook lessons are loaded (progressive disclosure, not full loading, `if present` safeguard)
- WHEN a shared rule exceeds its TTL or conflicts, THEN enter the pending review list; the retirement reason is kept under version control
- WHEN `_playbook.md` is registered in the root-level `index.md` Conventions, THEN the skill loads it on demand (L2 load-on-demand, not entering core L1)

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
| 2026-06-08 | add-feedback-promotion-pipeline | Establish the G6 feedback promotion pipeline: collect → auditable decision → human-approved three-tier promotion → governance | US-1~4; REQ-TYPES-024, REQ-TEMPLATES-069/070/071/072, REQ-TESTS-024 |
| 2026-06-12 | add-knowledge-flywheel | Version-control the ledger (survives across worktree) + archive Phase 4.5 automatic extraction + tasks×kind feed + knowledge_health review prioritization | US-1/2/4 reshaped; MODIFIED REQ-TEMPLATES-069/071/072; ADDED REQ-TEMPLATES-093/094/095, REQ-TESTS-025 |
| 2026-07-04 | carry-review-verify-evidence | The committed evidence for each source_changes in the ledger points to `_archived-history/{date}-{name}.md` (explicitly carried in the promotion-format Harvest + ledger header), replacing the evaporated gitignored bundle (issue #56) | US-1; REQ-TEMPLATES-128 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
