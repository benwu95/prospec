## US-6: Archive Completed Changes [P0]

As a developer using Prospec,
I want to archive completed changes via `/prospec-archive`,
so that `.prospec/changes/` stays clean, the SDD lifecycle closes correctly, and an audit trail accumulates.

**Acceptance Scenarios:**
- WHEN running `/prospec-archive` THEN the Entry Gate checks verified status and knowledge sync, and upon passing scans and moves to `.prospec/archive/{date}-{name}/`
- WHEN archiving completes THEN generate summary.md (knowledge sync is enforced by the Entry Gate; the service layer does not auto-trigger knowledge-update/raw-scan)
- WHEN Feature Spec Sync THEN read delta-spec ADDED/MODIFIED/REMOVED and merge into `specs/features/` (Replace-in-Place)
- WHEN Feature Spec Sync writes a Change History row THEN its Change column is the archived change's name, never a fixed placeholder
- WHEN Feature Spec Sync completes THEN sync the `## Feature Map` section of `specs/product.md` (the rest of that authored file is preserved)
- WHEN archiving completes THEN summary.md (and its committed `_archived-history` copy) carries a `## Review & Verify` section, so the audit trail carries review/verify evidence and does not evaporate with the gitignored bundle
- WHEN executing the deterministic mutations THEN `prospec archive <name...>` performs them (previewable with `--dry-run`), and the skill keeps only the judgment work (Entry Gate, Review & Verify summary, REQ semantic graduation)

### Behavior Specifications

#### REQ-TYPES-010: ChangeStatus Archived Support
`archived` is a valid ChangeStatus value.

#### REQ-SERVICES-010: Archive Service (spec-history destination correction)

#### REQ-TEMPLATES-010: Archive Skill Template (explicitly lists the spec-history copy step)

#### REQ-SPEC-013: Product Spec Feature Map Sync
After archive Feature Spec Sync completes, prospec syncs the Feature Map of `specs/product.md` — it never rebuilds the file. product.md is a human-authored PRD entry with one machine-owned region.
- WHEN Feature Spec Sync completes, THEN the Feature Map sync is triggered
- WHEN syncing, THEN frontmatter is read from every Feature Spec in `features/`, and only `status: active` specs are listed
- WHEN the sync completes, THEN Feature Map links match the current Feature Spec files
- WHEN `specs/product.md` already exists, THEN only the `## Feature Map` section is rewritten and `last_updated` refreshed; all other content is preserved
- WHEN `specs/product.md` does not exist, THEN it is bootstrapped with every section `product-spec-format` requires, unknown content marked with a recognizable TBD placeholder
- WHEN previewing with `--dry-run`, THEN the planned detail distinguishes bootstrap from splice, names what the splice will touch, and reports a refusal (unclosed fence) as a planned non-mutation

#### REQ-TEMPLATES-126: Archive Summary Review & Verify Section
archive-format defines a `## Review & Verify` section between Completion and Knowledge Update (quality grade, critical/major counts + findings excerpts, quality_log digest), so the committed summary carries the review/verify evidence that previously lived only in the gitignored bundle.
- WHEN defining the format, THEN §6 is placed after Completion and before Knowledge Update, listing three categories: grade / criticals-majors + findings excerpts / quality_log digest
- WHEN there is no review round or quality_log is empty, THEN mark it faithfully (Unverified / no review round), never fabricate
- WHEN a backfilled/reconstructed entry, THEN attach a `Source` provenance bullet to distinguish reconstructed evidence from live capture

#### REQ-TEMPLATES-127: Archive Phase 2 Writes the Review & Verify Section
prospec-archive Phase 2 aggregates from metadata.yaml `quality_log` / `review.md` / verify report and writes the `## Review & Verify` section; the Phase 2 Gate checks its presence; a NEVER forbids producing a summary missing this section; Phase 3's existing `_archived-history` copy lands this section alongside the summary.
- WHEN Phase 2 produces the summary, THEN write this section from quality_log/review.md/verify report (mark faithfully when the source is missing, do not fabricate)
- WHEN the summary lacks a `## Review & Verify` section, THEN the Phase 2 Gate does not pass, a NEVER blocks it

