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
Govern: shared rules carry a TTL and source; on expiry, conflict, or a Staleness Sweep verdict → needs-review list, with the retirement reason kept under version control. Retirement has a fixed shape per tier: a ledger row turns `status: retired` with a `｜ **Retired**:` suffix naming reason, date and the eliminating mechanism while every counter stays untouched; a playbook entry keeps its permanent `PB-{NNN}`, replaces TTL + Guidance with a `- **RETIRED {date}**:` line, and moves under a `## Retired Entries` section. Create `_playbook.md` (version-controlled) and register it in the root-level `index.md` Conventions; plan/implement Startup loads playbook entries through `prospec learn playbook --station plan|implement --modules <related_modules>` — the complete active catalog plus station-declared bodies, with modules ordering matches first and all-undeclared books falling back to legacy module selection; any active entry is fetched on demand with `--id` — while `/prospec-learn` — the one station that must reason about the whole team tier — reads it in full; archive Phase 4.5 **automatically extracts into the version-controlled ledger upon archiving (non-fatal/idempotent)** through `prospec learn upsert` — the single writer `/prospec-learn` Collect also uses, so both stations inherit its keyed upsert and its refusal to raise a `retired` row instead of hand-editing the table — and the learn Entry Gate's "has material" = an archived change exists **OR** a non-empty ledger (to avoid false-blocking in a new worktree).
- WHEN planning/implementing a change, THEN the relevant playbook lessons are loaded (progressive disclosure, not full loading, `if present` safeguard)
- WHEN `/prospec-learn` starts, THEN it reads `_playbook.md` in full — the Sweep's team-tier input and Promote's duplicate-check baseline — the single deliberate exception to per-change relevance loading
- WHEN a shared rule exceeds its TTL, conflicts, or is judged expired by a Sweep test, THEN it enters the needs-review list; the retirement reason is kept under version control
- WHEN a rule is retired, THEN the ledger row keeps every counter and the playbook entry keeps its id under `## Retired Entries` with its TTL and Guidance body removed, so no reader mistakes a dead rule for a live instruction
- WHEN archive Phase 4.5 harvests, THEN it writes through `prospec learn upsert` rather than editing the ledger table by hand, so the retired-row refusal holds on the unattended path too
- WHEN `_playbook.md` is registered in the root-level `index.md` Conventions, THEN the skill loads it on demand (L2 load-on-demand, not entering core L1)
- WHEN plan or implement loads the playbook, THEN its existing sixth Startup Loading item runs `prospec learn playbook --station plan|implement --modules <related_modules>` with that station name, retains the literal `_playbook.md`, and loads all active catalog lines plus station-selected bodies; item count and order and per-line token ceilings do not increase
- WHEN startup snapshots are regenerated, THEN other stations' Startup Loading bytes are unchanged, learn still loads the full playbook, and workflow scenario ceilings are not increased
- WHEN archive harvest encounters a retired row, THEN it reports the refusal without inferring that the root cause is gone

#### REQ-TEMPLATES-174: Pre-Collect Staleness Sweep
`/prospec-learn` opens with a **Sweep** station, before Collect, that audits BOTH governed files — `_lessons-ledger.md` and `_playbook.md` — for entries the project has outgrown, so a run never keys a new occurrence against a dead rule nor raises the frequency of a pattern whose root cause is gone. The expiry/needs-review tests, their evidence bar, the `Inlined into gate`/`Mechanized` `Landing:` anchor format, and the per-tier removal semantics are defined once in `references/promotion-format.md`; the skill states the station and its flow.
- WHEN `/prospec-learn` runs, THEN Sweep executes first — before Collect — and covers both the ledger and the playbook
- WHEN an entry is judged expired or desynchronized, THEN the verdict cites the applicable existing test — mechanized, no longer applicable, contradicted or desynchronized — with the reference-defined evidence bar; cleanup findings use the separate mechanized-compaction or over-limit tests and do not imply retirement
- WHEN an expiry claim is made, THEN it names the mechanism AND its executor and confirms no occurrence postdates it; a checker nothing runs is not a mechanism, and an unevidenced claim leaves the entry active and listed as unresolved
- WHEN a mechanized root cause leaves the entry as the canonical statement of WHY, THEN the entry is annotated rather than retired — retirement requires that the failure mode can no longer occur
- WHEN Sweep proposes a retirement, THEN it reaches the human as a needs-review item with its evidence and waits for explicit approval — retirement is a shared-tier write under the same approval discipline as promotion
- WHEN a retirement is approved, THEN it is applied in place: no ledger row is deleted, no `frequency`/`source_changes`/`impact_modules` value is edited, and no `PB-{NNN}` id is renumbered or reused
- WHEN a later occurrence predates the fix that retired a row, THEN it is recorded in that row's `description` and never increments its `frequency`
- WHEN Sweep runs, THEN it additionally checks mechanized entries for the reference's compact form and oversized entries for splitting or compaction, presenting before/after text and evidence for explicit per-entry human approval before a shared-tier write
- WHEN a mechanized entry's strengthened clauses are absent from its Landing, THEN Sweep retains those clauses and proposes resynchronization instead of deleting them to meet the size limit

---

