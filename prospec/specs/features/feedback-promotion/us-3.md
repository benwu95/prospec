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