#### REQ-TESTS-041: Review & Verify Contract Assertions
`skill-format.test.ts` pins, with section-scoped + negative assertions, the archive-format §6 format section, the prospec-archive Phase 2 write step/Gate/NEVER, and the promotion-format `_archived-history` evidence indicators; fenced-`## ` truncation-aware, mutation-verified.
- WHEN contract runs, THEN assertions are section-scoped; removing any target token → turns red

#### REQ-SERVICES-064: archive.service does not auto-trigger knowledge-update / raw-scan
`archive.service.execute()` does not auto-trigger `executeKnowledgeUpdate` (→ `updateIndex`) or `generateRawScan` after archiving — the auto knowledge-update's `updateIndex` would wipe the curated `index.md` table. This holds with the `prospec archive` CLI entry in place (REQ-CLI-024): the command runs only the archive mutations. Knowledge sync is enforced by the `/prospec-archive` skill Entry Gate, and the module README is folded in at the verify S/A commit; the skill performs those steps, never the service. `ArchiveResult` does not include `knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed` (`generateProductSpec`/`syncFeatureMap` are retained).
- WHEN `execute()` finishes archiving, THEN it does not call `executeKnowledgeUpdate`, does not call `generateRawScan`
- WHEN inspecting `ArchiveResult`, THEN it does not include knowledgeUpdated/knowledgeWarnings/rawScanRefreshed fields
- WHEN inspecting the prospec-archive skill template, THEN there is no reverse claim of a "service auto-triggers knowledge-update/raw-scan safety net"

#### REQ-CLI-024: `prospec archive` command with dry-run preview and post-judgment `finalize`
The CLI registers `prospec archive <name...>` — a thin command (parse → `archive.service.execute()` → format) executing the deterministic archive mutations. Names are required: the explicit target carries the caller's confirmation. `prospec archive finalize <name>` is its **post-judgment** sibling, carrying the two write points that can only run after the skill's work: copying the finalized `summary.md` into `specs/_archived-history/{YYYY-MM-DD}-{name}.md`, and reconciling every feature spec's frontmatter `story_count`/`req_count` against its final body through the shared REQ-heading matcher, so a spec whose REQs sit at a level other than h4 is counted rather than zeroed. Reconciliation refuses before it writes: when a counter the frontmatter declares above zero would be rewritten to zero, that file is left byte-identical and reported as a refused reconciliation instead — a zeroed count is treated as a parse signal, never as a fact, and the reason names the field. That report goes to **stderr and stays visible under `--quiet`**, like the command's other human worklists, without setting an exit code: nothing failed, a file was deliberately not rewritten. Printing it on stdout under the normal-verbosity guard would have traded a silent wrong write for a silent non-write. Both support `--dry-run`, and the refusals are reported identically there. Module derivation stays read-only — the archive report lists the REQ-prefix-derived affected modules, while the skill's Entry Gate derivation reads the working-tree diff and therefore has no archive-bundle equivalent.
- WHEN running `prospec archive <name>` on a verified change, THEN the bundle moves to `.prospec/archive/{date}-{name}/` with summary scaffold, mechanical Feature Spec sync, `status: archived` + `archived_at`, a `## Feature Map` sync of product.md (the rest of that authored file preserved; a missing one bootstrapped), and feature-map bootstrap (no-clobber)
- WHEN running either command with `--dry-run`, THEN every planned mutation is printed and nothing is written
- WHEN `archive finalize` finds a `summary.md` still lacking its `## Review & Verify` section, THEN it refuses — that section is the deterministic marker that the prose overwrite happened, and finalizing earlier would commit the scaffold and count pre-graduation text
- WHEN a feature spec's declared counter is above zero and the body-derived count is zero, THEN that file is not rewritten and the refusal is reported on stderr with the field named, under `--dry-run` and under `--quiet` too
- WHEN a reconciliation was refused, THEN the run does not also claim the counters are already consistent
- WHEN no name is given, THEN the command exits with an error; an unknown name reports `not found` with a pointer to `prospec status`
- WHEN spec-sync preserved a REQ body instead of replacing it (REQ-SERVICES-072), THEN the command lists those REQs as the graduation worklist — under `--dry-run` too
- WHEN formatting output, THEN repo-derived strings pass `sanitizeTerminal()`; skipped/refused/not-found are failure-class output on stderr, each driving exit 1 and visible under `--quiet`