#### REQ-LIB-094: Playbook catalog engine
`lib/lessons-ledger.ts` remains the owner of `splitPlaybookBlocks`, `parsePlaybookEntries` and `selectPlaybookEntries`. Each entry heading matches `PB-<digits>: <title>`; blocks use fence-aware `###` headings and end at the next `###` or a section-ending `#`/`##`. Modules come only from the Source line's Criteria `modules=N (...)` list (null when absent), kind from `**Kind**`, ttl from `**TTL**`, and retired from the existing `PLAYBOOK_RETIRED_MARKER`. Entry text remains intact; one shared fence-aware block definition serves both the catalog and TTL. `PlaybookEntry` additionally carries `stations: 'all' | string[] | null`, `tokens` and `overLimit`; `PLAYBOOK_ENTRY_TOKEN_LIMIT` is 300 and `estimateTokens(entry.text)` counts the complete parsed entry including heading and metadata, after the parser's existing trailing-blank-line trim.
- WHEN a declaration is parsed, THEN the first unfenced `- **Stations**:` line is tokenized by the same shared token helper used by Constitution declarations, accepting case-insensitive labels, comma/whitespace separators and `normalizeStationName` aliases; missing or empty declarations become null and unknown tokens are retained for diagnostics
- WHEN all is the sole declaration token, THEN it selects every valid station; all mixed with other tokens is unknown rather than a wildcard, and valid companion tokens still match
- WHEN at least one active entry has a nonempty declaration and station selection is requested, THEN the catalog contains all active entries and only all or matching station declarations select full bodies; undeclared entries remain catalog-only
- WHEN modules accompany a station selector, THEN stable module-match-first order is independent from body selection; without modules, file order is retained
- WHEN every active entry is undeclared, THEN station selection delegates to the original module selector and marks legacy fallback; absent requested modules use the union of active entries' declared modules, leaving module-less entries catalog-only
- WHEN an entry is measured, THEN tokens strictly greater than 300 mark overLimit; equality does not, and neither parsing nor selection truncates text
- WHEN only retired entries declare stations, THEN they do not prevent fallback or contribute to active diagnostics

- WHEN `expiredPlaybookEntries` runs after the refactor, THEN its TTL report is unchanged for every existing fixture (it consumes `splitPlaybookBlocks`)
- WHEN `selectPlaybookEntries` is given modules, THEN the catalog holds every active entry in file order except that entries whose `modules` intersect the request come first and are flagged `module-match`; an entry with `modules: null` is listed but never matched
- WHEN an entry carries the retirement marker, THEN it is absent from the catalog and from `--id` selection
- WHEN `selectPlaybookEntries` is given an id, THEN exactly the entry with that id is returned, and a miss reports the id as unknown
- WHEN the heading is the template placeholder `PB-{NNN}`, THEN it is not an entry

---

#### REQ-SERVICES-123: `learn playbook` service
`services/learn.service.ts` exports `executePlaybook({ cwd, modules?, id?, station? })`, reading `_playbook.md` through `knowledge-reader.readContained` and delegating parsing, diagnostics and selection to the lib owner. The result carries selection mode, independent module-match/body-selection facts and warnings; the service does not infer relevance or mutate knowledge.
- WHEN selectors are supplied, THEN modules, id, station, or station plus modules are accepted; no selector, id combined with either other selector, invalid or empty station, or explicitly empty modules throws PrerequisiteError before the file read
- WHEN a CLI station is normalized, THEN the shared normalizeStationName resolves it against SDD_STATIONS; all is a declaration wildcard rather than a valid CLI station
- WHEN station selection falls back with supplied modules, THEN the service returns the original module selection facts plus exactly one fallback diagnostic; absent modules use the active module union
- WHEN a catalog is requested, THEN unknown-declaration and over-limit diagnostics cover every active entry, including catalog-only entries; id mode diagnoses only its selected entry, with unknown tokens deduplicated per id
- WHEN the playbook is absent, THEN no fallback diagnostic is emitted; an existing empty file or all-retired file produces an empty catalog and a fallback diagnostic when station selection is requested

- WHEN `_playbook.md` is absent, THEN the result is `available: false` with an empty catalog and the command exits 0
- WHEN `_playbook.md` exists but is unreadable, or resolves outside the knowledge directory, THEN the service throws `PrerequisiteError` naming the path and the reason — an unattended Startup Loading is never told "no team lessons" while the file is there
- WHEN modules-only or legacy-fallback mode runs, THEN the result carries the full active catalog and module-matched bodies; in station mode, bodySelected alone determines full bodies regardless of module matches, and every catalog still contains all active entries
- WHEN id is given and unknown, THEN PrerequisiteError names it; when no selector is given, THEN PrerequisiteError names station, modules and id as supported selectors

---

#### REQ-CLI-059: `prospec learn playbook --modules <m,…> | --id <PB-NNN>`
`prospec learn playbook` accepts `--station <s>` optionally with `--modules <m,…>`, retains modules-only and id-only reads, and documents the selectors in the enriched help registry. The formatter renders service facts with the existing terminal sanitizer; it never determines relevance.
- WHEN station mode renders, THEN every active catalog line appears in service order with only station-selected entries followed by full text; the header and relevance wording identify station selection rather than claiming module matches select bodies
- WHEN no active declaration exists and station plus modules is requested, THEN stdout is byte-identical to the original modules-only output for the same file and modules, including ordering and newlines, while stderr emits one fallback warning
- WHEN unknown declaration tokens or oversized entries are reported, THEN stderr names the entry id and unknown tokens or measured tokens and the 300-token limit; warnings do not change exit status or truncate stdout
- WHEN modules-only or id-only mode runs, THEN its stdout remains byte-identical to the legacy output; new diagnostics are confined to stderr
- WHEN both CLI references are read, THEN both document station-selected bodies, complete active catalogs, module sorting, id lookup, legacy fallback and the advisory 300-token entry limit; numeric savings claims cite actual measurements

- WHEN `--modules lib,cli` runs against this project's playbook, THEN the number of catalog lines equals the number of active entries and no retired entry appears
- WHEN `--id PB-007` runs, THEN only that entry's text is printed; an unknown id exits 1
- WHEN `_playbook.md` is absent, THEN one line says so and the exit code is 0
- WHEN `prospec learn playbook --help` runs, THEN the three help sections are present and the example is a complete command line

---