#### REQ-SERVICES-071: archive.service dry-run mode and refusal reporting
`ArchiveOptions.dryRun` short-circuits every write point of the one `execute()` flow (no parallel implementation) and returns the `planned` mutations; predictions mirror the real run's triggers (`readFeatureRoutes` — routes existing, not files written — drives the feature-map probe). The same honesty covers `executeFinalize`, whose two write points (the `_archived-history` copy and the counter reconciliation) are equally previewable and equally write-free under dry-run — including its own refusal class: a feature spec whose counter would be zeroed is reported as a refused reconciliation and planned as no mutation at all, identically in both modes. Named targets are never silently filtered: a non-target-status change reports `refused {name, status, reason}` (including existing-but-unparseable metadata, `status: unknown`), a missing one reports `notFound`; `skippedReasons` carries each skip's real cause. Pre-existing no-clobber, non-fatal, and terminal-station no-schema-validation semantics are unchanged.
- WHEN running either flow with `dryRun`, THEN the filesystem is byte-identical before and after (directories included), and a subsequent real run performs exactly the predicted mutations (both directions, replay equivalence)
- WHEN a named change exists but is not `verified`, THEN the result carries `refused` with its status and reason; a nonexistent name lands in `notFound`
- WHEN a change's archive move fails mid-loop, THEN the move rolls back and `skippedReasons` carries the error message
- WHEN a reconciliation is refused, THEN dry-run reports it exactly as the real run does and plans no mutation for that file

#### REQ-TEMPLATES-159: archive skill delegates deterministic mutations to the CLI
The `prospec-archive` skill's deterministic phases delegate to `prospec archive` (dry-run preview first) and its post-judgment phase to `prospec archive finalize`; there is no CLI resolution ladder and no manual fallback — an unreachable or too-old CLI is a STOP at the shared probe. The skill's retained work is pure judgment: the Entry Gate, the Review & Verify summary, REQ semantic graduation (wording convergence, Story placement), and the semantic half of the lessons harvest. Its Phase 3.7 description distinguishes the two refusal classes finalize can report — a command refusal (the summary overwrite is missing; fix it and re-run) and a reconciliation refusal (a spec whose declared counter the body would zero; re-running changes nothing, that spec needs converging) — because a template that reads every refusal as the first sends the agent back to overwrite a summary that is already correct.
- WHEN reading the generated SKILL.md, THEN no step hand-runs the move, hand-writes feature-map.yaml, hand-copies the summary into `_archived-history`, or hand-recounts frontmatter; `prospec archive` appears in the deterministic steps with a `--dry-run` preview and `prospec archive finalize` appears after the graduation phase
- WHEN comparing the Entry Gate against the pre-change template, THEN its items (only-verified, metadata-completeness, knowledge-sync backstop) are semantically unchanged
- WHEN `prospec archive finalize` reports a command refusal, THEN the skill reads it as "the summary overwrite is missing" and fixes that, never hand-running the two mutations instead
- WHEN it reports a refused reconciliation, THEN the skill reads it as a spec to converge by hand, not as a summary problem to re-run

#### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional landing block plus the description and acceptance-criteria blocks — and `mergeRequirementInPlace` never blanks an authored body. The REQ it merges into is identified by id through the shared `matchReqHeading`, at whatever ATX level the spec already uses, and the in-place replacement keeps that level: a spec whose REQs sit at h3 is merged, not duplicated, and its structure is never silently restructured. A landing block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. When a landing block does replace a body, the bullets it discards are reported separately in `droppedBehavior` — not blanking a body is not the same as not losing behavior. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. An ADDED REQ is inserted at the format-mandated h4 even into a spec that uses another level; the shared matcher counts the mixed levels correctly, so the file stays consistent with its own frontmatter. The replaced section ends where `indexSpec` says it ends, so the writer edits exactly the lines the spec reader sees: the next ACTIVE REQ heading of any level (a live REQ is never part of another REQ's body — and the ADDED path inserts at h4, so a deeper sibling REQ is a shape this sync creates itself), any heading at or above the REQ's own level (h1/h2 always, whatever that level is, because a document section is not body text), or a `---` rule — every one of them read from a fence-masked probe, so a `---` or a `####` inside a fenced block does not bound the body. A STRUCK REQ heading deeper than the REQ is body text, not a boundary: cutting there left the remainder stranded after the replacement and reported nothing, because the shortened slice never saw the bullets it lost; a struck heading at or above the REQ's own level still ends the section, so a retired sibling keeps its retirement record. Trailing blank lines belong to the gap between sections, so the merged body excludes them. Only the FIRST section carrying the id is merged: a spec the h4-only merge already corrupted holds a second section with the same id, and rewriting both would land the body twice and restructure the duplicate's heading level, so it is left byte-identical and reported instead. A landing block ends at a template field label, at ANY Markdown heading, at a `---` rule, or at the end of the entry; a label outside the template registry with content after it is not a boundary but a truncation, and the REQ is refused rather than landed short (REQ-SERVICES-081). A heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — the probe recognizes that section at any level, and `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route's REQ exists at a level other than h4, THEN it is replaced in place at that level and no second section with the same id is created
- WHEN a deeper sibling REQ, an h1/h2 document section, or a `---` rule follows the replaced REQ, THEN it survives the replacement intact
- WHEN the spec already carries the same REQ id twice, THEN the first section is merged, every further one is left byte-identical, and the duplication is reported in `pendingConvergence`
- WHEN a REQ body contains a fenced block holding a `---` or a `####`, THEN the fence-masked probe covers it and the body is not truncated at the fence
- WHEN a REQ body quotes a STRUCK REQ heading deeper than the REQ's own level, THEN it is body text and the replacement covers it, leaving nothing stranded
- WHEN a struck REQ heading sits at or above the REQ's own level, THEN it still ends the section and its retirement record survives
- WHEN the merged REQ body ends, THEN trailing blank lines are excluded, because `indexSpec` defines where the section ends
- WHEN a MODIFIED route carries a landing block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no landing block — including one that carries only change narrative — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a landing block or change narrative, THEN the landed REQ has a body — never title-only
- WHEN a landing block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a landing block is interrupted by a label outside the template registry with content after it, THEN the REQ is refused instead of landing the truncated remainder
- WHEN a REMOVED route's REQ section still exists after deprecation — at any heading level — THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN every worklist matches a real run and no file is written

---

#### REQ-SERVICES-078: A created Feature Spec declares only counters its body can confirm
`createNewFeatureSpec` renders every REQ that carries a `**Story:**` under a heading for that story, and emits a REQ with no `**Story:**` at all BEFORE the story groups — directly under the section heading, belonging to no story — because appending it after them reads as belonging to the last one, a false attribution written into the trust zone that no counter can reveal. The frontmatter `story_count`/`req_count` are derived from that rendered body through `readSpecCounters` — the same derivation `archive finalize` and the `spec-counters` check use. Declaring `story_count` from the route list instead made every freshly created spec claim stories its body never carried: the first `finalize` then refused to zero that counter and the check warned about it permanently, so the file was born unreconcilable. The body template is a single source shared by the counter derivation and the emitted file, because a second copy would let the declared counts describe a body nobody rendered.
- WHEN a new Feature Spec is created, THEN each routed Story appears as a heading with its REQs grouped beneath it
- WHEN a REQ carries no `**Story:**`, THEN it lands before every story heading rather than under the last one
- WHEN a `**Story:**` label would itself parse as a REQ heading, THEN it is neutralised so the label cannot define a REQ nobody specified
- WHEN its frontmatter is read back, THEN both counters equal what its own body holds
- WHEN `archive finalize` first runs over it, THEN the counters reconcile rather than being refused

---

#### REQ-TEMPLATES-166: delta-spec `**Spec:**` landing-block contract
`references/delta-spec-format` defines the landing block as the REQ body that lands verbatim in the Feature Spec — spec form (a one-to-two sentence statement plus `- WHEN …, THEN …` bullets), written in the target Feature Spec's language — the resolved trust-zone language, injected as `trust_zone_language` — not the change-artifact language (`artifact_language`); when the two resolved languages are equal the reference states the one shared language instead of contrasting them. It is REQUIRED for a MODIFIED entry (its absence means the CLI preserves the old body and reports the REQ instead of replacing it) and optional for ADDED (which falls back to the description and acceptance criteria). The reference states where the block ENDS and what happens past that edge: it terminates at one of the template's own field labels appearing for the FIRST time in that entry, at any Markdown heading, at a `---`, or at the entry's end. A field the entry already used is body text rather than a boundary — the reference says so explicitly, because bare membership was itself a silent truncation, and a fixed field order cannot replace it either, real entries having written the acceptance-criteria field on either side of the landing block. Anything that is not a first-occurrence template field, carrying content after it, is a truncation the archive refuses rather than lands short. It tells the author to write the RESULTING requirement rather than the delta, because for MODIFIED the block replaces the whole body and an ADDED entry reusing an existing REQ id is reported by neither worklist. It also states the one shape the Feature Spec scaffold permits but the block cannot carry — a labelled sub-heading such as the scenarios label — so the two references agree instead of each being satisfiable only by violating the other. Alongside the landing block it defines the dropped-behavior declaration: an optional block after the landing block in which the author lists each authored bullet whose exact text the new body does not carry — a retirement and a rewrite alike, since the sync cannot tell them apart — matched as a set against what the archive computed, which is the only way such a drop is released for writing (REQ-SERVICES-083). Because the block's content crosses into the trust zone verbatim, the generated Language Policy rule (`lib/language-policy`) carries it as a named reverse exception: text inside the change-artifact zone that follows the trust-zone language; the declaration quotes trust-zone bullets and follows that language for the same reason. The `prospec-archive` skill's graduation phase reads the CLI's worklists — bodies kept and needing convergence, bodies replaced with bullets dropped, and REQs refused for truncation — rather than re-reading every touched spec.
- WHEN reading the generated delta-spec-format reference, THEN the landing block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, the block's end boundary, the refusal past that boundary, and the write-the-result-not-the-delta instruction stated
- WHEN reading the generated feature-spec-format reference, THEN its account of what a landing block may carry agrees with the delta-spec reference rather than contradicting it
- WHEN reading the dropped-behavior declaration's definition, THEN its position, its set-matching semantics, the fact that a rewrite counts as much as a retirement, and the fact that it releases dropped bullets but never a truncation refusal are all stated
- WHEN reading where the block ends, THEN the rule is stated as first occurrence — neither bare membership nor a fixed field order — so it cannot be read as contradicting the sync it documents
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names every worklist the CLI produces rather than a subset
- WHEN the Constitution's Language Policy rule is generated, THEN it names the landing block as a change-artifact spot that follows the trust-zone language, so a MUST audit cannot read that required text as a violation
- WHEN the two resolved languages are equal, THEN the reference names the one shared language for the landing block instead of contrasting two identical names
- WHEN the block definition, the fallback sentence, the refusal sentence, or the write-the-result instruction is deleted, THEN a section-scoped contract assertion turns red

---

#### REQ-TESTS-060: spec-sync body preservation and the body-less REQ debt ledger
Tests pin both the fix and the damage it already did. Fixture-driven unit tests assert that spec-sync preserves every pre-existing REQ body — including the boundary cases (a REQ that is the last one before an h2, before a `---`, and at EOF) and a body containing `$&` — and each boundary case is covered at **both** h4 and h3, because a merge contract asserted at one heading level says nothing about another. One fixture pins the duplication class directly: a MODIFIED route against a non-h4 REQ must leave exactly one section carrying that id. A repo-internal debt-ledger test asserts the set of body-less REQs across `prospec/specs/features/**` is EXACTLY the documented legacy list, so a newly introduced hole and a repaired-but-still-listed hole both fail — the list can only shrink, and never silently.
- WHEN spec-sync runs over the fixture, THEN every pre-existing REQ body's line count is ≥ its pre-merge value, at every heading level covered
- WHEN a MODIFIED route merges into a non-h4 REQ, THEN exactly one section carries that REQ id afterwards
- WHEN a new body-less REQ appears in any feature spec, THEN the debt-ledger test fails naming it
- WHEN a listed legacy hole is repaired without being removed from the list, THEN the test fails

---

#### REQ-SERVICES-075: Change History rows identify the change
`archive.service`'s spec sync writes each Change History row as `| {date} | {change name} | {impact} | {req refs} |` — the change being archived names its own row, so the column can be traced. The name is a required argument threaded from the caller that already holds it; the writer never derives it from a path nor re-reads metadata, and it is never a fixed placeholder. Both writers escape it through the pipe-table engine's `escapeTableCell`: the name comes from a directory entry, so it is the one cell in the row the service does not generate.
- WHEN spec sync appends a Change History row to an existing table, THEN its Change column is the archived change's name
- WHEN spec sync creates a new Feature Spec, THEN that spec's first Change History row names the change too
- WHEN several changes are archived on the same date, THEN their rows are distinguished by name rather than by date alone
- WHEN the name contains a `|` or a newline, THEN it is escaped so the row keeps its four columns
- WHEN the row is written under `--dry-run`, THEN nothing reaches disk (unchanged)

---

#### REQ-TESTS-069: Change History naming contract
`archive.service`'s test suite pins the naming from both directions on BOTH write paths — appending into an existing table and creating a new spec — plus the `execute()` wiring that supplies the name. The negative half is what catches a regression: a positive assertion only proves today's value is right, and the constant this replaces had passed every positive check since it was introduced while a fixture that only exercised one path left the other free to keep it.
- WHEN a sync is exercised against a spec that already has a Change History table, THEN the appended row's Change column equals the change name and the pre-existing rows are unchanged
- WHEN a sync creates a new spec, THEN its first row names the change
- WHEN `execute()` supplies the name, THEN an empty or absent name fails the suite
- WHEN either escape is removed, THEN the column-count assertion fails

---

#### REQ-LIB-071: archive Entry-Gate evaluator + shared knowledge-sync helper
The knowledge-sync currency derivation moves from `status.service` into a shared `lib` helper (`checkKnowledgeSync`), so `status` and `archive` call one owner; its behavior is unchanged. A new pure `evaluateArchiveEntryGate(report, { knowledgeSynced, allowIncomplete })` returns `{ blocked, reasons }` from the current read-only assessment report's `metadata-completeness`, `review-provenance`, `test-provenance` and `delta-spec-provenance` check statuses plus the knowledge-sync flag; `metadata-completeness` is exempted only when `allowIncomplete` is set.
- WHEN any of completeness / the three provenance checks is FAIL, or `knowledgeSynced` is false, THEN `evaluateArchiveEntryGate` reports blocked with one named reason per cause
- WHEN `allowIncomplete` is set, THEN a `metadata-completeness` FAIL alone does not block
- WHEN required live checks are missing or their observation cannot be proven, THEN the archive boundary refuses before mutation rather than treating an absent verdict as permission; `allowIncomplete` still exempts completeness alone
- WHEN the current assessment and knowledge-sync verdict are passed to this pure evaluator, THEN their I/O and receipt recheck remain owned by the shared assessment/helper and service boundary, never reimplemented in the evaluator

---

#### REQ-SERVICES-102: prospec archive refuses on failed Entry-Gate conditions
`prospec archive` obtains a shared read-only current drift assessment before moving any change, derives knowledge-sync through its shared helper and calls `evaluateArchiveEntryGate`; a persisted report is optional diagnostic output, never the authority authorizing archive. The existing repo-wide aggregation, pre-schema metadata tolerance under `--allow-incomplete`, and spec-sync preflight remain unchanged.
- WHEN a persisted report is absent, stale or predates a normal `verify record`, THEN archive recomputes required workflow verdicts without requiring a manual report rebuild, test execution, report write or other bookkeeping mutation
- WHEN completeness / any provenance is FAIL or knowledge-sync is false, THEN the target change is refused with a named reason per cause; WHEN `--dry-run`, THEN the same refusal prints and nothing is written
- WHEN the latest verify entry is B/C/D after an earlier S/A, or tasks, delta-spec, provenance, attempts or other required facts changed after report generation, THEN archive judges those current facts and cannot accept the earlier cached verdict
- WHEN preflight completes, THEN revalidate the assessment and knowledge-sync observation receipt immediately before the first mutation; a mismatch, missing required check or unprovable fact refuses the target with byte-identical files under dry-run and execution alike
- WHEN `--allow-incomplete` is used, THEN only the completeness condition is relaxed; known provenance failures, unprovable required evidence, knowledge-sync and preflight protections remain enforced, while legacy metadata is not globally forced through the new strict writer schema

---

#### REQ-CLI-047: archive --allow-incomplete flag
The `prospec archive` command exposes an `--allow-incomplete` flag, threaded through `ArchiveOptions` into the Entry-Gate evaluator, that exempts the `metadata-completeness` condition only; every other gate condition still blocks. It composes with `--dry-run`.
- WHEN `--allow-incomplete` is passed, THEN a `metadata-completeness` FAIL no longer blocks while provenance / knowledge-sync / staleness still do

---
