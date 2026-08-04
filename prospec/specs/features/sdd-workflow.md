---
feature: sdd-workflow
status: active
last_updated: 2026-08-03
story_count: 32
req_count: 160
---

# SDD Workflow

## Who & Why

**Who it serves**: Developers and teams doing Spec-Driven Development with Prospec.

**Problem it solves**: In software development, requirements are scattered, specs drift, changes go untracked, and Knowledge decouples from implementation. Without a structured flow, AI Agent output quality is unstable, and a project accumulates technical debt over time with no way to verify it.

**Why it matters**: The SDD Workflow is Prospec's core value proposition — through the six-phase lifecycle Story → Plan → Tasks → Implement → Verify → Archive, every change gets complete spec tracking, quality gates, and knowledge sedimentation. The spec is a Living Spec, and Knowledge is kept in sync as the project evolves, forming a positive flywheel.

---

## US-1: Create Change Request [P0]

As a developer using Prospec,
I want to create a structured change request via `/prospec-new-story`,
so that I can clearly describe user stories, acceptance criteria, and functional requirements in INVEST format.

**Acceptance Scenarios:**
- WHEN running `prospec change story {name}` THEN create `.prospec/changes/{name}/` containing `proposal.md` and `metadata.yaml` (status: story)
- WHEN the change name already exists THEN prompt that it exists and terminate
- WHEN describing requirements THEN guide writing multiple independent INVEST User Stories (with priority and WHEN/THEN acceptance scenarios)

### Behavior Specifications

#### REQ-CHNG-001: Create Change Directory
Create the `.prospec/changes/{name}/` directory structure.
- WHEN executes, THEN create directory with `proposal.md` and `metadata.yaml`
- WHEN directory already exists, THEN prompt and exit

#### REQ-CHNG-002: Generate proposal.md
Generate a proposal.md in INVEST User Story format.
- WHEN completes, THEN contains multiple INVEST User Stories + acceptance scenarios
- WHEN `--description` provided, THEN written to Notes section
- WHEN referencing proposal-format, THEN includes Why, User Stories, Edge Cases, FR, SC, Open Questions

#### REQ-CHNG-003: Auto-Identify Related Modules
Identify related modules by keyword-matching against the root-level `{base_dir}/index.md`, taking the **bare** module name from the Module cell.
- WHEN change name contains module keywords, THEN Related Modules lists matches
- WHEN no match, THEN Related Modules is empty
- WHEN parsing the `{base_dir}/index.md` table, THEN cells are read position-stably and Description comes from the canonical column index (REQ-KNOW-020); non-module rows (e.g. the Progressive Knowledge Loading Strategy table) are skipped by column count
- WHEN the Module cell carries display emphasis (`**types**`), THEN the emphasis is stripped via the shared `stripCellEmphasis` before the value is used as a module name — one source shared with `parseIndexModules`, so the two never disagree on a module's identity
- WHEN the name reaches `related_modules` or the proposal, THEN it is bare: metadata holds `types`, and the proposal template applies the single layer of bolding

#### REQ-CHNG-004: Change Metadata Lifecycle
Track status via metadata.yaml, with `ai-knowledge/_status-lifecycle.md` as the single source of truth: `story` → `plan` → `tasks` → `implemented` → `verified` → `archived`; `scale: quick` (after user confirmation) permits `story` → `tasks`, a legal skip of plan.
- WHEN each workflow skill completes, THEN advance status per the canonical lifecycle: new-story → `story`, plan → `plan`, tasks → `tasks`, implement → `implemented`
- WHEN metadata `scale: quick`, THEN `story → tasks` is the single legal skip (no plan.md/delta-spec.md produced; spec and knowledge impact are re-checked by the archive Entry Gate against the actual diff)
- WHEN verify reaches grade S/A, THEN status → `verified`; WHEN grade B/C/D, THEN status unchanged (re-run after fixing)
- WHEN archive runs, THEN accept only `verified` changes
- WHEN any workflow skill needs the state machine, THEN point at `_status-lifecycle.md` as the source of truth
- WHEN gating artifacts, THEN Feature Specs are updated ONLY by `/prospec-archive` (Phase 3.5 graduation); `/prospec-verify` gates on Knowledge↔code and does NOT gate on Feature Spec freshness — preventing a verify↔archive deadlock
- WHEN reaching the S/A commit boundary, THEN module-README Knowledge is synced at the verify S/A commit prompt (the prevention point) and the archive Entry Gate is the backstop that still FAILs when unsynced; Feature Specs remain archive-Phase-3.5-only (the deadlock-avoidance line above is unchanged)

#### REQ-CHNG-005: Prevent Duplicate Changes
- WHEN change name already exists, THEN prompt and exit

#### REQ-TEMPLATES-032: New-Story Skill INVEST Guidance
`prospec-new-story.hbs` guides producing INVEST User Stories.
- WHEN triggered, THEN interview flow guides multiple independent Stories with P0/P1/P2 + WHEN/THEN
- WHEN complete, THEN conform to proposal-format.hbs + execute Knowledge Quality Gate

#### REQ-TEMPLATES-150: metadata.yaml Format Reference
`references/metadata-format.hbs` is the single authority for the metadata.yaml serialization format (canonical field order, minimal quoting, `created_at` ISO 8601, `quality_log` entry shape); semantics defer to `ChangeMetadataSchema` (`src/types/change.ts`) and `_status-lifecycle.md`, without restating them.
- WHEN new-story/ff scaffold metadata.yaml, THEN follow the reference's canonical field order and serialization conventions (loaded MANDATORY at new-story Startup Loading / on-demand at ff Phase 2)
- WHEN a downstream skill (plan/tasks/implement/review/verify/archive) appends a `quality_log` entry or edits `status`, THEN follow the reference's entry shape — `result` stays the gate three-state, the verify grade lives in `grade`, never in `result`
- WHEN the reference documents field domains, THEN it points to the schema/`_status-lifecycle.md` rather than restating them (avoids the templates restatement-contract failure)

---

## US-2: Generate Implementation Plan [P0]

As a developer using Prospec,
I want to auto-generate a structured implementation plan and change spec from proposal.md,
so that I clearly know which modules to change, what the steps are, and the REQ ID tracking for each requirement.

**Acceptance Scenarios:**
- WHEN running `/prospec-plan` THEN read proposal.md + Knowledge and produce plan.md and delta-spec.md
- WHEN delta-spec is generated THEN each requirement has an ID in `REQ-{MODULE}-{NUMBER}` format
- WHEN there are more than 10 steps THEN suggest splitting into multiple Stories

### Behavior Specifications

#### REQ-CHNG-006: Load Proposal and Module Context
- WHEN starts, THEN read proposal.md + related module READMEs
- WHEN Constitution exists, THEN inject as context
- WHEN matching feature specs exist, THEN load as Layer 0 context

#### REQ-CHNG-007: Identify Related AI Knowledge Modules
- WHEN proposal marks related modules, THEN read `modules/{module}/README.md`
- WHEN module README missing, THEN skip with warning

#### REQ-CHNG-008: Constitution Injection (site-specific)
- WHEN Constitution exists, THEN each planning skill checks only its **site-specific** rule (new-story→INVEST, plan→dependency-direction/layering, tasks→TDD coverage), NOT a generic ">= 3 principles" scan — the full every-principle audit is `/prospec-verify` V3/5 only (REQ-TEMPLATES-133)
- WHEN absent, THEN skip

#### REQ-CHNG-009: Generate plan.md
- WHEN context loaded, THEN includes Overview, Affected Modules, Steps, Risk Assessment
- WHEN steps > 10, THEN suggest splitting Stories
- WHEN MODIFIED requirements, THEN reference Before from feature spec

#### REQ-CHNG-010: Generate delta-spec.md
- WHEN plan generated, THEN delta-spec.md created with ADDED/MODIFIED/REMOVED
- WHEN added, THEN includes Description, Acceptance Criteria, Priority
- WHEN modified, THEN includes Before, After, Reason

#### REQ-TEMPLATES-059: Plan Call Chain and Layering Check
- WHEN prospec-plan produces plan.md, THEN include a Call Chain section (and plan-format.hbs defines it)
- WHEN Plan Phase 6 runs, THEN check the call chain's layering against the Constitution's dependency rule
- WHEN verify dimension 3/5 runs, THEN re-check layering against the Constitution

#### REQ-TEMPLATES-125: Plan Conditional User Story Flow Diagram
`/prospec-plan` produces a Mermaid behavior/decision flow diagram in plan.md (Section 5) for structurally complex user stories, following the `_diagram-conventions.md` conventions, complementary in scope to the Call Chain (REQ-TEMPLATES-059).
- WHEN a user story matches any-of the structural signals (>=2 branching decision points / >=3 sequential state transitions or multiple terminal states / cross-module, cross-role where sequence is the key to understanding), THEN plan.md embeds one Mermaid diagram of that story's behavior/decision flow
- WHEN a user story is a single linear happy path or a single-step CRUD, THEN do not produce a flow diagram
- WHEN producing a flow diagram, THEN follow the `_diagram-conventions.md` classDef/node conventions, and the diagram block does not count toward the 120-line standard cap
- WHEN describing the diagram-production step, THEN prospec-plan Phase 4 reads `_diagram-conventions.md` on-demand, and never adds it to Startup Loading (cache stability)

---

## US-3: Smart Context Loading [P1]

As a developer using Prospec,
I want the Plan phase to auto-detect Brownfield/Greenfield and adjust the context strategy,
so that existing projects leverage Knowledge to produce precise plans, and brand-new projects are guided through compensatory context collection.

**Acceptance Scenarios:**
- WHEN `ai-knowledge/modules/` has >= 2 modules with README.md THEN Brownfield Mode + auto-synthesize Technical Summary
- WHEN < 2 modules THEN Greenfield Mode + guide compensatory context collection

### Behavior Specifications

#### REQ-TEMPLATES-033: Plan Skill Feature Spec Loading
- WHEN Startup Loading, THEN read Feature Specs + Product Spec as Layer 0 context + detect Context Mode
- WHEN Brownfield, THEN synthesize Technical Summary (module overview + patterns + constraints)
- WHEN Greenfield, THEN guide compensatory collection + suggest Knowledge generation
- WHEN delta-spec generated, THEN each REQ includes Feature/Story routing fields
- WHEN Phase ends, THEN execute Knowledge Quality Gate

#### REQ-SPEC-012: Delta-Spec Feature Routing Metadata
Each REQ in delta-spec.md adds Feature/Story routing fields, specifying which Feature Spec to write to at archive time.
- WHEN ADDED/MODIFIED REQ, THEN includes `**Feature**: {feature-name}` field
- WHEN ADDED/MODIFIED REQ, THEN includes `**Story**: US-{N}` field
- WHEN Plan Skill generates delta-spec, THEN routing fields auto-populated

#### REQ-TEMPLATES-041: Plan Brownfield/Greenfield Detection
- WHEN >= 2 modules with README.md, THEN Brownfield Mode
- WHEN < 2, THEN Greenfield Mode + suggest `prospec knowledge init`

#### REQ-TEMPLATES-042: Plan Technical Summary (Brownfield)
- WHEN Brownfield, THEN plan.md includes module overview table + existing patterns + architecture constraints

#### REQ-TEMPLATES-043: Plan Technical Context (Greenfield)
- WHEN Greenfield, THEN plan.md includes tech stack detection + structure scan + [TBD] markers

#### REQ-TEMPLATES-044: plan-format.hbs Technical Summary Section
- WHEN referenced, THEN includes Brownfield/Greenfield mutually exclusive formats
- WHEN produced, THEN only one format appears
- WHEN referenced, THEN also includes an optional, additive "External Library Usage" subsection (on-demand, untrusted) that does not alter the mutually-exclusive Brownfield/Greenfield formats

---

## US-4: Decompose Task List [P0]

As a developer using Prospec,
I want to auto-decompose the implementation plan into an executable task list ordered by architecture layer,
so that I can implement step by step, track progress, and estimate effort.

**Acceptance Scenarios:**
- WHEN running `/prospec-tasks` THEN tasks.md is grouped by architecture layer (Types → Lib → Services → CLI → Tests)
- WHEN a task is parallelizable THEN mark it `[P]`
- WHEN each task THEN include a `~{lines} lines` complexity estimate and checkbox format

### Behavior Specifications

#### REQ-CHNG-011: Decompose Plan into Tasks
`/prospec-tasks` decomposes into a tasks.md grouped by architecture layer. Its plan.md prerequisite is scale-conditional: the `prospec change tasks` CLI reads the light-scale artifact registry instead of assuming every change has a plan.
- WHEN plan.md valid, THEN tasks.md groups by architecture layer
- WHEN parallelizable, THEN mark `[P]`
- WHEN design-spec.md exists, THEN UI tasks annotated for MCP design reading
- WHEN `scale: quick`, THEN the plan.md prerequisite is skipped and tasks are decomposed from proposal.md, advancing `story → tasks`
- WHEN `scale: backfill`, THEN the station refuses: backfill records existing code and its contract forbids tasks.md

#### REQ-CHNG-012: Architecture Layer Ordering
Ordering: Types → Lib → Services → CLI → Tests; use a Templates grouping when only templates change.

#### REQ-CHNG-013: Estimate Task Complexity
Each task includes a `~{lines} lines` estimate, and the Summary includes the total.

#### REQ-CHNG-014: Checkbox Task Format
Tasks start with `- [ ]`, completed marked `- [x]`; an optional kind marker `[M]` (manual) / `[V]` (verification), no marker means code, coexisting with `[P]` (`[P]` first). The definition is frozen in the tasks-format reference.

#### REQ-CHNG-015: Task Summary Statistics
tasks.md ends with a Summary section (total tasks, total lines, parallelizable count).

#### REQ-CHNG-016: Plan Status Update
- WHEN plan complete, THEN metadata status → `plan`
- WHEN tasks complete, THEN metadata status → `tasks`

---

## US-5: Verify Implementation Compliance [P0]

As a developer using Prospec,
I want to run a comprehensive verification after implementation to confirm spec compliance, Constitution adherence, and Knowledge consistency,
so that quality is assured before archiving.

**Acceptance Scenarios:**
- WHEN running `/prospec-verify` THEN compare Feature Spec requirements against ai-knowledge descriptions, and assess Spec Health
- WHEN each requirement THEN show PASS/WARN/FAIL
- WHEN `ui_scope != none` and design-spec.md exists THEN additionally run design consistency verification
- WHEN a dimension has a mechanical oracle (task completion, Knowledge, tests) THEN its verdict is the `prospec check` engine's, adopted verbatim — the agent interprets and narrates it but never re-grades it
- WHEN a dimension has no mechanical oracle (delta-spec compliance, design consistency) THEN it is graded in fresh context by a reviewer that does not share the implementation's context, and a harness that cannot spawn one must disclose the degradation as a WARN
- WHEN a machine check cannot run THEN its dimension is reported `not-adjudicated` (never PASS), grade S becomes unreachable, and that WARN counts against grade A's budget like any other

### Behavior Specifications

#### REQ-TEMPLATES-034: Verify Skill Knowledge↔Implementation Consistency
- WHEN triggered, THEN verify dimension 4/5 takes its verdict from the `knowledge-health` check verbatim and grades ONLY pre-existing Knowledge drift (module READMEs vs code not touched by this change); semantic observations may be ADDED as WARN detail but never overturn the machine verdict
- WHEN a README describes behavior the code lacks (beyond this change's gap) or an existing module has no README at all, THEN graded WARN/FAIL (remediate via /prospec-knowledge-update or /prospec-knowledge-generate)
- WHEN this change's knowledge gap (delta-spec REQ not entered into README / README not updated / a module newly added by this change has no README yet), THEN informational only — not counted toward the grade, points to the `/prospec-archive` Entry Gate
- WHEN a permanent Feature Spec lags an un-archived change, THEN informational only (graduates at /prospec-archive) — not drift, does not affect grade
- WHEN an already-archived capability regresses or Feature Spec Health (Density/Freshness/Consistency) degrades, THEN informational signal for the developer, not grade-blocking
- WHEN ui_scope != none + design-spec.md exists, THEN execute design consistency check

#### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the **verify S/A commit prompt** (folding the sync in before commit; the archive Entry Gate is the backstop) (not counted toward the grade)
- WHEN the `prospec check --json` report is available, THEN staleness is **adjudicated** by its `structural.knowledge_health` section (git timestamps, deterministic) — verify adopts that verdict and never re-derives it; when unavailable the dimension is `not-adjudicated` + WARN (S unreachable), never replaced by LLM judgment

#### REQ-TEMPLATES-063: Verify Grades Constitution by Severity
verify Verification 3/5 reports by RFC-2119 severity grading of rules; the grade vocabulary stays PASS/WARN/FAIL (no fourth state added). The rule list and severities are taken from the report's `structural.constitution.rules[]` inventory — never re-derived or re-assigned — and the audit is 1:1 against it (statement count ≥ entry count), so a principle cannot be silently skipped.
- WHEN a principle carries `[MUST]`/`[SHOULD]`/`[MAY]`, THEN map a violation MUST→FAIL, SHOULD→WARN, MAY→informational (does not affect grade)
- WHEN the Constitution is free-text without severity tags, THEN fall back to judgment-based PASS/WARN/FAIL (backward-compatible)

#### REQ-TEMPLATES-153: [Verify dimension adjudication split + two-ledger grade]
`prospec-verify` labels every dimension with its adjudicator — `[machine]` for 1/5, 4/5, 5/5, `[judgment]` for 2/5 and 6, `[mixed]` for 3/5 — and states the division once in `## Key Difference from Other Skills`. A machine dimension's verdict is the engine's, adopted verbatim; the NEVER list forbids overturning it and forbids reporting `not-adjudicated` as PASS. The report presents the two ledgers separately before the merged grade, and the grade itself is computed by `prospec verify record` from the same decision table rather than by hand. The contract tests (`skill-format.test.ts`) covering the Grade A's WARN budget text must be resilient to semantic rewrites (such as `at most two WARNs` instead of `≤ 2 WARN`).
- WHEN a machine dimension FAILs, THEN the grade is capped below S/A no matter how the narrative reads, and no number of judgment PASSes offsets it
- WHEN a machine check honestly skips, THEN the dimension is `not-adjudicated`, grade S is unreachable, and that WARN consumes grade A's budget like any other — every WARN counts, because the CLI is a required file: an unreachable engine is a probe STOP, not a gradable state
- WHEN `quality_log` is written, THEN each `dimensions[]` entry carries its `adjudicator`

#### REQ-TEMPLATES-154: Verify 5/5 and 3/5 consume the new engine facts
Core Workflow **Step 0** runs `prospec check --record-tests` — after the Entry Gate (it costs a suite run and mutates metadata, so a change the gate is about to refuse must not pay for it) and after the last code edit — then re-runs `prospec check --json` because the copy read at startup predates the record. 5/5 is adjudicated by the `test-provenance` check; 3/5 audits 1:1 against `structural.constitution.rules[]`.
- WHEN the recorded run failed, THEN 5/5 is FAIL and may not be re-graded as a WARN; under `scale: backfill` a *missing* run stays informational but a recorded non-zero exit is never suppressed
- WHEN no test command resolves, THEN the check `skipped` makes 5/5 `not-adjudicated` with `tech_stack.test_command` named as the fix
- WHEN a principle's inventory severity is `null`, THEN grade it by judgment (backward-compatible with a free-text Constitution)

#### REQ-TEMPLATES-155: Verify 2/5 and 6 require fresh context, with degradation disclosed
Both judgment dimensions are graded by an independent reviewer that does not share the implementation's context — a grader that just implemented the change validates its own reasoning, not the change against the spec. The degraded path offers a fresh single-pass review or the harness's own reviewer command, and only when neither is available does 2/5 grade in-session and record the disclosure WARN; the NEVER list forbids grading them silently in-session. Whether the harness can provide fresh context is not the skill's judgment: 2/5's harness section renders from the shared `harness-capabilities` partial against the sync-resolved capability flags, with verify supplying only its own degraded action, and dimension 6 cross-references 2/5 instead of restating it.
- WHEN `scale: quick`, THEN 2/5 stays `not-applicable` — neither the mechanization nor the fresh-context requirement turns it into a FAIL
- WHEN 2/5 is rendered, THEN its harness wording comes from the shared partial, not from verify-specific capability prose
- WHEN no fresh context is available, THEN 2/5 is graded in-session and the disclosure WARN is recorded on that branch
- WHEN dimension 6 degrades, THEN it points at 2/5's disclosure rather than carrying a second copy

#### REQ-TEMPLATES-156: review / verify division of labour stated once
`/prospec-review` is open-ended defect discovery (unbounded search, necessarily probabilistic); `/prospec-verify` is closed-ended contract checking (bounded comparison, mechanical wherever an oracle exists). The statement lives **only** in `prospec-verify`; `prospec-review` keeps a one-line pointer and its own major→WARN contract, and its spec-architecture lens covers REQ *contradiction* while completeness stays verify's 2/5.
- WHEN the two skill templates are rendered, THEN the boundary statement occurs exactly once across both (contract-asserted, mutation-verified)

#### REQ-TEMPLATES-157: Reference and shipped-template contract sync
`references/drift-report-format` documents the two new check ids, the `structural.constitution` section, and the escaped-defect sibling report with its three distinct honesty flags; `references/metadata-format` places `test_provenance` in the canonical field order and records the dimension vocabulary plus `adjudicator`; `init/status-lifecycle.md.hbs` and `prospec/ai-knowledge/_status-lifecycle.md` both state that the `implemented → verified` gate's machine dimensions are engine-adjudicated.
- WHEN the reference lists check ids, THEN the set is machine-pinned to `DRIFT_CHECK_IDS`, not hand-listed
- WHEN either lifecycle copy is edited, THEN both state the same gate semantics, and the `§What each gate checks` section is byte-identical across the two copies (the contract test pins exactly that section; other sections may differ in wording)

#### REQ-TESTS-057: Report contract, skill contract and CLI integration tests
Frozen count 11 → 13 plus an **unsorted** literal assertion pinning the pre-existing eleven ids in order; skipped-never-PASS across 13 checks; section-scoped verify-template assertions (adjudicator labels, the two new NEVERs, the `not-adjudicated` contract, the 1:1 inventory rule, the closed engine-unavailability WARN class with a structure-aware sweep asserting every `≤ 2 WARN` budget mention carries the exclusion within a bounded window — mutation-killing under annotation removal) and a cross-template count proving the boundary statement appears exactly once; prose pins are wrap-independent (whitespace-normalized via `flat()`, never a literal line-break position); formatter unit coverage for both new output paths including terminal sanitisation; service tests for the honest-skip branches, the artifact-writing convergence case and read-only purity; e2e pinning the `SKIP` state with its reason against a real git fixture (the reason string is guard-order-dependent — a repo-less fixture truthfully reports "not a git repository" instead).

---

## US-6: Archive Completed Changes [P0]

As a developer using Prospec,
I want to archive completed changes via `/prospec-archive`,
so that `.prospec/changes/` stays clean, the SDD lifecycle closes correctly, and an audit trail accumulates.

**Acceptance Scenarios:**
- WHEN running `/prospec-archive` THEN the Entry Gate checks verified status and knowledge sync, and upon passing scans and moves to `.prospec/archive/{date}-{name}/`
- WHEN archiving completes THEN generate summary.md (knowledge sync is enforced by the Entry Gate; the service layer does not auto-trigger knowledge-update/raw-scan)
- WHEN Feature Spec Sync THEN read delta-spec ADDED/MODIFIED/REMOVED and merge into `specs/features/` (Replace-in-Place)
- WHEN Feature Spec Sync writes a Change History row THEN its Change column is the archived change's name, never a fixed placeholder
- WHEN Feature Spec Sync completes THEN auto-regenerate `specs/product.md`
- WHEN archiving completes THEN summary.md (and its committed `_archived-history` copy) carries a `## Review & Verify` section, so the audit trail carries review/verify evidence and does not evaporate with the gitignored bundle
- WHEN executing the deterministic mutations THEN `prospec archive <name...>` performs them (previewable with `--dry-run`), and the skill keeps only the judgment work (Entry Gate, Review & Verify summary, REQ semantic graduation)

### Behavior Specifications

#### REQ-TYPES-010: ChangeStatus Archived Support
`archived` is a valid ChangeStatus value.

#### REQ-SERVICES-010: Archive Service (spec-history destination correction)

#### REQ-TEMPLATES-010: Archive Skill Template (explicitly lists the spec-history copy step)

#### REQ-SPEC-013: Product Spec Auto-Generation
After archive Feature Spec Sync completes, auto-synthesize `specs/product.md` from all Feature Specs.
- WHEN Feature Spec Sync completes, THEN trigger product.md regeneration
- WHEN regenerating, THEN extract frontmatter from all Feature Specs in features/
- WHEN product.md generated, THEN Feature Map links match current Feature Spec files

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
The CLI registers `prospec archive <name...>` — a thin command (parse → `archive.service.execute()` → format) executing the deterministic archive mutations. Names are required: the explicit target carries the caller's confirmation. `prospec archive finalize <name>` is its **post-judgment** sibling, carrying the two write points that can only run after the skill's work: copying the finalized `summary.md` into `specs/_archived-history/{YYYY-MM-DD}-{name}.md`, and reconciling every feature spec's frontmatter `story_count`/`req_count` against its final body. Both support `--dry-run`. Module derivation stays read-only — the archive report lists the REQ-prefix-derived affected modules, while the skill's Entry Gate derivation reads the working-tree diff and therefore has no archive-bundle equivalent.
- WHEN running `prospec archive <name>` on a verified change, THEN the bundle moves to `.prospec/archive/{date}-{name}/` with summary scaffold, mechanical Feature Spec sync, `status: archived` + `archived_at`, product.md regeneration, and feature-map bootstrap (no-clobber)
- WHEN running either command with `--dry-run`, THEN every planned mutation is printed and nothing is written
- WHEN `archive finalize` finds a `summary.md` still lacking its `## Review & Verify` section, THEN it refuses — that section is the deterministic marker that the prose overwrite happened, and finalizing earlier would commit the scaffold and count pre-graduation text
- WHEN no name is given, THEN the command exits with an error; an unknown name reports `not found` with a pointer to `prospec status`
- WHEN spec-sync preserved a REQ body instead of replacing it (REQ-SERVICES-072), THEN the command lists those REQs as the graduation worklist — under `--dry-run` too
- WHEN formatting output, THEN repo-derived strings pass `sanitizeTerminal()`; skipped/refused/not-found are failure-class output on stderr, each driving exit 1 and visible under `--quiet`

#### REQ-SERVICES-071: archive.service dry-run mode and refusal reporting
`ArchiveOptions.dryRun` short-circuits every write point of the one `execute()` flow (no parallel implementation) and returns the `planned` mutations; predictions mirror the real run's triggers (`readFeatureRoutes` — routes existing, not files written — drives the feature-map probe). The same honesty covers `executeFinalize`, whose two write points (the `_archived-history` copy and the counter reconciliation) are equally previewable and equally write-free under dry-run. Named targets are never silently filtered: a non-target-status change reports `refused {name, status, reason}` (including existing-but-unparseable metadata, `status: unknown`), a missing one reports `notFound`; `skippedReasons` carries each skip's real cause. Pre-existing no-clobber, non-fatal, and terminal-station no-schema-validation semantics are unchanged.
- WHEN running either flow with `dryRun`, THEN the filesystem is byte-identical before and after (directories included), and a subsequent real run performs exactly the predicted mutations (both directions, replay equivalence)
- WHEN a named change exists but is not `verified`, THEN the result carries `refused` with its status and reason; a nonexistent name lands in `notFound`
- WHEN a change's archive move fails mid-loop, THEN the move rolls back and `skippedReasons` carries the error message

#### REQ-TEMPLATES-159: archive skill delegates deterministic mutations to the CLI
The `prospec-archive` skill's deterministic phases delegate to `prospec archive` (dry-run preview first) and its post-judgment phase to `prospec archive finalize`; there is no CLI resolution ladder and no manual fallback — an unreachable or too-old CLI is a STOP at the shared probe. The skill's retained work is pure judgment: the Entry Gate, the Review & Verify summary, REQ semantic graduation (wording convergence, Story placement), and the semantic half of the lessons harvest.
- WHEN reading the generated SKILL.md, THEN no step hand-runs the move, hand-writes feature-map.yaml, hand-copies the summary into `_archived-history`, or hand-recounts frontmatter; `prospec archive` appears in the deterministic steps with a `--dry-run` preview and `prospec archive finalize` appears after the graduation phase
- WHEN comparing the Entry Gate against the pre-change template, THEN its items (only-verified, metadata-completeness, knowledge-sync backstop) are semantically unchanged
- WHEN `prospec archive finalize` refuses, THEN the skill reads it as "the summary overwrite is missing" and fixes that, never hand-running the two mutations instead

#### REQ-SERVICES-072: Non-destructive Feature-Spec REQ merge
`archive.service`'s delta-spec parser carries each REQ's body into `FeatureRoute` — the optional `**Spec:**` landing block plus the `**Description:**` / `**Acceptance Criteria:**` blocks — and `mergeRequirementInPlace` never blanks an authored body. A `**Spec:**` block lands verbatim (function replacer, so `$`-sequences stay literal); without one, a MODIFIED REQ keeps its existing body byte-identical and is reported in `ArchiveResult.pendingConvergence` with its reason. When a landing block DOES replace a body, the bullets it discards are reported separately in `droppedBehavior` — not blanking a body is not the same as not losing behavior. The Description/Acceptance-Criteria fallback is ADDED-only — for MODIFIED those blocks are change narrative, and landing them would overwrite an authored behavior statement with planning prose. A block ends at the next `**Label:**` line, ANY Markdown heading, a `---` rule, or the end of the entry: a heading must never be absorbed, because a landed foreign heading becomes the in-place replacement's own stop boundary and no later sync can remove it. A REMOVED REQ whose active section still stands after deprecation is reported too — `moveReqToDeprecated` only appends a bullet, so the stale body needs a human.
- WHEN a MODIFIED route carries a `**Spec:**` block, THEN the REQ's body in the feature spec is replaced by that block verbatim, and any existing `WHEN/THEN` bullet the block does not carry is reported in `droppedBehavior`
- WHEN a MODIFIED route carries no `**Spec:**` block — including one that carries `**Description:**`/`**Acceptance Criteria:**` — THEN the existing body survives byte-identical (only the title line is refreshed) and the REQ appears in `pendingConvergence`
- WHEN an ADDED route carries a `**Spec:**` block or `**Description:**`/`**Acceptance Criteria:**`, THEN the landed REQ has a body — never title-only
- WHEN a `**Spec:**` block is followed by a Markdown heading, THEN nothing from that heading onward is landed
- WHEN a REMOVED route's `#### {reqId}:` section still exists after deprecation, THEN the REQ appears in `pendingConvergence`
- WHEN a landed body contains `$&` or `$1`, THEN those characters land literally
- WHEN running with `dryRun`, THEN `pendingConvergence` and `droppedBehavior` are reported and no file is written

---

#### REQ-TEMPLATES-166: delta-spec `**Spec:**` landing-block contract
`references/delta-spec-format` defines the `**Spec:**` block as the REQ body that lands verbatim in the Feature Spec — spec form (a 1-2 sentence statement plus `- WHEN …, THEN …` bullets), written in the target Feature Spec's language, not the change-artifact language. It is REQUIRED for a MODIFIED entry (its absence means the CLI preserves the old body and reports the REQ instead of replacing it) and optional for ADDED (which falls back to Description + Acceptance Criteria). The reference also states where the block ENDS — next `**Label:**`, any Markdown heading, a `---`, or the entry's end — so "verbatim" carries its own exclusion rather than truncating silently, and it tells the author to write the RESULTING requirement rather than the delta, because for MODIFIED the block replaces the whole body and an ADDED entry reusing an existing REQ id is reported by neither worklist. Because the block's content crosses into the trust zone verbatim, the generated Language Policy rule (`lib/language-policy`) carries it as a named reverse exception: English inside the change-artifact zone. The `prospec-archive` skill's graduation phase reads BOTH CLI worklists — `pendingConvergence` (body kept, converge it) and `droppedBehavior` (body replaced, confirm what the block omitted) — rather than re-reading every touched spec.
- WHEN reading the generated delta-spec-format reference, THEN the `**Spec:**` block is defined for ADDED and MODIFIED, with the preserve-and-report fallback, the language rule, the block's end boundary, and the write-the-result-not-the-delta instruction stated
- WHEN reading the generated `prospec-archive` SKILL.md, THEN the graduation phase names both worklists — the graduation worklist and the dropped-behavior report — rather than a single one
- WHEN the Constitution's Language Policy rule is generated, THEN it names the `**Spec:**` block as a change-artifact spot that stays English (`englishExceptions`), so a MUST audit cannot read the required English as a violation
- WHEN the block definition, the fallback sentence, or the write-the-result instruction is deleted, THEN a section-scoped contract assertion turns red

---

#### REQ-TESTS-060: spec-sync body preservation and the body-less REQ debt ledger
Tests pin both the fix and the damage it already did. Fixture-driven unit tests assert that spec-sync preserves every pre-existing REQ body — including the boundary cases (a REQ that is the last h4 before an h2, before a `---`, and at EOF) and a body containing `$&`. A repo-internal debt-ledger test asserts the set of body-less REQs across `prospec/specs/features/**` is EXACTLY the documented legacy list, so a newly introduced hole and a repaired-but-still-listed hole both fail — the list can only shrink, and never silently.
- WHEN spec-sync runs over the fixture, THEN every pre-existing REQ body's line count is ≥ its pre-merge value
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

## US-7: Living Spec System [P0]

As a developer using Prospec,
I want `specs/` to be a living behavioral spec that accumulates automatically with each archive, with proposal.md fully expressing User Scenarios and acceptance criteria,
so that the spec truly becomes the Single Source of Truth for SDD.

**Acceptance Scenarios:**
- WHEN creating a Feature Spec THEN it includes Who & Why, User Stories & Behavior Specs (REQ ID + WHEN/THEN), Edge Cases, Change History
- WHEN Archive triggers Feature Spec Sync THEN merge in User Stories + add or update requirements per the format (Replace-in-Place)
- WHEN viewing `specs/` THEN a Product-First structure: `product.md` (PRD entry) + `features/` (Feature Specs)

### Behavior Specifications

#### REQ-TEMPLATES-030: Enhanced Proposal Format Reference
`proposal-format.hbs` includes 8+ sections: Why, User Stories, Acceptance Scenarios, Edge Cases, FR, SC, Related Modules, Notes.
- WHEN writing Story, THEN "As a/I want/So that" + Priority + WHEN/THEN
- WHEN open questions, THEN max 3 items

#### REQ-SPEC-010: Feature Spec Format Template
`feature-spec-format.hbs` uses User Story as the core organizing unit, demoting REQ IDs to sub-items of Behavior Specifications.
- WHEN creating Feature Spec, THEN structure: frontmatter → Who & Why → User Stories & Behavior Specs → Edge Cases → SC → Maintenance Rules → Deprecated → Change History
- WHEN User Stories section, THEN occupy ≥ 40% of total content
- WHEN Maintenance Rules, THEN define Replace-in-Place, Functional Grouping, No Inline Provenance, Deprecation over Deletion

#### REQ-SPEC-011: Product Spec Format Template
`product-spec-format.hbs` (PRD entry) includes vision, target users, feature map, and a summary of core Stories.
- WHEN product.md, THEN ≤ 80 lines, readable in 2 minutes
- WHEN Feature Map, THEN each item links to corresponding Feature Spec
- WHEN generated, THEN synthesizable from all Feature Spec frontmatter

#### REQ-SPECS-001: specs/ Directory Structure
Product-First structure: `product.md` (PRD entry) + `features/` (Feature Specs). Historical traceability is handled by the Feature Spec Change History + `.prospec/archive/`.

#### REQ-TEMPLATES-057: Proposal UI Scope Field
UI Scope optional field (full/partial/none); when none, skip the Design Phase; legacy proposals are unaffected.

#### REQ-REF-001: Reference Format Document Language Neutrality
Reference documents only define structure (English headings), and do not mandate content language. Language is controlled by the Constitution.

---

## US-8: Knowledge Quality Gate [P1]

As a developer using Prospec,
I want every SDD phase to have a quality gate that checks Knowledge loading quality,
so that the AI produces more precise artifacts.

**Acceptance Scenarios:**
- WHEN any Planning Skill completes THEN show a PASS/WARN/FAIL quality gate table
- WHEN a problem is found THEN WARN (non-blocking)
- WHEN each Skill THEN the check items differ by phase (Story: Related Modules, Plan: Context Mode, Tasks: Architecture Layers)

### Behavior Specifications

#### REQ-TEMPLATES-040: Knowledge Quality Gate Table
The 5 Planning Skills show a three-state gate table at the end of the Core Workflow, with different check items per Skill.

---

## US-9: Design Phase [P1]

As a developer using Prospec,
I want to produce visual and interaction specs from a proposal (Generate), or reverse-extract specs from a design tool (Extract),
so that the design spec becomes a precise basis for implementation.

**Acceptance Scenarios:**
- WHEN there is no design-spec.md and no design-tool design THEN Generate Mode
- WHEN there is a design-spec.md or a design-tool design THEN Extract Mode
- WHEN complete THEN produce design-spec.md + interaction-spec.md
- WHEN implementing a UI task THEN MCP-First reading of precise design values

### Behavior Specifications

#### REQ-TEMPLATES-050: Design Spec Format Reference
`design-spec-format.hbs` — platform-agnostic visual spec: Visual Identity, Components, Responsive Strategy, using tokens rather than hardcoded values.

#### REQ-TEMPLATES-051: Interaction Spec Format Reference
`interaction-spec-format.hbs` — Interaction DSL (draft-1): Screen/Component States, Transitions, Flow sequences.

#### REQ-TEMPLATES-052: prospec-design Skill Template
- WHEN triggered, THEN detect mode via proposal.md (ui_scope) + .prospec.yaml (design.platform)
- WHEN Generate, THEN produce specs from proposal
- WHEN Extract, THEN read via MCP + reverse-produce specs; ambiguous → [NEEDS CLARIFICATION]
- WHEN Phase 4, THEN verify via screenshot or structural comparison

#### REQ-TEMPLATES-053~056: Platform Adapters (pencil / Figma / Penpot / HTML)
The 4 platform adapters each define MCP operation guidance for the three phases Design/Implement/Verify:
- **pencil**: batch_design(), set_variables(), batch_get(), get_screenshot()
- **Figma**: HTML prototype → html-to-figma MCP, node detail reading, property comparison
- **Penpot**: Penpot API create/export/compare
- **HTML**: prototype/ directory (zero deps), CSS custom properties, DOM comparison

#### REQ-TEMPLATES-058: Implement Skill MCP-First Design Reading
- WHEN UI task, THEN Phase 2 loads design specs + adapter; Phase 3 reads precise values via MCP first
- WHEN no design-spec.md, THEN warn

---

## US-10: Fast-Forward Mode [P2]

As a developer with clear requirements,
I want to generate all planning artifacts at once (story → plan → tasks),
so that when requirements are clear I can advance quickly, without triggering the three skills step by step.

**Acceptance Scenarios:**
- WHEN running `/prospec-ff` THEN run story → plan → tasks in order (`scale: quick`: story → tasks, skipping plan)
- WHEN any phase fails THEN stop and report progress
- WHEN all complete THEN metadata.yaml status: `tasks`

---

## US-11: Skill Output Self-Assessment (Output Contract) [P1]

As a developer using Prospec,
I want every Skill to tell me explicitly on completion whether it "succeeded" or "where it fell short",
so that I can judge output quality without checking the artifact line by line, and so downstream phases (verify / review / feedback promotion) have structured success/failure signals to consume.

**Acceptance Scenarios:**
- WHEN any Skill finishes THEN emit a concise Output Summary (Met N/M + unmet items + overall PASS/WARN/FAIL)
- WHEN defining Success Criteria THEN each is objectively decidable (file/grep/test/count); those not mechanically decidable are marked (manual)
- WHEN any skill's Output Contract section is removed THEN the contract test turns red

### Behavior Specifications

#### REQ-TEMPLATES-060: Skill Output Contract Section
The 11 skill templates each contain `## Output Contract` (Success Criteria + Failure Conditions), placed before `## NEVER`; the deployed SKILL.md is kept in sync via agent sync.
- WHEN a skill template renders, THEN it contains `## Output Contract` with `### Success Criteria` + `### Failure Conditions`
- WHEN a non-artifact skill (explore), THEN success is defined by observable outcome, not artifact conditions

#### REQ-TEMPLATES-061: Output Summary and Objective Criteria
Each skill emits a uniform-format Output Summary at the end, using PASS/WARN/FAIL vocabulary; Success Criteria are objectively decidable.
- WHEN a skill finishes, THEN it emits `Met N/M | Unmet: ... | Overall: PASS|WARN|FAIL | Next: ...`
- WHEN it is a linear-flow skill (plan→tasks→implement→review→verify→archive), THEN the `Next:` field carries the status-aware Next-Step Handoff (REQ-TEMPLATES-098)
- WHEN a criterion is not mechanically checkable, THEN it is marked (manual), not faked as PASS

#### REQ-TESTS-001: Output Contract Contract Test
`skill-format.test.ts` verifies that each skill contains an Output Contract section (heading-scoped assertions).
- WHEN the contract test runs, THEN every SKILL_DEFINITIONS skill asserts `### Success Criteria` + `### Failure Conditions`
- WHEN a skill's Output Contract section is removed, THEN its assertion turns red

---

## US-12: Entry/Exit Dual Gates and Cross-Phase Quality Traceability [P1]

As a developer using Prospec,
I want each Skill to run a blocking precondition check at startup (Entry Gate), and at completion do a three-tier Constitution check and record WARN/FAIL into quality_log (Exit Gate),
so that low-quality preconditions are not carried into the next phase, and unresolved problems can be traced and converge across Skills (the more you use it, the more accurate it gets).

**Acceptance Scenarios:**
- WHEN a Skill starts and a prior artifact is missing/incomplete or the Constitution is empty THEN Entry Gate FAIL, block and explain what is missing
- WHEN a Skill finishes THEN the skill-end summary includes three-tier Constitution results (consuming BL-031 severity); FAIL attaches recommendations but is advisory and does not hard-block
- WHEN the Exit Gate produces WARN/FAIL THEN record it into `metadata.yaml` quality_log; the next Skill's Entry Gate reads it and displays prior unresolved WARNs

### Behavior Specifications

#### REQ-TYPES-022: quality_log Metadata Field
The `ChangeMetadataSchema` optional `quality_log` entry: `skill`/`date`/`result`/`warnings[]`, additionally carrying optional structured fields `grade` (enum S/A/B/C/D), `dimensions` (`{name, result: PASS|WARN|FAIL|not-applicable|not-adjudicated, adjudicator?: machine|judgment}[]`), `criticals_found`/`criticals_fixed`/`majors` (int≥0) — so verify grade + dimensions and review counts can be machine-aggregated. `result` retains `GATE_RESULTS` (PASS/WARN/FAIL) gate semantics; grade goes in the separate `grade` field and does not override result.
- WHEN metadata contains quality_log (including the new structured fields), THEN the schema accepts it and the types are correct
- WHEN metadata omits quality_log or omits the new structured fields, THEN it still passes validation (backward-compatible)
- WHEN result is not PASS/WARN/FAIL, THEN reject (no fourth result state added)
- WHEN grade is not S/A/B/C/D, THEN reject
- Note: metadata.yaml is read losslessly via `parseYaml(doc.toJS())` (not `.parse()` on read through this schema); persistence relies on round-trip, and this field is a type contract

#### REQ-TEMPLATES-064: Entry Gate (Blocking Preconditions)
new-story / plan / tasks / ff / verify each contain `## Entry Gate`: a phase-appropriate precondition check (prior artifact complete, Constitution non-empty, read quality_log for prior unresolved WARNs). Entry FAIL blocks and explains; reuses the existing status-lifecycle, adding no separate audit.
- WHEN rendered, THEN all 5 skills contain `## Entry Gate` with a phase-appropriate precondition checklist
- WHEN preconditions are insufficient (missing artifact / empty Constitution / prior unresolved WARN), THEN Entry Gate FAIL, block and explain
- WHEN any skill's Entry Gate is removed, THEN the corresponding contract test turns red

#### REQ-TEMPLATES-065: Exit Gate Folded into Skill-End (site-specific for non-verify)
The skill-end summary folds in the Exit Gate: **non-verify** sites narrow "compare against the whole Constitution" to that site's **site-specific rule** (review→dependency/layering, learn→promotion-approval, new-story→INVEST, plan→dependency-direction, tasks→TDD), still consuming BL-031 severity (MUST→FAIL/SHOULD→WARN/MAY→informational) and recording WARN/FAIL into metadata `quality_log` (US-12 cross-phase traceability unchanged); verify's Exit Gate keeps the full whole-Constitution audit (the only full-audit site, REQ-TEMPLATES-133). Exit is advisory, not hard-blocking.
- WHEN a non-verify skill finishes, THEN the skill-end summary includes **site-specific** Constitution results (graded by severity), not a whole full audit
- WHEN there is a WARN/FAIL, THEN record it into `quality_log`; Exit does not hard-block the flow
- WHEN the Constitution is free-text (no severity), THEN fall back to ungraded reading (backward-compatible)

#### REQ-TESTS-022: Gate + quality_log Tests
The contract test verifies that 5 skills contain `## Entry Gate` and a folded-in Exit Gate; the unit test verifies the `quality_log` schema (accept/omit/result three-state/lifecycle including `implemented`, plus the structured grade/dimensions/criticals count fields).
- WHEN the contract test runs, THEN assert the presence of Entry/Exit Gates for new-story/plan/tasks/ff/verify
- WHEN the unit test runs, THEN quality_log may be omitted, the entry-level result is limited to PASS/WARN/FAIL, grade is limited to S/A/B/C/D, a dimension result additionally accepts `not-applicable`/`not-adjudicated` (both rejected at entry level), `adjudicator` is optional and two-valued, the new structured fields may be omitted and are correctly typed, and all 6 lifecycle states (including implemented) pass; the result three-state is not replaced by grade (mutation-verified)

#### REQ-TYPES-058: ChangeMetadata introduced_by escaped-defect registration field
`ChangeMetadataSchema` adds an optional `introduced_by` (string, pointing back to the change name that let this defect escape), so per-gate escaped-defect rate can accumulate; `_status-lifecycle.md` (and the shipped `init/status-lifecycle.md.hbs`) documents its format convention and example. It only registers a convention, performing no referential-integrity validation and adding no drift enforcement.
- WHEN metadata contains introduced_by, THEN the schema accepts it; omitting it still passes (backward-compatible)
- WHEN consulting the convention doc, THEN hit the introduced_by definition + example (the shipped template uses a consumer-agnostic example; the project doc uses issue #48 → fix-init-clobber-add-upgrade)

#### REQ-TEMPLATES-145: verify/review write structured quality_log fields
The structured fields' semantics are unchanged — `grade` (S/A/B/C/D) plus `dimensions` (5+1 per-dimension result with its `adjudicator` — `machine` for task completion/Knowledge/tests, `judgment` for delta-spec/Constitution/design) for verify, and `criticals_found`/`criticals_fixed`/`majors` per review round — but the **writer** is the CLI: `prospec verify record` for the verify entry, `prospec change log` flags for each review round. The skill supplies structured input only. `result` still records the gate three-state, and `metadata-completeness` still reads only `grade` (`dimensions`/counts are for aggregation, read by no check).
- WHEN verify records its verdict, THEN `prospec verify record` writes `grade` + `dimensions` and no YAML is hand-serialized by the skill
- WHEN a review round closes — a clean round included — THEN the skill passes `--criticals-found`/`--criticals-fixed`/`--majors` to `prospec change log`
- WHEN verify writes, THEN `result` is still PASS/WARN/FAIL (grade does not override result)

#### REQ-TYPES-066: metadata test_provenance + dimension adjudicator vocabulary
`ChangeMetadataSchema` gains an optional `test_provenance` (`command`/`exit_code`/`digest`/`date`), positioned between `review_provenance` and `introduced_by` in the canonical field order and written only by `prospec check --record-tests`. `DIMENSION_RESULTS` gains `not-adjudicated` — the machine adjudicator could not run — kept distinct from `not-applicable` (the dimension is moot); `QualityDimensionSchema` gains an optional `adjudicator`. The gate-level `result` stays the three-state.
- WHEN metadata omits `test_provenance`, THEN it still validates (every pre-existing archived change stays legal)
- WHEN a recorded run failed, THEN the non-zero `exit_code` is preserved (a failing suite is the fact the check grades)
- WHEN `test_provenance` is absent, THEN `metadata-completeness` is unaffected — it is deliberately outside the required-field floor, so no change archived before the field existed retroactively fails

---

## US-13: Adversarial Code Review → Fix Loop [P1]

As a developer using Prospec,
I want an independent adversarial code review → fix loop between implement and verify,
so that critical issues are caught before being graded "deployable", without manually feeding back review results, and the commit history is review-clean by construction.

**Acceptance Scenarios:**
- WHEN all tasks are complete (status: implemented) THEN `/prospec-review` can be triggered, with an independent fresh-context reviewer reviewing the entire change diff relative to the branch base
- WHEN review reports a critical THEN an independent verifier first confirms its existence; only when confirmed and drop-in is it auto-fixed, re-run tests to keep green, re-review until no critical or hitting the hard cap (3, cap 5), otherwise escalate to a human
- WHEN review reports a major THEN do not auto-fix, downgrade to WARN and pass to verify via `quality_log` (not counted toward grade); nits are dropped directly
- WHEN the execution environment does not support sub-agents THEN offer a choice (harness reviewer or single-round fresh-context), not a silent skip

### Behavior Specifications

#### REQ-TYPES-023: Register prospec-review Skill
`SKILL_DEFINITIONS` adds the 12th skill `prospec-review` (type `Execution`); `agent-sync`'s `getSkillReferences` referenceMap adds `prospec-review → review-format`. No new metadata schema — review's cross-phase signal goes through the existing `quality_log`.
- WHEN `prospec agent sync`, THEN deployed includes `prospec-review/SKILL.md` + `references/review-format.md`
- WHEN registered, THEN `SKILL_DEFINITIONS` is 12 skills

#### REQ-TEMPLATES-066: Adversarial Review→Fix Loop Skill
`prospec-review` uses a fresh-context reviewer to review the change diff between implement→verify; reviewer mode B by default / A opt-in; the **spec-architecture lens** (delta-spec REQ / dependency direction / conventions / ripple) is always layered on; a critical is drop-in auto-fixed after an independent verifier confirms it, escalating to a human after the hard cap. What the harness can do is not the skill's judgment: the harness-degradation section renders from the shared `harness-capabilities` partial against the agent's sync-resolved capability flags, and the skill's own prose supplies only review's degraded action.
- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate
- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human
- WHEN findings persist, THEN land them in `review.md` keyed by the reviewer-supplied `id` (severity taken as the maximum, rows carried forward across rounds) — identity is never inferred from Location
- WHEN the skill is rendered, THEN its harness section states the resolved capabilities rather than asking the agent to determine them
- WHEN `can_spawn_subagent` is false, THEN the rendered skill names the degraded path directly, instructs no spawn anywhere, and offers reviewer mode A only where the flag resolves to yes
- WHEN review degrades for any reason, THEN the choice is disclosed to the developer — never a silent skip

#### REQ-TEMPLATES-067: Review Severity Contract + review.md Format
`references/review-format.md` defines the severity criteria and review.md structure. critical = real defect/security + dependency-direction violation + logical contradiction with a delta-spec REQ (completeness left to verify); major = perf/maintainability (does not block, downgraded to WARN, not counted toward grade); nit dropped.
- WHEN referenced, THEN it includes the three-tier criteria + auto-fix boundary + review.md fields (location/severity/lens/status) + reviewer-lens definitions
- WHEN referenced, THEN it states the identity rule the merge command implements — the id is the reviewer's, an unknown id opens a new row unless the row it would land on carries no id either, and an omitted id costs cross-round tracking (keying on location+lens against pre-round rows) without ever collapsing two id-less findings of one round into a single row

#### REQ-TEMPLATES-068: Unified Commit Boundary After verify(S/A)
The commit boundary is unified to after "the last gate that could require changing code" = after verify reaches S/A; implement defers commit, and verify **prompts the user** to commit after S/A (folding implement+review+verify fixes into a single atomic-by-feature commit); **prospec does not auto-commit**.
- WHEN implement completes, THEN do not recommend an immediate commit, direct toward review→verify
- WHEN verify S/A, THEN prompt the user to commit, do not auto-commit; review and verify each judge layering independently

#### REQ-TESTS-023: prospec-review Contract Tests + Commit-Boundary Assertions
The contract verifies skill count 12, the `prospec-review` structure (**section-scoped** assertions), implement's deferred commit, and the post-S/A commit prompt in verify.
- WHEN contract runs, THEN assertions are section-scoped; removing any key section of prospec-review (loop/persistence) turns red (mutation-verified)

---

## US-21: Dependency-Layer Knowledge (on-demand Context7) [P3]

As a developer using Prospec,
I want, when plan/implement touches a third-party library, to optionally fetch current usage from Context7 MCP (if available) and inject it into the Technical Summary,
so that the implementation is grounded in correct API usage, and the workflow is not coupled to an external service.

**Acceptance Scenarios:**
- WHEN a change touches a third-party lib and Context7 is available, THEN plan Phase 4 injects an External Library Usage subsection into the Technical Summary (marked untrusted)
- WHEN a task touches a third-party lib (including `scale: quick` with no plan) and Context7 is available, THEN implement Phase 3 queries on-demand for reference before writing code
- WHEN Context7 is unavailable / returns no results, THEN skip silently + a one-line informational (not WARN/FAIL/gate/block)
- WHEN the step exists, THEN it never enters the `[STABLE]` Startup Loading prefix, its output is not executed, and it acts as no gate

#### REQ-TEMPLATES-101: Plan On-Demand Context7 Injection
An optional, in-phase, scope-guarded step in `prospec-plan` Phase 4 — when a third-party lib is touched and Context7 is available, resolve-library-id/query-docs fetches a snippet and injects it into the Technical Summary.
- WHEN a third-party lib is touched and Context7 is available, THEN inject an External Library Usage subsection (untrusted, provider-neutral short name, not a Startup Loading item)
- WHEN there is no third-party lib or no Context7, THEN do not query

#### REQ-TEMPLATES-102: Implement On-Demand Context7 Lookup
An optional, per-task lazy block in `prospec-implement` Phase 3 (mirroring the For UI tasks shape), explicitly noting `scale: quick` (no plan/Technical Summary) as the primary beneficiary path.
- WHEN a task touches a third-party lib and Context7 is available, THEN fetch usage on-demand as an untrusted reference before writing code
- WHEN startup, THEN do not batch-load (per-task lazy)

#### REQ-TEMPLATES-103: Dependency-Layer Graceful / Untrusted / Non-Gating Contract
The plan/implement Context7 step degrades gracefully: unavailable/no-result means skip silently + a one-line informational; output is untrusted, not executed, and acts as no gate; both skills' NEVER sections document this contract.
- WHEN Context7 miss/unavailable, THEN skip silently + informational (not WARN/FAIL/gate/block)
- WHEN a snippet is injected, THEN do not execute it, and it acts as no verify/review gate

#### REQ-TESTS-027: Dependency-Layer Section-Scoped + Mutation-Verified Contract
`tests/contract/skill-format.test.ts` section-scoped pins the steps and wording of REQ-TEMPLATES-101/102/103, mutation-verified; includes a negative assertion confirming no `[STABLE]` item was added.
- WHEN contract runs, THEN slice from the corresponding plan/implement sections and verify the steps + graceful/untrusted/non-gating wording
- WHEN any step is removed, THEN the corresponding assertion turns red; Startup Loading does not include Context7 (negative)

---

#### REQ-TESTS-033: archive spec-history destination contract pin

---

## US-26: Scale Honesty and Ceremony Pruning [P1]

As a developer and maintainer running the SDD pipeline,
I want `scale: quick` to genuinely reduce weight downstream, ceremony fields with no consumer to be downgraded, and rules across skills to not contradict each other,
so that process weight is proportionate to change size, and the agent never faces instructions where "any choice violates something".

**Acceptance Scenarios:**
- WHEN running `/prospec-verify` on `scale: quick`, THEN Startup Loading omits the plan/delta-spec/Feature-Spec comparison items, the report converges to a condensed table (2/5 shows `not-applicable`), and the applicable dimensions still run in full
- WHEN running `/prospec-archive` on `scale: quick`, THEN it is not net-heavier than standard (the quick-specific steps are a diff-sourced substitute for delta-spec, not extra ceremony)
- WHEN decomposing tasks, THEN `[P]`/`~lines` are not required gate fields (the `[M]`/`[V]` kind markers remain required)
- WHEN creating a Story, THEN the per-item INVEST audit is advisory (not hard-blocking; INVEST is still a Constitution `[MUST]`, enforced at the verify full audit)
- WHEN reviewing the five SDD skills, THEN the full Knowledge Quality-Gate table lives only in `/prospec-verify`, and the other four sites are a one-line indicator note
- WHEN comparing the commit instructions of implement and verify, THEN they are consistent: the commit boundary is the single verify S/A commit point (no checkpoint-commit concession)

#### REQ-TEMPLATES-134: verify quick scale-aware reduction
`/prospec-verify` takes a scale-aware branch for `scale: quick`: skip the Startup Loading plan/delta-spec/Feature-Spec comparison items, 2/5 `not-applicable`, emit a condensed report; the 1/3/4/5 dimensions still run in full (reduce ceremony, not applicable dimensions).

#### REQ-TEMPLATES-135: archive quick is not net-heavier than standard
`/prospec-archive`'s quick-specific steps (diff-path module derivation, spec-impact determination) are positioned as a diff-sourced substitute for standard's delta-spec (parity of purpose; the diff only exists after implement, and cannot come earlier), not extra ceremony; the real point of quick's reduction is in verify.

#### REQ-TEMPLATES-136: `[P]`/`~lines` downgraded to optional
`/prospec-tasks`'s `[P]` parallel marker and `~{lines}` estimate are moved out of the required context of Phase Gate / Failure Condition / NEVER (no skill gates on them; implement's `[P]` is a best-effort reminder); the `[M]`/`[V]` kind markers remain required.

#### REQ-TEMPLATES-137: per-item INVEST audit downgraded to advisory
`/prospec-new-story` Phase 6's per-item INVEST audit is downgraded to advisory (recorded in `quality_log`, not hard-blocking); INVEST remains a Constitution `[MUST]` (the six-criteria table is unchanged), with authoritative enforcement at the `/prospec-verify` full audit.

#### REQ-TEMPLATES-139: Knowledge Quality-Gate table dedup
The Knowledge Quality-Gate table for new-story/plan/tasks/implement converges to a one-line pass/warn indicator note (recorded in `quality_log`); the full table remains only in `/prospec-verify` (no loss of information).

#### REQ-TEMPLATES-140: implement/verify commit semantics unified
Remove the checkpoint-commit concession parenthetical from `/prospec-verify`, aligning with implement's "commit boundary = single verify S/A commit point"; no commit during implement.

---


## US-30: A Landing Block Never Drops Behavior Silently [P1]

As a developer graduating a change into the permanent capability record,
I want the archive to report the authored `WHEN/THEN` bullets a `**Spec:**` block replaced without restating,
so that behavior leaving the trust zone is visible at the moment it happens instead of being discovered — or never discovered — much later.

**Acceptance Scenarios:**
- WHEN a `**Spec:**` block replaces a MODIFIED REQ's body and omits an existing bullet, THEN that bullet is reported under its REQ and the Phase 3.5 gate holds until it is confirmed deliberate or restored
- WHEN the replacement restates every existing bullet, THEN nothing is reported and no ceremony is added
- WHEN the replacement carries the same number of bullets as the original but different content, THEN the full set difference is still reported — the detection is a set difference, never a count
- WHEN a bullet differs only by indentation or reflow, THEN it is not reported as dropped; when one is reported, its text is the source text, so what the author restores is what their file said

### Behavior Specifications

#### REQ-SERVICES-073: Report behavior dropped by a landing block
`archive.service`'s in-place REQ merge reports the behavior a landing block discards. When a `**Spec:**` block replaces a MODIFIED REQ's body, the skipped body's `WHEN … THEN …` bullets are diffed as a SET against the replacement's bullets — never by count, since an equal-count replacement can still drop every original bullet — and any bullet absent from the replacement is reported per REQ in `SpecSyncResult.droppedBehavior`. This is a non-fatal worklist alongside `pendingConvergence`, whose meaning (body preserved, converge by hand) is deliberately not overloaded. Paragraph-level prose outside bullets is out of scope and is not reported.
- WHEN a landing block replaces a body and an existing `WHEN/THEN` bullet is absent from it, THEN that bullet is reported under its REQ in `droppedBehavior`
- WHEN the replacement covers every existing bullet, THEN `droppedBehavior` is empty for that REQ
- WHEN the replacement has the same number of bullets but different content, THEN the full set difference is still reported
- WHEN running with `dryRun`, THEN `droppedBehavior` matches a real run and nothing is written
- WHEN a REQ's existing body carries no bullets, THEN nothing is reported for it

---


#### REQ-CLI-032: Archive output lists dropped behavior in full
`archive-output` renders `droppedBehavior` after the `pendingConvergence` worklist, listing each dropped bullet under its REQ as written in the source (terminal-sanitised, like every other rendered path) — a count alone cannot tell a reader whether the behavior needs restoring. An empty result renders nothing.
- WHEN `droppedBehavior` is non-empty, THEN each REQ and each dropped bullet's original text is printed
- WHEN it is empty, THEN no dropped-behavior section is printed
- WHEN running with `dryRun`, THEN the same REQs and bullets are listed — under `--dry-run` too, phrased as a preview

---


#### REQ-TEMPLATES-168: Phase 3.5 gate confirms each dropped bullet
`/prospec-archive`'s Phase 3.5 gate carries one item for dropped behavior: every bullet the CLI reported as discarded is either confirmed deliberate or restored into the new body before graduation passes. An empty report satisfies the item with no added ceremony.
- WHEN the CLI reports dropped bullets, THEN graduation does not pass until each one is confirmed or restored
- WHEN nothing was dropped, THEN the gate item is satisfied automatically

---


#### REQ-TESTS-064: Dropped-behavior detection is pinned by set-difference fixtures
The dropped-behavior detection is pinned by set-difference fixtures rather than counts: a real before/after body from the change that motivated it, an equal-count-different-content case that a count-based check would pass, and a superset case that must report nothing.
- WHEN the equal-count fixture runs against a count-based implementation, THEN the test fails
- WHEN the replacement is a superset of the existing bullets, THEN the test asserts an empty report
- WHEN each new assertion class is mutated, THEN it turns red

---


#### REQ-TEMPLATES-169: mutation claims are named in the finding; vacuous passes are a lens criterion
A review finding that claims mutation verification NAMES the mutations actually applied and whether each turned the test red. This is a finding-content rule in the review.md format, not a criterion applied to the change: an unnamed mutation set is indistinguishable from none, and the recurring false-green failure is not that verification is skipped but that the mutations are chosen by whoever wrote the assertion, so making the choice visible is what changes the default. Separately, the test-quality lens rates a **vacuous pass** — an assertion whose slice, glob, or collection can be empty while the expectation still holds — as `major`, the same weight as an unmutated assertion class, because a mutation that makes extraction return nothing satisfies such a test.
- WHEN a finding reports mutation verification, THEN it names the mutations applied and whether each turned the test red
- WHEN an assertion holds over an empty slice or collection, THEN the test-quality lens rates it `major`
- WHEN the mutation-naming rule is stated, THEN it sits in the finding format rather than the criteria table, and the table points to it

---


#### REQ-TESTS-066: Mutation testing ships as an on-demand audit, pinned as a non-gate
Mutation testing ships as an on-demand deep audit, never as a gate. `pnpm mutate <path>` runs Stryker over that path — a path is required — and reports the mutation score with its surviving mutants; the config declares its runner plugin explicitly, which pnpm's strict layout requires, and defaults `mutate` to the measured reference module so a bare run stays bounded. Its cost is documented as measured figures with the driver named as a PRODUCT of two factors, neither of which predicts it alone: the number of STATIC mutants (those in module-level code, which force a module reload so per-test coverage analysis cannot narrow them) times the runtime of the module's DEPENDENT SUITE (what one un-narrowed run costs). The documented figures name the machine they were taken on and are cited as ratios, never as portable absolutes — a 2-mutant module over a 57-test suite finishes in seconds while a 57-mutant module, 26 of them static, over a 416-test suite runs into minutes; disabling static mutants makes that second case roughly 8x faster at the cost of leaving those 26 untested and reported as survived, which drops the score by about half. Timeouts arise from the same product, and Stryker scores a timeout as killed, so scores are not comparable across machines. A contract assertion enumerates every file under `.github/workflows/` and fails if any carries a mutation step. Surviving mutants are a signal to read, not a defect list: equivalence is a human judgment the tool cannot make.
- WHEN `pnpm mutate` is run against a path, THEN it reports that path's mutation score and surviving mutants
- WHEN the cost is described anywhere, THEN it is measured figures naming the driver as static-mutant count times dependent-suite runtime — cited as ratios with the measuring machine named, never as portable absolutes, never a vague warning, and never resting on the unstable tests-per-mutant figure
- WHEN any file under the CI workflow directory is generated or present, THEN it carries no mutation step, and a contract assertion enumerating that directory fails if one appears
- WHEN surviving mutants are reported, THEN the documentation states that equivalence is a human judgment

---

## US-31: The Repository's Own Count Contract Is Machine-Enforced [P1]

As a contributor sending a pull request,
I want CI to fail when the factual counts the docs declare have fallen behind their source,
so that keeping them true does not depend on someone remembering to re-run the generator after their last edit — and so that the gate costs nothing, because it buckets a test run that already happened.

**Acceptance Scenarios:**
- WHEN a pull request adds or removes a counted file category without re-deriving the counts, THEN CI's `test` job fails and names every stale count
- WHEN the counts match their source, THEN the gate exits 0, writes nothing, and adds no second suite run — it reads the JSON report the coverage step just wrote
- WHEN a quality gate is added, removed, reordered, or made unable to fail the job, THEN a contract assertion turns red until the change is made deliberately in the version-controlled baseline
- WHEN the report a gate reads cannot be shown to be fresh, THEN the rewrite mode refuses it outright rather than stamping unverified numbers into the docs

### Behavior Specifications


#### REQ-TESTS-070: CI Enforces the Factual-Count Contract
The repository's own quality gates run in CI, and the gate list is itself pinned. `pnpm run test:coverage` writes a vitest JSON report alongside its coverage output, and `ci.yml`'s `test` job then runs `pnpm run counts:check --from <that report>`: the factual-count contract is gated by bucketing a run that already happened, not by running the suite a second time. `sync-counts` reads a report only when `--from` names one — there is no implicit discovery, because a leftover report would turn a measurement into a stale constant — an absent or unreadable report is an explicit skip, which fails `--check`, and the rewrite mode refuses the flag outright rather than writing numbers it cannot date. A contract assertion parses the real `ci.yml` and compares every STEP the `test` job runs, in order, against a version-controlled baseline — scripts by their whole command, actions as `uses:<name>` with the version stripped, a multi-line script as a single token whose body is separately asserted to run no package manager in command position. It also asserts that no command gate is neutralised and that the path the counts step reads is the path the coverage script writes and actually emits. The `windows-smoke` job deliberately runs no counts step: counts are platform-independent.
- WHEN a change adds or removes a counted file category and the counts are not re-derived, THEN CI's `test` job fails and names every stale count
- WHEN the counts match their source, THEN the step exits 0 and writes nothing — `--check` is read-only
- WHEN `--from` names a missing or unreadable report, THEN the count sources are reported unavailable and `--check` exits non-zero — the gate never passes on an unverified count
- WHEN `--from` is absent, THEN the script runs the suite itself, so the local `pnpm counts` path is unchanged
- WHEN `--from` is passed to the rewrite mode, THEN the script refuses with exit 1 and writes nothing — a caller-named report cannot be shown to be fresh, and the rewrite mode would stamp its numbers into every doc; the flag is read-only by construction
- WHEN any step in the `test` job is added, removed, reordered, or rewritten — as a script in any spelling, or as an action — THEN the contract assertion turns red until the baseline is updated in the same change; a multi-line script is compared as one token, so its body is governed by the next bullet rather than this one, and an action's version bump is not such a change and stays green
- WHEN a multi-line script in that job invokes a package manager — as the first word of a line at ANY indentation, or after a shell separator — THEN the assertion turns red: the baseline compares such a step as one token, so a gate must never hide in its body; naming one mid-line — in a quoted string, a comment, or behind another command word (`if`, `env`, `time`, `!`, a backtick substitution) — stays green: the guard covers command-position calls, not every conceivable invocation
- WHEN a command gate — the dependency install, or any `pnpm run` script in the baseline — or the job itself is given a truthy `continue-on-error` or a condition other than the default, THEN the contract assertion turns red: a gate that cannot fail the job is not a gate; the default spelled out explicitly (`continue-on-error: false`, `if: success()`) stays green, and the setup actions and reporting steps are out of scope — two of the latter legitimately carry `if: always()`, and a neutralised checkout or toolchain setup cascades into failures at every gate after it
- WHEN the coverage script's report path and the counts step's `--from` path disagree, or the coverage script stops emitting the JSON reporter that writes it, THEN the contract assertion turns red rather than leaving the gate to fail for a filename reason

---

## US-32: Light-Scale Artifact Contract Mechanized at the Stations [P1]

As a developer running a `scale: quick` or `scale: backfill` change through the CLI,
I want the plan and tasks stations to actually enforce the light-scale artifact contract the lifecycle declares, from one registry both of them read,
So that a quick change has a legal route instead of a station that refuses it, a backfill change cannot be handed artifacts its own validator forbids, and the contract cannot be honoured at one station and silently ignored at the next.

**Acceptance Scenarios:**
- WHEN a scale's contract forbids a station's own product THEN that station refuses before writing anything, naming the station that does apply
- WHEN a scale's contract removes a station's normal input THEN the station takes its documented substitute input rather than losing its prerequisite altogether
- WHEN the documented artifact matrix and the code registry disagree in either direction THEN the build fails
- WHEN a scale is written onto a change whose artifacts that scale forbids THEN the write is refused and the conflicting files are named
- WHEN a change's scale leaves it with no forward planning station THEN routing names the station that owns its lifecycle entry, never one that must refuse it

### Behavior Specifications

#### REQ-TYPES-074: Light-Scale Forbidden-Artifact Registry
`types/change.ts` exports `SCALE_FORBIDDEN_ARTIFACTS` — a frozen registry naming, per `CHANGE_SCALES` value, the change artifacts that scale's contract forbids — plus `forbiddenArtifacts(scale)`, which reads an absent scale as `standard`. It is the single source the plan/tasks stations and the lifecycle contract test both consume, so the contract cannot be honoured at one station and not another.
- WHEN the scale is `quick`, THEN the forbidden set is `plan.md` and `delta-spec.md`
- WHEN the scale is `backfill`, THEN the forbidden set is `plan.md` and `tasks.md`
- WHEN the scale is `standard`, `full`, or absent, THEN the forbidden set is empty
- WHEN the scale string is unknown or an inherited object key, THEN it reads as `standard` rather than yielding a non-array member
- WHEN a new value is appended to `CHANGE_SCALES` without a registry entry, THEN the build fails rather than defaulting the new scale to "forbids nothing"
- WHEN any station or engine needs the per-scale artifact contract, THEN it consumes this registry rather than re-testing a scale name — the plan and tasks stations, the `promote-scaffold` validator, and the `status` router all read it, so one contract has exactly one encoding

---


#### REQ-SERVICES-076: Plan and Tasks Stations Honour the Forbidden-Artifact Registry
`prospec change plan` and `prospec change tasks` resolve the change's scale through `forbiddenArtifacts()` before touching the filesystem: a station whose own product is forbidden refuses with an actionable redirect, and the tasks station's `plan.md` prerequisite applies only when `plan.md` is not forbidden for that scale. Refusal happens before any write, so the change directory stays byte-identical.
- WHEN `scale: quick` and no plan.md exists, THEN `change tasks` scaffolds tasks.md and advances `story → tasks` without producing plan.md or delta-spec.md
- WHEN `scale: backfill`, THEN `change tasks` refuses (backfill records existing code — no task list) and `change plan` refuses and points at `/prospec-promote-backfill`
- WHEN `scale: quick`, THEN `change plan` refuses and points at `prospec change tasks`
- WHEN the scale is `standard`, `full`, or absent, THEN both stations keep their existing prerequisites, including the missing-plan.md refusal at the tasks station
- WHEN metadata.yaml is absent, THEN the scale is unknown, no prerequisite is relaxed, and the pre-existing refusal stands
- WHEN metadata.yaml is present but invalid, THEN the validation error surfaces first (the record deciding which prerequisites apply is read before them); nothing is written and nothing is relaxed. Only suggestion-shaped reads (`change progress`, `knowledge update`) degrade to "scale unknown" via `readScaleQuietly`, never a gate
- WHEN `change progress` finds no tasks.md, THEN its suggestion reads the same registry — a scale with no task list is told so instead of being sent to the tasks station that would refuse it
- WHEN `change scale` is asked to write a scale whose contract forbids an artifact already on disk, THEN it refuses before writing and names those files — a scale and its artifacts must agree, or the change is invalid the moment the scale lands

---


#### REQ-LIB-040: Promote-Scaffold Verdict Covers delta-spec.md
`validatePromoteScaffold` takes `hasDeltaSpec` as a required input and FAILs when the promotion scaffold has no `delta-spec.md`. The verdict `/prospec-promote-backfill` calls the complete machine check therefore covers the artifact promotion exists to produce, not only the artifacts it must not produce.
- WHEN a promotion scaffold has no delta-spec.md, THEN the verdict is FAIL and names the missing file
- WHEN delta-spec.md is present, THEN the check contributes no finding

---


#### REQ-TESTS-072: Lifecycle-Contract and Station-Matrix Coverage
A contract test pins the light-scale artifact matrix documented in both `_status-lifecycle.md` copies against `SCALE_FORBIDDEN_ARTIFACTS` by set equality in both directions, so a contract stated in the doc but absent from the code (or the reverse) fails the build. Unit tests cover the two stations across every scale, and an integration test drives the quick path end to end.
- WHEN the documented matrix and the registry disagree in either direction, THEN the contract test fails
- WHEN a station stops honouring the registry, THEN its station-matrix unit test fails
- WHEN the quick path runs `story → scale quick → tasks`, THEN the integration test asserts tasks.md exists, plan.md and delta-spec.md do not, and status is `tasks`

---

## Edge Cases

- Touches a third-party lib but Context7 is unavailable: skip silently + a one-line informational (dependency-layer knowledge, US-21)
- `scale: quick` with no plan: dependency-layer knowledge is provided only by the implement Phase 3 hook (US-21)
- Archive directory already exists: warn, ask whether to overwrite or skip
- Change lacks delta-spec.md: archive a partial summary, skip Spec Sync
- Knowledge update fails: non-fatal, recommend a manual update
- Running plan with no story: prompt to create a story first
- More than 30 tasks: suggest splitting the Story or merging
- Feature Spec does not exist during Feature Spec Sync: create a new file
- Verify with no Feature Spec: skip the consistency check
- Design Skill with no design.platform setting: default to the html adapter
- Extract Mode with ambiguous design intent: mark [NEEDS CLARIFICATION]
- UI task with no design-spec.md: Implement Skill warns

## Success Criteria

- **SC-001**: All SDD phases (story → design → plan → tasks → implement → verify → archive) produce correctly formatted artifacts
- **SC-002**: The Feature Spec Change History accumulates an audit trail in which every row names the change that produced it, and product.md automatically reflects the latest feature map
- **SC-003**: Supports 5+ concurrent change stories without confusion
- **SC-004**: Prospec can be used for its own development (self-host), validating the tool's practicality

---

## US-14: Knowledge Sync Gate Timing Restructuring [P1]

As an engineer developing with prospec,
I want verify to give only an informational note for "this change's knowledge gap" (not counted toward the grade), and to fold knowledge sync and count re-derivation into the commit prompt at verify S/A as the **prevention point**, with the archive Entry Gate as the **backstop**,
so that knowledge is already in sync the moment the feat commit lands, a source-only commit no longer inevitably flips the modified module to knowledge-health stale (eliminating PB-005's per-change stale-then-fix), and the protection is not removed by the shift.

**Acceptance Scenarios:**
- WHEN a change is implemented but the affected module's README does not reflect the delta-spec THEN verify V4 emits informational (list affected modules, point to the verify S/A commit prompt; the archive Entry Gate is the backstop), not counted toward the S/A/B/C/D grade
- WHEN verify reaches S/A THEN the commit prompt, before the commit instruction, folds in `/prospec-knowledge-update` (update descriptions only, do not reference this change's un-graduated REQs) + factual count re-derivation (generic wording), in the same commit as the feat commit — only at S/A (the last gate that can change code), so it does not re-stale
- WHEN existing knowledge disagrees with the current code and was not caused by this change THEN V4 still reports it as graded WARN/FAIL
- WHEN the archive target's knowledge is not in sync THEN the archive Entry Gate (backstop) FAIL, stop and guide to `/prospec-knowledge-update`; re-run passes after syncing
- WHEN a change affects no module (pure planning/docs) THEN the Entry Gate is treated as PASS

### Behavior Specifications

#### REQ-TEMPLATES-083: Archive Knowledge Sync Entry Gate (backstop)
The archive skill contains `## Entry Gate`, serving as the **backstop** for knowledge sync (the prevention point is the verify S/A commit prompt, REQ-TEMPLATES-129): (1) status=verified; (2) affected modules (delta-spec ADDED/MODIFIED/REMOVED REQ prefixes) have knowledge synced, and REMOVED behavior must be removed from the README; if not synced it still **FAIL**s (the protection is not removed by the shift). Lifecycle semantics are synced across two files: `_status-lifecycle.md` and the init template `status-lifecycle.md.hbs`, with §What each gate checks word-for-word identical (locked by the contract test).
- WHEN rendered, THEN the archive SKILL.md contains an Entry Gate (the two conditions verified + knowledge sync) worded as a backstop; it no longer claims "single mandatory knowledge-sync checkpoint" (negative assertion)
- WHEN knowledge is not synced, THEN Entry Gate FAIL, stop archiving and point to `/prospec-knowledge-update`; no affected modules is treated as PASS
- WHEN the Entry Gate section is removed or the interactive Phase 4 copy is restored, THEN the corresponding contract test turns red (mutation-verified)

#### REQ-TEMPLATES-129: Verify S/A Commit-Prompt Knowledge Sync (prevention point)
After verify reaches S/A and sets verified, before the commit prompt, fold in a knowledge sync + count re-derivation sub-step: run `/prospec-knowledge-update` on the affected modules (update descriptions only, do not reference this change's un-graduated REQ ids) + re-derive factual counts (generic wording: run the generator if there is one, otherwise re-derive from the source, not hardcoding a specific count command), folded into the same atomic commit. It triggers only at S/A (the last gate that can change code), so it does not re-stale; module-README Knowledge is synced here, and Feature Specs still graduate only at archive Phase 3.5 (deadlock avoidance).
- WHEN verify reaches S/A, THEN the commit prompt, before the commit instruction, includes the knowledge sync + count re-derivation step, explicitly folded into the same commit
- WHEN the shipped template renders, THEN the wording is generic, containing no literal specific count command (negative assertion)
- WHEN `scale: backfill`, THEN do not run REQ-prefix-driven knowledge-update (feature-slug REQs are not module names and would mint phantoms); only sync `related_modules` READMEs, and leave module derivation to the Entry Gate
- WHEN the commit-prompt sync step is removed or a count command is hardcoded, THEN the corresponding contract test turns red (mutation-verified)

#### REQ-TEMPLATES-120: Archive Entry Gate standard/full Feature-Prefix Fallback
prospec-archive Entry Gate and Phase 4: when a `standard`/`full` delta-spec REQ prefix hits feature-map `req_prefixes` it is a feature-prefix (not a module), so derive affected modules from `metadata.related_modules` + (`**Feature:**`→feature-map `modules`) instead, isomorphic with backfill; module-prefix REQs keep the original derivation. Fixes the knowledge-sync miss + phantom module risk for feature-prefixed REQs (e.g. `REQ-MCP-*`) under standard/full (BL-043).
- WHEN a standard/full REQ prefix hits feature-map req_prefixes, THEN derive affected modules from related_modules/feature-map, not prefix-as-module
- WHEN a REQ is a module-prefix, THEN keep the original prefix→module derivation (backward-compatible)

#### REQ-TESTS-035: Feature-Map Completeness and no-clobber Test
feature-map `mcp-server.modules` completeness (real-file contract) + `syncFeatureMap` no-clobber does not shrink the curated set.
- WHEN syncFeatureMap runs on an existing feature, THEN the curated modules set is not shrunk

---

## US-15: Proportionate Process (Scale-Aware Task Contract) [P1]

As a developer using the prospec SDD process,
I want a change to scale process weight by complexity — the story phase assesses scale (quick/standard/full), writes it to metadata after my confirmation, quick skips plan, tasks carry kind markers, and each gate honestly degrades by scale and kind,
so that a small fix does not pay the review cost of the full planning ceremony, while engineering discipline (TDD, adversarial review, Constitution audit) and the audit trail do not shrink with scale.

**Acceptance Scenarios:**
- WHEN new-story (or ff) finishes requirement gathering THEN suggest a scale per the criteria table with an explicit rationale, writing to `metadata.scale` only after user confirmation or reselection; a change expected to affect spec-covered behavior must not be suggested as quick
- WHEN `scale: quick` THEN the proposal takes a condensed form, skips plan (story → tasks), and does not load module READMEs; the delta-spec dimension of review/verify is marked `not-applicable` (not faked as PASS)
- WHEN tasks produces tasks THEN non-code tasks carry `[M]`/`[V]` markers; verify/archive completion counts only code tasks, and unchecked `[M]`/`[V]` blocks no gate
- WHEN a `scale: quick` change is archived THEN the Entry Gate compares against specs/features/ using the actual diff (if there is impact → add a Spec Impact section as the graduation key) and derives the knowledge gate's affected modules from the diff file paths via module-map
- WHEN an existing change has no `scale` field or tasks.md has no kind markers THEN behavior is exactly as current (default=standard, no marker=code)

### Behavior Specifications

#### REQ-TYPES-026: ChangeMetadata Scale Field
`ChangeMetadataSchema` includes an optional `scale` field (`CHANGE_SCALES` enum: `quick`/`standard`/`full`), with default semantics of standard.
- WHEN parsing metadata, THEN the three legal values pass, illegal values are rejected by the zod enum, and no field is still valid (backward-compatible)

#### REQ-TEMPLATES-084: New-Story Complexity Assessment Phase
new-story Phase 3.5: a criteria table (number of modules touched / spec-covered behavior / nature of change) + LLM suggestion + write to `metadata.scale` after user confirmation; after quick is confirmed, the proposal takes a condensed form (single Story + 2-3 WHEN/THEN, no FR/SC enumeration).
- WHEN assessing, THEN "expected to affect spec-covered behavior → veto quick (at least standard)" is a hard criterion
- WHEN not user-confirmed, THEN scale must not be written (NEVER rule + contract assertion lock)

#### REQ-TEMPLATES-085: Fast-Forward Quick Path
ff reads `metadata.scale`: quick skips Phase 3 (Plan Generation; no plan.md/delta-spec.md produced, no module README loaded), status story → tasks; standard/full keep the three-phase flow. The lifecycle's two copies (`_status-lifecycle.md` + init template) document the quick transition AND carry the light-scale artifact matrix, with contract assertions locking their sync with each other and with the code registry.
- WHEN quick, THEN the Output Contract self-assesses "plan absent per contract", not falsely reporting Unmet
- WHEN either copy's matrix diverges from `SCALE_FORBIDDEN_ARTIFACTS`, THEN the contract test fails

#### REQ-TEMPLATES-086: Task Kind Marker Schema (Frozen)
The kind marker syntax is frozen in a single place, the tasks-format reference: `[M]` manual, `[V]` verification, no marker=code, coexisting with `[P]` (`[P]` first). Other template references do not restate it (locked by negative assertion).
- WHEN a consumer (tasks/verify/archive/implement) needs the definition, THEN reference the tasks-format "Task Kind Markers" section

#### REQ-TEMPLATES-087: Scale-Tiered Plan Depth
plan has three tiers by scale: quick is rejected and directed to tasks (no file produced), standard ≤120 lines (default), full is a complete architecture analysis (not subject to the 120-line cap). The plan-format reference includes three-tier guidance. The rejection is mechanical rather than skill judgment alone — `prospec change plan` refuses whenever plan.md is forbidden for the change's scale.
- WHEN `scale: quick`, THEN both the skill Entry Gate and the CLI refuse and direct the user to tasks, writing no plan.md or delta-spec.md
- WHEN `scale: backfill`, THEN the CLI refuses and directs the user to `/prospec-promote-backfill` — a plan.md would fail that scaffold's own validate gate
- WHEN the scale is `standard`, `full`, or absent, THEN the station behaves exactly as before

#### REQ-TEMPLATES-088: Verify Kind-Aware Completion and Quick Dimension Reduction
verify V1's completion-rate denominator includes only code tasks (`[M]`/`[V]` listed separately as reminders); for `scale: quick`, V2 spec-compliance is marked `not-applicable`, not faked as PASS, not counted toward the grade; the Entry Gate for quick requires only proposal + tasks. V1's data source, when the `prospec check --json` report is available, is its `task-completion` check item (same engine, no re-computation); when unavailable, fall back to LLM computation and state so explicitly — the denominator rule and quick dimension reduction are unchanged.

#### REQ-TEMPLATES-089: Archive Quick Spec-Impact Entry Gate
The archive Entry Gate for `scale: quick`: (1) the knowledge gate's affected modules are instead derived from the actual diff file paths via `module-map.yaml` (a REQ prefix against an absent delta-spec is the empty set and would silently pass); (2) the spec-impact check compares against specs/features/ using the diff — if there is impact, FAIL and require adding a Spec Impact section at the end of the proposal (graduation key); if none, summary.md records the diagnosis and skips graduation. The spec comparison is an LLM judgment step (not claiming determinism); module derivation is a deterministic path mapping.

#### REQ-TEMPLATES-090: Review Quick-Path Degradation
review for `scale: quick`: Entry Gate artifacts are reduced to proposal + tasks; the spec-architecture lens's delta-spec comparison is marked `not-applicable` (dependency direction / conventions / ripple still reviewed); when the diff is suspected to touch spec-covered behavior, warn early (a complementary signal earlier than the archive gate).

## US-16: Verify Consumes the Deterministic Drift Engine [P1]

As a developer running `/prospec-verify` during development,
I want verify's structural dimensions to directly run `prospec check --json` and interpret its report,
so that development and CI use the same check engine, results are consistent, and the LLM does not redo what a machine can do.

**Acceptance Scenarios:**
- WHEN `prospec check` is available, THEN V1 completion rate and V4 staleness facts come from the report (with file+line locations), and verify does not redo them with the LLM
- WHEN the command is unavailable, THEN verify explicitly states "drift engine unavailable — falling back to manual checks" and follows the documented fallback path, never silently skipping
- WHEN a report check item is `skipped`, THEN verify surfaces the skip reason and does not treat it as PASS

#### REQ-TEMPLATES-092: Verify Consumes Check Report
verify Startup Loading runs `prospec check --json` as a [DYNAMIC] step; V1/V4 reference the report's data and locations; the fallback and skipped≠PASS rules are stated explicitly in NEVER and Error Handling (the engine itself is in the drift-detection feature spec).

---

## US-17: Constitution Substantive-Emptiness Detection Prompt [P1]

As a developer of a new project adopting prospec,
I want `/prospec-explore` and `/prospec-knowledge-generate` to detect at completion whether the Constitution is substantively empty and prompt to fill it in,
so that the Constitution becomes real project principles, rather than letting the verify compliance check and the Entry/Exit gates become no-ops.

**Acceptance Scenarios:**
- WHEN explore/knowledge-generate finishes and the Constitution contains only seeded example rules + Language Policy (or does not exist, or has only blank lines/comments) THEN emit a closing prompt: substantively empty, the gates will be ineffective, guide editing `CONSTITUTION.md`
- WHEN there is at least one user-custom rule THEN emit no prompt
- WHEN the prompt is emitted THEN follow the Constitution Language Policy; advisory, not blocking

### Behavior Specifications

#### REQ-TEMPLATES-096: Constitution Substantive-Emptiness Prompt
The explore + knowledge-generate templates detect Constitution substantive-emptiness at completion (only seeded example rules + Language Policy, does not exist, or only blank lines/comments) → emit a fill-in prompt. Pure skill instruction (the agent judges itself, introducing no lib/CLI).
- WHEN substantively empty, THEN prompt "why custom rules are needed + edit steps"; if there is already a custom rule, do not prompt
- WHEN contract runs, THEN assert both templates contain the detection prompt (`substantively empty` + `seeded example rules`)

## US-18: Unified Phase Numbering + per-phase gate [P2]

As a team engineer adopting prospec,
I want every skill with numbered Phases to start at Phase 1, and every non-final Phase to have a concise pass checklist,
so that phase numbering is predictable and results are verified at each phase, without waiting for the skill-end Exit Gate.

**Acceptance Scenarios:**
- WHEN reviewing any numbered-phase skill THEN it starts at Phase 1 (ff no longer has Phase 0); semantic decimals (archive 3.5/3.6/4.5, new-story 3.5) and sub-steps (design 2a/2b) are retained and annotated as deliberate insertions
- WHEN a non-final Phase is completed THEN there is a 2-3 item observable gate checklist after that Phase (coexisting with the skill-level Entry/Exit gate)
- WHEN a Phase is skipped by scale (e.g. quick skips plan) THEN mark it skipped, not misjudged as a gap

### Behavior Specifications

#### REQ-TEMPLATES-097: Phase-1 Start + Per-Phase Gates
The 8 numbered-phase skills all start at Phase 1 (fixing ff's Phase 0); add a 2-3 item gate checklist after each non-final numbered Phase. Semantic decimals/sub-steps are retained and documented (not integer-ized, to avoid a cascade breaking spec/lifecycle cross-references). Single-phase skills are exempt.
- WHEN rendered, THEN ff has no `Phase 0`; each numbered-phase skill's gate count ≥ its non-final phase count (contract assertion)

#### REQ-TESTS-026: Instruction-Quality Contract Assertions
`skill-format.test.ts` assertions lock the entire template structure of this feature (phase numbering, per-phase gate, Constitution detection prompt, status-aware handoff, session detection, implement progress); removing any one turns red (+19 assertions).
- WHEN contract runs, THEN the assertions corresponding to US-17~20 are all green

## US-19: status-aware Next-Step Handoff + new-session detection [P2]

As a prospec developer in iterative development,
I want the 6 linear-flow skills to suggest the next step at completion per the SDD workflow order and ask to run it, and a new session at startup to detect in-progress changes in `.prospec/changes/`,
so that the flow is continuous and does not go wrong or redo work due to a session interruption.

**Acceptance Scenarios:**
- WHEN plan/tasks/implement/review/verify/archive finishes THEN suggest the next step per the SDD workflow order (review/learn have no status node, so it is by order, not by status alone) + ask "Run <next-step> now? (Y/n)"; Y→agent triggers, n→stay; never silently auto-run
- WHEN the phase is terminal (archived) THEN point to periodic `/prospec-learn`; if grade B/C/D does not advance, point to the fix step rather than the next skill
- WHEN a new session starts and a change with status≠archived exists THEN the entry config directs running `prospec status`, which surfaces its name, current node, and continuation step

### Behavior Specifications

#### REQ-TEMPLATES-098: Status-Aware Next-Step Handoff
plan/tasks/implement/review/verify/archive end with a Next-Step Handoff per the SDD workflow order + `(Y/n)`; Y triggers the next step via the agent, n stays; includes terminal/non-advancing branches. Carries the `Next:` field from REQ-TEMPLATES-061.
- WHEN rendered, THEN the six skills contain `Next-Step Handoff` + `(Y/n)` + `_status-lifecycle.md` (contract assertion)

#### REQ-TEMPLATES-099: New-Session In-Progress Change Detection
The agent entry config's Session Start instructs running `prospec status` — the deterministic router reports each in-flight change's name, current node, suggested next step, and blocking gates — instead of prose scanning-and-derivation rules; a one-line fallback keeps manual `.prospec/changes/` scanning per `_status-lifecycle.md` for CLI-less environments.
- WHEN rendered, THEN the entry config Session Start contains the `prospec status` pointer (plus the fallback) and no longer contains the prose station-order derivation (contract-pinned positively and negatively)

## US-20: implement progress anchoring [P3]

As a developer doing a long implementation via implement,
I want to emit `Progress X/Y | Goal | Next` after completing each task,
so that after 50+ tool calls I can still locate progress and avoid goal drift.

**Acceptance Scenarios:**
- WHEN implement completes a task (checks the checkbox) THEN emit `Progress X/Y | Goal: <one sentence from proposal> | Next: <next task>`; the denominator counts only code tasks
- WHEN all code tasks are complete THEN emit `Progress Y/Y (Complete)` and point to `/prospec-review`

### Behavior Specifications

#### REQ-TEMPLATES-100: Implement Progress Anchoring
prospec-implement emits a three-part `Progress/Goal/Next` after each task-completion checkpoint (the denominator counts only code tasks). ff is not applicable (no per-task loop).
- WHEN rendered, THEN implement contains `Progress X/Y` + `Progress Y/Y (Complete)` (contract assertion)

---

## US-22: Backfill Spec Extraction (brownfield WHAT-layer completion) [P2]

As a brownfield project developer,
I want, for existing code with no Feature Spec coverage, to reverse-extract a route-compatible Feature Spec draft in units of a **feature vertical slice** (marking `[NEEDS CLARIFICATION]` where intent cannot be inferred) and to point out WHAT-layer uncovered features/capabilities,
so that WHAT-layer coverage exists without waiting for N forward changes to accumulate, and without polluting the trust zone.

**Acceptance Scenarios:**
- WHEN `/prospec-backfill-spec` is triggered on a feature vertical slice and the source has sufficient behavioral clues THEN converge across the "modules contributing to that feature" and produce a route-compatible draft at `.prospec/changes/[name]/backfill-draft.md` (`**Feature:**`/`**Story:**` + US/AC candidates)
- WHEN an intent field (*So that* value / target role) cannot be inferred from the source THEN mark `[NEEDS CLARIFICATION]`, do not fabricate; story-level `[NEEDS CLARIFICATION]` ratio > 50% THEN abort / recommend going forward instead
- WHEN both ends of a cross-module event flow / outbound integration edge — the emitter and the handler/sink — are traced to a concrete callsite THEN promote to a first-class AC; if only one end is resolved, mark `[NEEDS CLARIFICATION]`/Deferred (never assert a cross-module flow whose handler is unresolved)
- WHEN extraction completes THEN 0 writes to the trust zone `specs/features/` (the draft lands only in the change directory)
- WHEN detecting WHAT-layer coverage THEN list features/capabilities that exist in code but have no Feature Spec REQ coverage (informational, non-blocking, not auto-triggered)

### Behavior Specifications

#### REQ-TEMPLATES-104: prospec-backfill-spec backfill extraction (sourcing unit = feature vertical slice)
The standalone skill `prospec-backfill-spec.hbs` performs backfill extraction: multi-source triangulation fills fields per a source→field mapping (code+tests→behavior+AC, git body→*So that*, docs/README→role/value/target user, ai-knowledge→module routing), with the **feature vertical slice** as the sourcing unit, in a two-stage gather-by-module (a behavior inventory per module, demoted to intermediate material) → cluster-by-feature (the product): enumerate behaviors across all modules contributing to that feature, then cluster into that feature's US and explicitly list deferred, producing a route-compatible draft at `.prospec/changes/[name]/backfill-draft.md`.
- WHEN prospec-backfill-spec is triggered, THEN produce a route-compatible draft per the source→field mapping, in units of a feature vertical slice (`**Feature:**`/`**Story:**` + US/AC)
- WHEN a feature spans multiple modules, THEN two-stage gather→cluster, enumerate across contributing modules then cluster, explicitly list deferred (coverage must be visible, no silent partial coverage)
- WHEN stating countable facts (enum/format/mapping counts, cross-module flows), THEN verify against the source; if unverified, write `~N` or mark `[NEEDS CLARIFICATION]`

#### REQ-TEMPLATES-105: backfill extraction intent guardrail ([NEEDS CLARIFICATION] + >50% story-level)
Un-inferable story-level intent (*So that* / target role) is marked `[NEEDS CLARIFICATION]`, not fabricated; the target role can be back-inferred from git/docs product/consumer names; ratio > 50% aborts / recommends forward, with the denominator counting only story-level intent (heuristic-calibrated WHY records its value as a behavior AC and does not count toward the abort denominator). A feature vertical slice is broader (more stories, more mixed intent sources: multiple commits / multiple READMEs), so it must avoid "behaviors complete but a few intents un-inferable" falsely tripping abort — following the heuristic-WHY exemption as precedent.
- WHEN intent is un-inferable, THEN mark `[NEEDS CLARIFICATION]`, fabrication forbidden (including generous marking of English→Traditional Chinese translation gaps)
- WHEN the `[NEEDS CLARIFICATION]` ratio > 50% (denominator counts only story-level intent), THEN abort or recommend going forward instead

#### REQ-TEMPLATES-106: trust-zone invariant + candidate slug proposal
Backfill extraction never writes to `specs/features/` (archive remains the sole writer); a candidate feature slug is proposed but not self-decided, requesting human confirmation via `[NEEDS CLARIFICATION]` and must pass `isSafeResourceName`; promotion is a manual conversion to delta-spec → verify → archive (no second writer).
- WHEN producing a draft, THEN never write the trust zone directly; the candidate slug is marked `[NEEDS CLARIFICATION]` and `isSafeResourceName`-valid
- WHEN promoting, THEN manually convert to delta-spec and follow the existing forward archive path

#### REQ-TEMPLATES-107: WHAT-layer uncovered feature detection (scoping)
The agent reads `specs/features/` and lists **features/capabilities** (cross-module behavior slices) that exist in code but have no REQ coverage, as the basis for the extraction scope — in units of an uncovered feature, not a module (a covered module ≠ a covered feature); covered ones are not listed. Coverage source: with `feature-map.yaml` (BL-040) it is a deterministic set-difference; without it, inventory existing slugs + derive slice participation from module-map, judged in prose.
- WHEN detecting coverage, THEN list uncovered features (informational, non-blocking, does not auto-trigger extraction)
- WHEN a feature is already covered by an existing Feature Spec REQ, THEN do not list it (avoid duplicate extraction)

#### REQ-TESTS-028: backfill skill section-scoped + mutation-verified contract assertions
`tests/contract/skill-format.test.ts` section-scoped pins the `prospec-backfill-spec` wording (source→field, >50% story-level denominator, trust-zone never-write, route-compatible `backfill-draft.md`, uncovered detection, completeness/count-fidelity), mutation-verified; includes a negative assertion confirming `prospec-design` no longer contains the reverse variant (no input=code/Phase 2b-code/reverse-draft), and that backfill content did not enter the new skill's Startup Loading stable prefix.
- WHEN contract runs, THEN slice from the prospec-backfill-spec section and verify the above wording
- WHEN any pinned semantic is removed, THEN the corresponding assertion turns red; prospec-design contains no reverse variant, and backfill is not in the new skill's Startup Loading stable prefix (negative)

#### REQ-TEMPLATES-108: prospec-backfill-spec standalone Lifecycle skill (hasReferences:true)
The standalone Lifecycle skill `prospec-backfill-spec` (type=Lifecycle, **hasReferences:true** — the feature boundary criteria are externalized to `references/feature-boundary-criteria.hbs`, loaded via a short Phase 2 pointer, together with an `agent-sync` getSkillReferences entry, otherwise flipping the flag still renders zero references) carries the brownfield WHAT-layer backfill capability; triggers include backfill/brownfield-style phrases (English, plus the skill's Traditional-Chinese trigger aliases); listed in the entry config, with prospec-design being pure Generate/Extract.
- WHEN a user triggers with a backfill/brownfield-type phrase, THEN invoke `/prospec-backfill-spec` (no input=code parameter needed)
- WHEN sync deploys, THEN render and deploy `feature-boundary-criteria.md` (if either the `skill.ts` hasReferences:true or the `agent-sync` getSkillReferences entry is missing, the reference is never deployed)

#### REQ-TEMPLATES-109: Pass-2 tracing operationalized + three Phase 1 Gates + cross-slice dedup
The skill documents an executable gated tracing procedure (not just renamed terms): enumerate entry points with named heuristics (CLI command registration, exported service method, route/handler decorator, async/scheduled entry point); trace the call chain hop by hop `entry → controller/use-case → domain → emitted events → handler → outbound integration edge`, citing `file:line` for each traced edge (those that cannot be cited must not enter an AC); the Phase 1 Gate expands to three checkboxes (enumeration / each behavior assigned to exactly one feature slice or explicitly Deferred / count-fidelity); cross-slice dedup — behavior of shared infrastructure is assigned to the slice whose domain intent most directly owns it, with the other slice mentioning it by reference and not double-counting it as an AC.
- WHEN tracing a slice's call chain, THEN cite `file:line` for each traced edge; those that cannot be cited must not be written into an AC
- WHEN one behavior is touched by two slices, THEN assign it to the slice whose domain intent most directly owns it, with the other slice referencing it without double-counting

#### REQ-TEMPLATES-110: cross-module event flow/outbound as a first-class AC source (conditioned on grounding)
Cross-module event flows (emitted event → handler callback) and outbound integration edges are listed as first-class AC sources (end-to-end entry → domain → events → downstream) — the biggest blind spot of module-first; precondition for promotion to AC: both ends, the emitter and the handler/sink, are traced to a concrete callsite. count-fidelity extends to cover the integration edge.
- WHEN both ends are traced to a callsite, THEN promote to a first-class AC
- WHEN only one end is resolved, THEN record a `[NEEDS CLARIFICATION]` candidate edge or Deferred; never assert the existence of a cross-module flow whose handler is unresolved

#### REQ-TEMPLATES-111: feature boundary criteria reference (externalized + soft-signal reconciliation)
Add `references/feature-boundary-criteria.hbs` (unifying principle: a feature boundary = one actor's coherent intent over some domain object's lifecycle; CRUD verbs / code layer / file length are not boundaries), loaded via a short Phase 2 pointer: three split signals (independent lifecycle / no shared US / actor+trigger both disjoint) + read/query attribution (default: merge into the domain feature's view US; only cross-domain search/report or an external consumer becomes its own feature) + reconciliation with `feature-spec-format` (300 lines / 40%) as a soft signal (triggers re-examination, with the three signals being the binding decision).
- WHEN deciding a feature boundary or read/query attribution, THEN load the `feature-boundary-criteria.md` short pointer and apply the three signals + read/query rule
- WHEN line count exceeds 300 / US share < 40%, THEN trigger re-examination (soft signal), with the final decision by the three split signals, not auto-split

#### REQ-TEMPLATES-112: infrastructure module is not a feature target (NEVER)
An infrastructure module (serialization, persistence, event-bus, composition root, and the like) is not a feature target; its behavior is attached as REQs under "the feature that consumes it", never becoming its own feature slice. Cross-cutting governance issues go through the `/prospec-learn` promotion path, not inventing a new spec at this layer.
- WHEN encountering an infrastructure module, THEN do not establish it as a feature slice; attach its behavior under the feature that consumes it
- WHEN encountering a cross-cutting governance issue, THEN go through `/prospec-learn`, not inventing a new spec layer

#### REQ-TESTS-030: feature-first contract pin + hasReferences dependency (mutation-verified)
`tests/contract/skill-format.test.ts` + `tests/integration/skill-generation.test.ts` synced in the same commit: ADD a feature-first section-scoped pin (`vertical slice` / `contributing modules` / Phase 4 `uncovered feature` / integration-edge grounding), with existing surviving pins keeping substrings; the has-references list adds `prospec-backfill-spec`, and the self-contained list removes it; the `referenceFiles` assertion goes 23→24; mutation-verified.
- WHEN contract runs, THEN feature-first semantics are verified by slicing from the prospec-backfill-spec section, and `referenceFiles`=24
- WHEN any pinned semantic is removed, THEN the corresponding assertion turns red

---

## US-23: brownfield backfill spec end-to-end graduate (scale: backfill) [P2]

As a developer backfilling specs in a brownfield project,
I want to graduate a reviewed backfill draft end-to-end at a **lightweight** scale (promote → verify → archive), with verify instead assessing spec-fidelity and treating existing code quality gaps as pre-existing technical debt rather than this change's defects,
so that a backfill spec faithfully reflecting existing code is not blocked to death by "quality gates designed for new code", and can honestly graduate into the trust zone.

**Acceptance Scenarios:**
- WHEN `/prospec-promote-backfill` on an aligned `backfill-draft.md` THEN produce a **lightweight** scaffold (proposal + delta-spec + metadata: `scale: backfill`/`status: implemented`/`related_modules`), **no plan/tasks**
- WHEN verify processes a `scale: backfill` change THEN 2/5 spec-fidelity is the primary graded dimension (each REQ AC's `file:line` must hold), existing code quality `[MUST]` violations are downgraded to informational, and 1/5 task-completion is `not-applicable`
- WHEN an existing test actually fails (not a missing test) THEN still judge it a real FAIL; the quality downgrade applies only when `backfill-draft.md` provenance exists (a marker is self-attesting and untrustworthy)
- WHEN archive processes `scale: backfill` THEN accept the graduate, derive affected modules from `related_modules`/`**Feature:**`→feature-map, skip REQ-prefix auto knowledge-update, and Phase 3.5 follows delta-spec graduate

### Behavior Specifications

#### REQ-TEMPLATES-115: verify scale: backfill spec-fidelity scoring contract
`prospec-verify` recognizes `metadata.scale: backfill`, promoting Verification 2/5 (delta-spec compliance) to the primary graded dimension, verifying whether each REQ's AC faithfully corresponds to the existing code. The Entry Gate exception requires only proposal + delta-spec (no plan/tasks); grade S/A means "the spec faithfully reflects the code", following the existing `verified` gate.
- WHEN `scale: backfill`, THEN 2/5 is the graded main axis; an AC's `file:line` holds→PASS, does not hold→FAIL, missing evidence→WARN/FAIL (no empty PASS)
- WHEN the Entry Gate checks artifacts, THEN backfill requires only proposal + delta-spec, and 1/5 task-completion is `not-applicable`

#### REQ-TEMPLATES-116: existing violations downgraded to informational + test triage + provenance binding
3/5 records existing code quality `[MUST]` violations (missing tests/coverage/layering, not introduced this change) as informational technical debt, not lowering the grade; 5/5 missing tests→informational, existing test fails→real FAIL. The downgrade applies only when the verify Entry Gate confirms `backfill-draft.md` exists (provenance), otherwise it scores by the standard contract — preventing `scale: backfill` from becoming a bypass of the new-code quality gate.
- WHEN `scale: backfill` and provenance holds, THEN existing quality `[MUST]` violations→informational, missing tests→informational
- WHEN `backfill-draft.md` is absent, THEN score 3/5, 5/5 by the standard contract + WARN (a marker is hand-editable, self-attesting and untrustworthy)

#### REQ-TEMPLATES-117: archive accepts backfill + module-derivation switch + Phase 3.5 graduate
`prospec-archive` accepts `scale: backfill` graduate; at this scale the affected modules are derived from `metadata.related_modules` + (`**Feature:**`→`feature-map.yaml` modules), not the REQ-id prefix (a feature-slug REQ-id does not correspond to a module); Phase 2 tasks-completion is skipped (no tasks.md); Phase 3.5 follows delta-spec graduate (REQ + Story, routed by `**Feature**`).
- WHEN archive `scale: backfill`, THEN Entry Gate/Phase 4 derive modules from `related_modules`/Feature→feature-map; if the feature is not in feature-map→fallback to `related_modules`
- WHEN graduating, THEN Phase 3.5 follows the delta-spec path; Phase 2 skips the tasks completion rate for backfill

#### REQ-TEMPLATES-118: /prospec-promote-backfill skill (lightweight scaffold)
The new Lifecycle skill `prospec-promote-backfill.hbs` formalizes a reviewed `backfill-draft.md` into proposal + delta-spec + metadata (`scale: backfill`/`status: implemented`/`related_modules` taken from the draft's traced `file:line`). `backfill` is a lightweight scale like `quick` — **no plan.md/tasks.md produced** (producing them is hollow make-work just to pass a gate). The Entry Gate rejects unresolved `[NEEDS CLARIFICATION]`; never writes the trust zone.
- WHEN promote is triggered, THEN produce proposal + delta-spec + metadata, no plan/tasks, entering `status: implemented` directly
- WHEN the draft has unresolved `[NEEDS CLARIFICATION]`, THEN refuse to expand, send back to the review gate

#### REQ-TEMPLATES-119: lifecycle/scale doc records the backfill entry
`_status-lifecycle.md` (written to both ai-knowledge + init template) records `scale: backfill`: the promote skill is a lifecycle **entry point**, setting `status: implemented` directly (brownfield code already exists), then going `verified → archived`; the `prospec-new-story` scale table annotates backfill as a promotion-time scale (not a new-story suggestion); the delta-spec template/format notes the feature-slug REQ-id usage.
- WHEN reading the lifecycle doc, THEN both copies describe the backfill entry (the contract test locks the template copies' sync)
- WHEN new-story assesses scale, THEN backfill is not listed as a new-story option

#### REQ-TESTS-034: backfill mode contract assertions (mutation-verified)
`tests/contract/skill-format.test.ts` section-scoped assertions: verify fidelity main axis / existing violations downgraded to informational / test triage / Entry Gate exception + provenance / 1-5 N/A, archive accept + module derivation + Phase 2 skip + Phase 3.5 arm, review Entry Gate exception, promote lightweight scaffold (no plan/tasks), `SKILL_DEFINITIONS` count 16. All mutation-verified (PB-001).
- WHEN contract runs, THEN each of the above behaviors has a section-scoped assertion
- WHEN any pinned semantic or behavior is removed/broken, THEN the corresponding assertion turns red

---

## US-24: review provenance machine gate [P1]

As a prospec maintainer guarding the verify gate,
I want verify to block starting for a non-backfill change when review is absent or stale, review to leave machine-checkable provenance each round, and the residual playbook rules to be pushed back into the authoring skill's decision points,
so that the institutionalized hard gate coincides with the review that actually catches defects, a rubber-stamp verify can no longer skip review, and a promoted lesson is truly written back to the implementer who made the mistake.

**Acceptance Scenarios:**
- WHEN a non-backfill change runs `/prospec-verify` and the `review-provenance` check FAILs (review absent or stale), THEN the Entry Gate blocks, refuses to start, and points to `/prospec-review`
- WHEN `/prospec-review` completes a round (including review-clean), THEN metadata `quality_log` records a `prospec-review` entry, and `prospec check --record-review` code-computes and writes the `review_provenance` baseline
- WHEN `scale: backfill`, THEN keep the current review exemption (recommended, not blocking)
- WHEN the drift engine is unavailable, THEN the verify Entry Gate falls back to reading `quality_log` — a missing `prospec-review` entry still blocks, staleness downgrades to WARN, never silently pass
- WHEN reviewing the skill templates, THEN the residual playbook rules PB-001/003/006/007 are grep-hittable in the corresponding template (implement NEVER + review lens); PB-005, whose root cause was fixed in #65, is retired under `_playbook.md`'s `## Retired Entries`, while PB-004 was un-retired and narrowed (2026-07-28) to the counts `pnpm counts` does not own and is live again

### Behavior Specifications

#### REQ-TYPES-053: Change Metadata review_provenance Field
`ChangeMetadataSchema` adds an optional `review_provenance {digest, date}` (a code-computed review baseline, compared by the `review-provenance` check), alongside `quality_log` (REQ-TYPES-022); omitting it is still backward-compatible (metadata is read losslessly, a type contract).

#### REQ-TEMPLATES-130: prospec-review records provenance each round
`prospec-review` writes a `skill: prospec-review` `quality_log` entry on each round's completion (including review-clean, 0 critical / 0 major), and runs `prospec check --record-review` to record the baseline after the loop converges.
- WHEN review-clean completes, THEN quality_log contains a machine-parseable prospec-review entry + the baseline is stamped
- WHEN the CLI is unavailable, THEN state the fallback explicitly and still record the quality_log entry (never silently skip)

#### REQ-TEMPLATES-131: prospec-verify Entry Gate blocks absent/stale review
The `prospec-verify` Entry Gate is upgraded from recommended to blocking: a non-backfill change reads `prospec check`'s `review-provenance`, and a FAIL (absent/stale) blocks and points to `/prospec-review`; `scale: backfill` keeps the recommended-only exemption; when the drift engine is unavailable, fall back to reading `quality_log` (a missing prospec-review entry still blocks, staleness downgrades to WARN, never silently pass); the corresponding NEVER is synced (removing the "Absence does NOT block verify" pass-through wording).
- WHEN non-backfill and review-provenance FAIL, THEN the Entry Gate blocks; WHEN PASS, THEN start normally
- WHEN backfill, THEN exempt; WHEN the engine is unavailable, THEN quality_log fallback, no silent pass

#### REQ-TEMPLATES-132: residual playbook rules pushed back into the skill gate
The residual playbook rules are inlined into the authoring decision points: PB-001 (contract assertions section-scoped+mutation-verify) → `prospec-implement` NEVER + review test-quality lens; PB-003 (claim ⊆ impl) → review docs-claims lens; PB-006 (extract a helper for parallel modules) → strengthen the review DRY lens; PB-007 (sweep every consumer) → `prospec-implement` NEVER + review parallel-site lens. PB-002 (freq 1, design-time) keeps its ruling in the playbook. PB-005, whose root cause was fixed in #65, is retired under `_playbook.md`'s `## Retired Entries`; PB-004 was retired with it and then **un-retired and narrowed** (2026-07-28) to the factual counts `pnpm counts` does not own, so it is a live entry again — the ledger key that carried it (`docs/duplicated-count-drift`) stays retired while `docs/module-readme-manual-counts-uncovered` carries the narrowed rule.
- WHEN reviewing the template, THEN PB-001/003/006/007 are grep-hittable in the corresponding template
- WHEN reviewing the ledger/playbook, THEN PB-005 is marked retired, PB-004 is live under its narrowed scope, and PB-002's ruling is recorded

#### REQ-TESTS-043: gate template contract test
`skill-format.test.ts` section-scoped + mutation-verified pins: review records provenance each round, the verify Entry Gate blocking wording (negative: no "Absence does NOT block verify"), and the grep-hit of PB-001/003/006/007 in the corresponding template.
- WHEN contract runs, THEN each of the above behaviors has a section-scoped assertion; removing any target wording → turns red

---

## US-25: Constitution full audit converged to the single verify site [P1]

As a prospec maintainer managing SDD process cost,
I want the full graded Constitution audit to run only at one place, `/prospec-verify` V3/5, with the other sites checking only site-specific rules,
so that the per-change Constitution check converges from ≥7 times to 1 full audit + references, cutting the duplicate audit cost while engineering discipline is not reduced.

**Acceptance Scenarios:**
- WHEN the Constitution touchpoints of new-story/plan/tasks/ff/implement run, THEN they check only site-specific rules, not a generic "3+ principles" full sweep
- WHEN a non-verify Exit Gate runs, THEN it compares against site-specific rules and records `quality_log` (US-12 retained), not re-evaluating the whole Constitution
- WHEN verify V3/5 runs, THEN it is the only full graded Constitution audit (every principle)
- WHEN reviewing archive/design/backfill-spec/promote-backfill/knowledge-update, THEN there is no Constitution `[STABLE]` item loaded but unconsumed; ff has no "NEVER skip Constitution check at any phase"; the Entry Gate's constitution-exists existence check is retained
- WHEN counting a single standard/full change, THEN the Constitution full audit is exactly 1 (verify), with the other sites being site-specific references

### Behavior Specifications

#### REQ-TEMPLATES-133: Constitution full audit converged to the single verify site
The full graded Constitution audit (every principle) runs only at `/prospec-verify` V3/5; each planning/execution site checks only site-specific rules (new-story→INVEST, plan→dependency-direction/layering, tasks→TDD test coverage, implement→TDD/commit, ff per-phase), not a generic "3+ relevant principles" full sweep. Remove ff's "NEVER skip Constitution check at any phase" and the Constitution `[STABLE]` items loaded but unconsumed in archive/design/backfill-spec/promote-backfill/knowledge-update; the Entry Gate constitution-exists existence check and the verify full audit are retained.
- WHEN grepping a non-verify skill, THEN there is no "every principle / full audit / 3+ … principles" full-audit wording; verify keeps the full audit
- WHEN reviewing ff, THEN there is no "NEVER skip Constitution check at any phase"
- WHEN reviewing the Startup Loading of the above 5 skills, THEN there is no Constitution `[STABLE]` loading; the constitution-exists Entry Gate check of new-story/plan/ff is retained

#### REQ-TESTS-044: Constitution convergence contract assertions
`skill-format.test.ts` section-scoped + mutation-verified pins the convergence: verify keeps full-audit; non-verify sites have a negative assertion (no full-audit wording); `prospec-ff` has no "NEVER skip Constitution check at any phase"; the specified 5 skills have no orphaned Constitution `[STABLE]` loading; the startup-loading baseline is synced.
- WHEN contract runs, THEN both positive (verify full audit, site-specific wording) and negative (non-verify without full audit, ff without NEVER-skip, orphaned cleared to zero) are green
- WHEN any target wording is removed/restored, THEN the corresponding assertion turns red

---

## US-27: Change Metadata as an Enforced Contract [P1]

As a developer using the prospec SDD flow,
I want a structural error in `metadata.yaml` reported at the read that finds it, and every write to be checked before it lands,
So that a broken field never travels silently to a later station that misreads it.

**Acceptance Scenarios:**
- WHEN a station reads metadata whose `status`, `quality_log` entry, or `review_provenance` violates the schema, THEN it throws, naming the change and the offending field path
- WHEN a station writes metadata that violates the schema, THEN the write is refused and the target file is left untouched
- WHEN metadata carries keys the schema does not model, THEN validation passes and those keys survive the round trip unchanged

#### REQ-TYPES-064: Metadata Validation Error and Bare Module Names
Define the metadata contract's error type and the value-level constraints the stations enforce.
- WHEN validation fails, THEN a `MetadataValidationError` (`METADATA_VALIDATION_FAILED`) carries the change name and the zod field paths, and points at the metadata-format reference
- WHEN a `related_modules` entry carries markdown emphasis, backticks, surrounding whitespace, or is empty, THEN it is rejected; a bare name (`types`, `api-middleware`, `user_profile`) is accepted
- WHEN a `dimensions` entry reports a dimension the change's scale, `ui_scope`, or absent Knowledge base skipped, THEN `not-applicable` is valid there — never as the gate-level `result`, which stays the three-state
- WHEN metadata carries unmodeled keys at any level, THEN the schema (loose at every level) keeps them; the sole deliberate divergence is `warnings`, whose default only ever adds the key the format requires
- WHEN a station BUILDS metadata, THEN it uses the strict `NewChangeMetadata` view, because `z.infer` of a loose schema gains an index signature that would disable the excess-property check

#### REQ-LIB-031: Single Validated Entry Point for Change Metadata
`lib/change-metadata.ts` is the only place a station reads or writes a change's `metadata.yaml`.
- WHEN a station reads, THEN it receives both the validated value and the `Document`, so a later write preserves comments and unmodeled keys
- WHEN a station writes, THEN the value is validated first; a rejected write leaves the file byte-identical
- WHEN validation runs, THEN it only inspects — it never rewrites, reorders, or strips the caller's data
- WHEN metadata is written, THEN it goes through `atomicWrite()`; the helper imports only `types` and `lib`

#### REQ-SERVICES-067: Stations Read and Write Metadata Only Through the Helper
The stations that previously cast `doc.toJS() as ChangeMetadata` now go through the shared helper.
- WHEN change-story, change-plan, change-tasks, or `check --record-review` touches metadata, THEN it uses `lib/change-metadata`; no `as ChangeMetadata` cast remains in `services/`
- WHEN those stations meet metadata violating the required-field floor — including a pre-schema record with no `created_at` — THEN they reject it, naming the change and field
- WHEN `archive.service` or `lib/drift-sources` reads metadata, THEN it stays lenient by design: both scan every change directory, so a malformed record must surface as a report or a skip, never as a thrown scan. Archive is the terminal station and must still absorb records the earlier stations now reject; its floor is the archive Entry Gate's `metadata-completeness` check

#### REQ-TESTS-055: Metadata Contract Regression Coverage
Pin the contract against both the failures it must catch and the shapes it must not reject.
- WHEN a corrupted `status`, `quality_log`, or `review_provenance` is read, THEN a test asserts the error names the offending field path
- WHEN metadata carries unmodeled keys or YAML comments, THEN a test asserts a read → modify → write round trip preserves them
- WHEN shapes transcribed from real archived records are validated (grade, `not-applicable` dimension, `archived_at`, review counts), THEN they pass; the two historical malformations (grade in `result`, `warnings` as a string) fail
- WHEN the proposal template renders related modules, THEN a contract test using the real renderer asserts each name is bolded exactly once

---

## US-28: Deterministic SDD Station Routing [P1]

As an AI agent working a prospec project (resuming work at session start),
I want a `prospec status` command that computes each in-flight change's current node, next station, blocking gates, and reasons from `.prospec/changes/` metadata,
So that station-order derivation is testable deterministic code instead of per-session LLM interpretation of prose.

**Acceptance Scenarios:**
- WHEN a change is at `status: plan` THEN report current node plan and next station `/prospec-tasks`, with the reason citing the lifecycle edge
- WHEN `scale: quick` at `status: story` THEN next is `/prospec-tasks` (the legal skip) — `/prospec-plan` is never suggested
- WHEN `scale: backfill` at `status: implemented` THEN it is judged a legal lifecycle entry (not a skipped station) and routed onward per the review → verify order
- WHEN `status: implemented` THEN review is suggested before verify by workflow order (review owns no status transition; done-ness is read from `review_provenance`)
- WHEN proposal.md declares `ui_scope` full/partial at `status: plan` with no design-spec.md THEN `/prospec-design` is inserted between plan and tasks — never under `scale: quick` (router ruling, recorded in `_status-lifecycle.md`)
- WHEN no non-archived change exists THEN report the clean state

### Behavior Specifications

#### REQ-TYPES-070: Station-Routing Contract and Canonical Order
The types layer defines the SDD station order — including the workflow rank of the no-status-transition design/review stations and the `promote` backfill entry — and the `ChangeRouteFacts`/`ChangeRoute`/`StatusReport` report contract (current node, next station, blocking gates, reasons, per-change error entries). Implemented as `ChangeRoute` + `ChangeRouteError` (the delta-spec's `ChangeRouteEntry` expressiveness, split into routed/error shapes).
- WHEN the station order is read, THEN `SDD_STATIONS` is `story → plan → design → tasks → promote → implement → review → verify → archive` (periodic learn excluded from the linear order), and a contract test pins it against the `## Station order` chain carried by both `_status-lifecycle.md` copies — the claim of agreement is enforced, not asserted
- WHEN a station is routed to, THEN `STATION_SKILLS` names the skill that runs it for every station, `promote` → `/prospec-promote-backfill`
- WHEN `promote`'s rank is read, THEN it sits immediately before `implement` — the status a promotion lands at
- WHEN a change cannot be routed, THEN the contract expresses it as a named error entry, never a dropped record
- WHEN the change schema is consulted, THEN `CHANGE_STATUSES`/`CHANGE_SCALES` are unchanged — routing adds no status value

#### REQ-LIB-035: Pure Route Evaluator
`lib/status-router.ts` exposes the I/O-free `routeChange(facts)` — the executable copy of `_status-lifecycle.md`: six-state order, the `scale: quick` story→tasks legal skip, the `scale: backfill` `implemented` entry (absent plan/tasks are its normal state), the design station insertion (`ui_scope` full/partial between plan and tasks, never under a scale with no plan), review done-ness via `review_provenance`, verify B/C/D stay reasons, and the archive gate declarations — Knowledge sync **and** review/test provenance currency, the latter live on this edge because `verified` is inside `PROVENANCE_AUDITED_STATUSES` and the verify S/A commit stales both baselines by construction. Those gates are **declared, never evaluated**: the router stays I/O-free and never reads the drift report, so `prospec check` remains the only adjudicator. Which stations a scale skips is read from `SCALE_FORBIDDEN_ARTIFACTS`, not from a scale name re-tested here.
- WHEN the full status × scale matrix runs, THEN every computed station matches `_status-lifecycle.md` (fixture-pinned; retro-validated 46/46 against the local archive at verification)
- WHEN `scale: quick` at `story`, THEN next is tasks and plan.md is never gated on; WHEN `scale: backfill` at `implemented`, THEN it is a legal entry, not a skip
- WHEN `status: implemented` without `review_provenance`, THEN next is review (by workflow order, not status); with it, next is verify
- WHEN `status: verified`, THEN the blocking gates name review/test provenance currency alongside Knowledge sync, and the remedy they name is re-recording both baselines after the commit
- WHEN the function runs, THEN it performs no I/O (drift-checker evaluator precedent)
- WHEN a scale forbids `plan.md` but not `tasks.md`, THEN `story` routes to `tasks` (the quick skip) — derived from the registry, not from the scale's name
- WHEN a scale forbids both `plan.md` and `tasks.md` and the change has not reached `implemented`, THEN it routes to `promote` with the incomplete promotion as the reason, and its blocking gate names `prospec validate promote-scaffold`
- WHEN such a change reaches `implemented`, THEN routing resumes at the normal review/verify/archive path, and the completed station it reports is `promote` — never `implement`, a station that scale's contract never let it run
- WHEN a scale's contract has no plan, THEN the design station is never suggested for it at any status (design hangs off `plan`), keyed on the artifact registry rather than the scale's name

#### REQ-SERVICES-070: Status Service (Scan + Facts + Tolerance)
`status.service.ts` `execute()` scans non-archived changes in `.prospec/changes/`, reads each metadata through the schema-enforced `lib/change-metadata`, collects routing facts (artifact existence, `lib/task-markers` code-task completion, proposal `ui_scope`, provenance/quality_log), and routes via the pure evaluator. Read-only.
- WHEN metadata is missing or fails the schema, THEN that change yields a named error entry and the rest still route (never a crash, never a silent skip)
- WHEN `.prospec/changes/` is absent or holds no non-archived change, THEN the clean state is reported
- WHEN multiple changes are in flight, THEN each is reported with its own current/next/gates/reasons
- WHEN the service runs, THEN it writes nothing (byte-identical filesystem, test-pinned)

#### REQ-CLI-023: prospec status Command and Formatter
`commands/status.ts` (`registerStatusCommand`) + `formatters/status-output.ts`, registered in `index.ts`; thin delegation to the service, stdout for results, stderr via `handleError`, repo-derived strings through `sanitizeTerminal`.
- WHEN `prospec status` runs, THEN each in-flight change prints name, current node, next station, blocking gates, and reasons
- WHEN output renders, THEN free-form strings pass `sanitizeTerminal`; errors route to stderr
- WHEN the real CLI is exercised end-to-end, THEN the clean-state and in-flight scenarios pass

#### REQ-TESTS-058: Routing Test Matrix and Contract Updates
Unit (router full status × scale matrix, service memfs tolerance, formatter), contract (entry-config positive/negative Session Start assertions, dual-copy lifecycle markers), e2e (`prospec status`); the archive back-run is one-off verify evidence, with committed fixtures carrying the per-station pins.
- WHEN the router matrix runs, THEN six statuses, the quick skip, the backfill entry, B/C/D stays, and design/review placement are all covered
- WHEN service tests run, THEN invalid metadata, missing metadata, unparseable YAML, empty dir, and multi-change scenarios are covered
- WHEN contract assertions run, THEN they are section-scoped and mutation-verified (bundled templates are the render source — mutations must target the bundle)

---

## US-29: Deterministic Station Work Belongs to the CLI [P1]

As an AI agent running the prospec skills,
I want every deterministic station operation — scaffolding, lifecycle transitions, `quality_log` entries, task bookkeeping, review merging, verify grading, artifact structure checks — executed by a `prospec` command instead of hand-simulated,
So that the same repo state always produces the same bytes, a lifecycle transition cannot regress on a misread, and the skill spends its tokens on judgment only.

**Acceptance Scenarios:**
- WHEN a workflow skill needs a scaffold, a status advance, a `quality_log` entry or a task checkbox THEN it runs the matching `prospec change` subcommand and hand-writes no YAML
- WHEN a station owns a heavy deterministic engine (review merge, verify grading, artifact structure checks) THEN the engine runs inside the CLI and the skill supplies only its judgment input
- WHEN a transition would move backward, or reach a gate-owned status THEN the command refuses, lists the legal forward targets, and leaves the file untouched
- WHEN a command is replayed against the same inputs THEN its output and its writes are byte-identical
- WHEN a check is only partly mechanizable THEN the command reports the structural facts and the skill's judgment step is labelled as such — never presented as delegated

### Behavior Specifications

#### REQ-CLI-025: Change Lifecycle Write Commands (log / status / scale / progress)
Four `prospec change` subcommands take over the `metadata.yaml` and `tasks.md` mutations the skills used to hand-write. `change log` appends one structured `quality_log` entry (fixed `skill`/`date`/`result`/`warnings` plus the station's optional `grade`/`dimensions`/review counts) through `lib/change-metadata`. `change status <to>` is a forward-only lifecycle transition over `isStatusBefore`. `change scale <scale>` records the user-confirmed complexity. `change progress` does task-checkbox bookkeeping over the frozen task-kind grammar in `lib/task-markers` — the same parser verify's task-completion check reads.
- WHEN `change log` appends an entry, THEN the values are serialized as data (canonical key order, comments preserved, escaping owned by the serializer), so user text containing YAML metacharacters cannot corrupt the file
- WHEN `change status` is given a backward target, or a gate-owned one (`verified` is minted only by `prospec verify record` at grade S/A, `archived` only by `prospec archive`), THEN it exits 1 naming the legal forward targets with the file unchanged; a legal forward skip (`scale: quick`'s `story → tasks`) is deliberately allowed, and a target already reached is a no-op
- WHEN `change progress --complete <id|ordinal>` runs, THEN exactly one checkbox flips (an already-checked task is a no-op) and the reported X/Y denominator counts code tasks only — unchecked `[M]`/`[V]` tasks are surfaced as reminders, never counted or blocking

#### REQ-CLI-028: `prospec review merge` Merges the Cumulative Findings Table
The `review.md` findings table is merged by the CLI. The reviewer supplies one round's findings as JSON, **including each finding's identity** — code edits shift line numbers, so "is this the same finding as last round" is judgment, expressed by reusing the prior round's `id`; the CLI never infers identity from a location string. The `(location, lens)` fallback is reachable only where one side volunteers no identity — an incoming finding that carries none, or a candidate row written before ids existed — never merely because an id lookup missed. Given that input the bookkeeping is mechanical: merge by identity, escalate severity to the maximum, carry existing rows forward so a resolved finding is never re-raised, and render one canonical table through the shared `lib/markdown-table`. The round's `criticals_found`/`criticals_fixed`/`majors` counts are derived from the round's findings and feed `change log`.
- WHEN a finding reuses a prior round's `id`, THEN it updates that row, wherever the location has drifted to
- WHEN a finding carries an id no row holds yet, THEN it opens a new row even if an existing row shares its `(location, lens)` — the one exception is the first unclaimed pre-round row at that key carrying no id at all, which that new id adopts (the pre-ids legacy shape)
- WHEN two findings in one round carry the same id, THEN they update one row — reusing an id asserts sameness, so the second finding's status and summary win rather than opening a row
- WHEN a finding carries no id, THEN it keys on (location, lens) against the rows that existed before this round — updating the first unclaimed one in table order instead of creating a duplicate, whether or not that row carries an id
- WHEN two id-less findings in one round share a (location, lens), THEN they land as two rows: a row minted this round is never a fallback target and a pre-round row is claimable once, so declining to supply an id costs cross-round tracking only, never the finding's existence
- WHEN a finding moves the row it matched to a new location, THEN that row stops answering to its previous (location, lens) for the rest of the round — an id-less finding arriving at the vacated location takes the next unclaimed pre-round row there, or opens its own when there is none, rather than dragging the moved one back
- WHEN one round holds both an id naming a row and an id-less finding at that row's location, THEN the named row is reserved before any location matching, so the id-less finding never lands on it — it takes the next unclaimed pre-round row at that key, or opens its own — and asserted identity outranks inferred identity whatever order the findings arrive in, so neither finding's summary or severity lands on the other's row
- WHEN a merged row already carries a higher severity than the incoming finding, THEN the higher one is kept (severity only ever escalates)
- WHEN a pre-existing hand-written review.md is read, THEN its legacy shape parses (column aliases, missing ID/Summary tolerated) and the prose around the table is preserved
- WHEN the same round is merged twice, THEN the rendered table is byte-identical

#### REQ-CLI-029: `prospec verify record` Grades and Records the Verify Verdict
The verify decision table runs as code and the machine ledger self-sources. `verify record` accepts only the three judgment verdicts (`delta-spec-compliance`, `constitution`, `design`) plus the budget-counted WARN strings; the machine dimensions (`task-completion`, `knowledge`, `tests`) are read by the CLI from `prospec-report.json` — 5/5 from its `test-provenance` check, which is itself the reader of metadata `test_provenance` — and an LLM's relay of an engine verdict is refused outright. It computes the S/A/B/C/D grade, derives the gate three-state `result`, serializes the `dimensions`/`quality_log` entry, and on S/A advances `status: verified`. There is no engine-unavailability exemption class: every WARN counts against grade A's budget.
- WHEN `prospec-report.json` is absent, or its `change_digest` does not match the current code state, THEN the command refuses and names `prospec check --record-tests` then `prospec check --json` as the fix — a report older than the last edit never grades the current code; when the digest is not computable at all (no git repository) the freshness guard skips honestly rather than blocking
- WHEN the judgment input is not exactly the three judgment dimensions, THEN it refuses: a dimension that does not apply is passed as `not-applicable`, never omitted, and a machine dimension may not be passed at all
- WHEN the grade is B/C/D, THEN `status` is unchanged; WHEN S/A, THEN the `quality_log` entry and the status advance land in one atomic write
- WHEN a machine check honestly skipped, THEN its dimension is recorded `not-adjudicated` and the emitted WARN embeds that check's own skip reason, so the recorded warnings are the complete budget ledger

#### REQ-CLI-031: `prospec validate <kind>` Reports Artifact Structure Verdicts
One command carries the artifact checks the backfill / promote / design skills used to narrate, with the machine/judgment boundary drawn explicitly per kind: `slug` and `promote-scaffold` are **complete** verdicts; `backfill-draft` and `design-spec` report the **structural subset** and the skill applies the semantic rules over those facts. A failing verdict exits 1, like `check --strict`.
- WHEN `validate slug` runs, THEN the verdict is the executable `isSafeResourceName` guard (no path separators, no `..`, no empty segments)
- WHEN `validate promote-scaffold` runs, THEN it checks the artifact set — reviewed draft, proposal AND `delta-spec.md` present (promotion's own product), and none of the artifacts `SCALE_FORBIDDEN_ARTIFACTS` forbids under `scale: backfill` — plus `scale: backfill`, `status: implemented`, non-empty `related_modules`, and trust-zone cleanliness; a probe that cannot run (git failure, unreadable config) is reported as an explicit "could not verify" finding, never as clean
- WHEN the registry gains a forbidden artifact this verdict cannot probe, THEN it reports that gap as a FAIL rather than passing silently
- WHEN `validate backfill-draft` runs, THEN it reports route-header presence (`**Feature:**` / `**Story:**`), every `[NEEDS CLARIFICATION]` marker with its line, and the feature-map coverage gap as INFO — the >50% ratio classification (story-level denominator, heuristic-WHY exemption) is stated to be the skill's
- WHEN `validate design-spec` runs, THEN a missing required section or a remaining `[NEEDS CLARIFICATION]` FAILs, and component coverage is out of scope — extracting the component list from proposal prose is judgment

#### REQ-TEMPLATES-161: Workflow Skills Delegate Scaffold, Status and quality_log
new-story, plan, tasks, ff and implement call the commands instead of writing files: `prospec change story|plan|tasks` for the scaffold and its status advance, `change scale` for the confirmed complexity, `change status` for a later transition, `change log` for a `quality_log` entry, `change progress` for task bookkeeping. `references/metadata-format` is rewritten from the reader's side — field semantics for a CLI-written file — with its hand-serialization guidance removed.
- WHEN reading any of the five generated SKILL.md files, THEN no step creates a change file or hand-writes metadata.yaml, and each carries a NEVER forbidding it
- WHEN ff runs its three scaffold segments, including the quick `story → tasks` path, THEN every one goes through a `prospec change` command
- WHEN implement completes the last code task, THEN the checkbox came from `change progress --complete` and `status: implemented` from `change status`

#### REQ-TEMPLATES-163: review / verify / learn Skills Delegate Their Station Engines
The review skill emits its round as findings JSON to `review merge` and records every round via `change log` — including a review-clean round, whose counts are recorded as zeros. The verify skill passes only the three judgment verdicts to `verify record`, which owns the grade, the entry serialization and the S/A status advance. The learn skill hands each keyed lesson to `learn upsert`. Each skill keeps its judgment body: defect discovery and finding identity, dimension adjudication, semantic lesson matching, and the prose.
- WHEN reading the generated prospec-verify SKILL.md, THEN it contains no hand-computed decision table and no WARN-exemption narrative, and its NEVER list forbids adjudicating or relaying a machine dimension and forbids hand-writing the verify `quality_log` entry
- WHEN reading prospec-review / prospec-learn, THEN neither embeds the merge, upsert or scoring algorithm
- WHEN both templates render, THEN the review/verify division-of-labour statement still occurs exactly once across them (the pre-existing contract stays green)

#### REQ-TEMPLATES-165: backfill / promote Skills Delegate Validation and Scaffold
`prospec-backfill-spec` takes its structural facts from `validate backfill-draft` and checks its candidate feature slug with `validate slug`; the >50% guardrail stays in the skill, applied over the reported marker locations, because classifying which markers are story-level intent (and which are exempt heuristic-WHY notes) is semantic. `prospec-promote-backfill` builds the light scaffold with `change story` + `change scale backfill` + `change status implemented`, then gates on `validate promote-scaffold`.
- WHEN reading the generated prospec-promote-backfill SKILL.md, THEN no step hand-serializes metadata.yaml and the scaffold gate is `validate promote-scaffold`
- WHEN reading prospec-backfill-spec, THEN the ratio step is explicitly labelled judgment over the CLI's marker facts, not delegated
- WHEN either skill weighs a candidate feature slug, THEN it runs `validate slug` rather than restating the safe-name rule

#### REQ-TESTS-059: Four-Layer Coverage of the cli-first Delegation
The new engines and commands are covered at four layers: pure-engine unit tests in lib (`verify-grade`, `review-merge`, `lessons-ledger`, `artifact-validators`, `markdown-table`, including a bit-identical recomputation assertion), service and formatter unit tests, per-command e2e against a real temp project, and contract updates (probe single source, `bundled-templates-sync`, the startup-loading baseline, and the delegation wording pins). The negative assertions are mutation-verified.
- WHEN the suite runs, THEN `pnpm test` is green at ≥ 80% coverage; the factual-count contract is gated separately by REQ-TESTS-070, which is what actually runs `pnpm counts:check`
- WHEN a CLI-unavailable fallback phrase reappears under `skills/`/`agent-configs/`, or the shared probe stops being the single source, THEN a negative contract assertion turns red
- WHEN e2e runs, THEN each new command's success and refusal paths are exercised — the forward-only rejection, the validate-before-write refusal that leaves the file untouched, and `archive finalize --dry-run` writing nothing

---

## Deprecated Requirements

#### ~~REQ-TEMPLATES-031: Capability Spec Format Reference~~
**Removed**: 2026-03-02 | **Change**: redesign-spec-architecture
**Reason**: Replaced by REQ-SPEC-010 (Feature Spec Format). The Feature Spec covers all of the Capability Spec's information and strengthens human readability.

#### ~~REQ-SERVICES-031: archive.service skips REQ-prefix auto knowledge-update for backfill~~
**Removed**: 2026-07-05 | **Change**: remove-archive-auto-knowledge-update
**Reason**: archive.service's auto knowledge-update was removed entirely (no CLI drives it, and `updateIndex` would wipe the curated index), making "skip for backfill" moot. Knowledge sync is handled uniformly by the archive skill Entry Gate.

#### ~~REQ-SERVICES-033: Archive Auto Knowledge-Update forwards related_modules~~
**Removed**: 2026-07-05 | **Change**: remove-archive-auto-knowledge-update
**Reason**: After auto knowledge-update was removed, "forwarding related_modules to auto-update" no longer exists. Feature-prefix module derivation is handled instead by the archive skill Entry Gate (`related_modules`/`**Feature:**`→feature-map).

---

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-08-03 | fix-issue-106-drift-engine-blindspots | MODIFIED REQ-TEMPLATES-153 | REQ-TEMPLATES-153 |
| 2026-08-03 | add-learn-staleness-sweep | MODIFIED REQ-TEMPLATES-132 | US-24 (MODIFIED), REQ-TEMPLATES-132 |
| 2026-08-03 | extend-provenance-audit-scope | MODIFIED REQ-LIB-035 | REQ-LIB-035 |
| 2026-08-02 | mechanize-light-scale-gates | ADDED REQ-TYPES-074; ADDED REQ-SERVICES-076; ADDED REQ-LIB-040; ADDED REQ-TESTS-072; MODIFIED REQ-CHNG-011; MODIFIED REQ-TEMPLATES-087; MODIFIED REQ-CLI-031; MODIFIED REQ-TYPES-070; MODIFIED REQ-LIB-035; MODIFIED REQ-TEMPLATES-085 | REQ-TYPES-074, REQ-SERVICES-076, REQ-LIB-040, REQ-TESTS-072, REQ-CHNG-011, REQ-TEMPLATES-087, REQ-CLI-031, REQ-TYPES-070, REQ-LIB-035, REQ-TEMPLATES-085 |
| 2026-08-02 | enforce-counts-in-ci | ADDED REQ-TESTS-070; MODIFIED REQ-TESTS-059 | REQ-TESTS-070, REQ-TESTS-059 |
| 2026-08-02 | restrict-identity-fallback | MODIFIED REQ-CLI-028; MODIFIED REQ-TEMPLATES-066; MODIFIED REQ-TEMPLATES-067 | REQ-CLI-028, REQ-TEMPLATES-066, REQ-TEMPLATES-067 |
| 2026-07-31 | name-change-history-rows | ADDED REQ-SERVICES-075; ADDED REQ-TESTS-069 | REQ-SERVICES-075, REQ-TESTS-069 |
| 2026-07-31 | pilot-mutation-testing | ADDED REQ-TEMPLATES-169; ADDED REQ-TESTS-066 | REQ-TEMPLATES-169, REQ-TESTS-066 |
| 2026-07-30 | report-dropped-req-bullets | ADDED REQ-SERVICES-073; ADDED REQ-CLI-032; ADDED REQ-TEMPLATES-168; ADDED REQ-TESTS-064; MODIFIED REQ-TEMPLATES-166; MODIFIED REQ-SERVICES-072 | REQ-SERVICES-073, REQ-CLI-032, REQ-TEMPLATES-168, REQ-TESTS-064, REQ-TEMPLATES-166, REQ-SERVICES-072 |
| 2026-07-30 | add-harness-capability-flags | MODIFIED REQ-TEMPLATES-066; MODIFIED REQ-TEMPLATES-155 | REQ-TEMPLATES-066, REQ-TEMPLATES-155 |
| 2026-07-30 | fix-cli-first-regressions | ADDED REQ-SERVICES-072; ADDED REQ-TEMPLATES-166; ADDED REQ-TESTS-060; MODIFIED REQ-CLI-024 | REQ-SERVICES-072, REQ-TEMPLATES-166, REQ-TESTS-060, REQ-CLI-024 |
| 2026-07-30 | restore-cli-first | ADDED REQ-CLI-025; ADDED REQ-CLI-028; ADDED REQ-CLI-029; ADDED REQ-CLI-031; ADDED REQ-TEMPLATES-161; ADDED REQ-TEMPLATES-163; ADDED REQ-TEMPLATES-165; ADDED REQ-TESTS-059; MODIFIED REQ-CLI-024; MODIFIED REQ-SERVICES-071; MODIFIED REQ-TEMPLATES-153; MODIFIED REQ-TEMPLATES-145; MODIFIED REQ-TEMPLATES-159 | REQ-CLI-025, REQ-CLI-028, REQ-CLI-029, REQ-CLI-031, REQ-TEMPLATES-161, REQ-TEMPLATES-163, REQ-TEMPLATES-165, REQ-TESTS-059, REQ-CLI-024, REQ-SERVICES-071, REQ-TEMPLATES-153, REQ-TEMPLATES-145, REQ-TEMPLATES-159 |
| 2026-07-29 | archive-cli-entry | ADDED REQ-CLI-024; ADDED REQ-SERVICES-071; ADDED REQ-TEMPLATES-159; REQ-SERVICES-064 rationale updated (CLI entry now exists, still no auto knowledge-update) | REQ-CLI-024, REQ-SERVICES-071, REQ-TEMPLATES-159, REQ-SERVICES-064 |
| 2026-07-14 | add-metadata-format-reference | ADDED REQ-TEMPLATES-150 (the single authority reference for the metadata.yaml serialization format: loaded by new-story/ff, pointed to when downstream skills append fields, semantics defer to schema/`_status-lifecycle.md`) | US-1; REQ-TEMPLATES-150 (ADDED) |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-26 (scale honesty and ceremony pruning) + REQ-TEMPLATES-134/135/136/137/139/140 (verify quick reduction, archive quick parity, [P]/~lines optional, INVEST advisory, Quality-Gate dedup, commit semantics unified) (issue #67) | US-26, REQ-TEMPLATES-134, REQ-TEMPLATES-135, REQ-TEMPLATES-136, REQ-TEMPLATES-137, REQ-TEMPLATES-139, REQ-TEMPLATES-140 |
| 2026-06-19 | converge-archive-summaries | MODIFIED REQ-SERVICES-010; MODIFIED REQ-TEMPLATES-010; ADDED REQ-TESTS-033 | REQ-SERVICES-010, REQ-TEMPLATES-010, REQ-TESTS-033 |
| 2026-02-04 | mvp-initial | Establish the core change-management flow | US-1, US-2, US-4; REQ-CHNG-001~016 |
| 2026-02-09 | add-archive-system | Add the archive lifecycle phase | US-6; REQ-TYPES-010, REQ-SERVICES-010, REQ-TEMPLATES-010 |
| 2026-02-15 | redesign-spec-system | INVEST proposal, capability spec, Spec Sync, consistency verification | US-5, US-7; REQ-TEMPLATES-030~034, REQ-SPECS-001 |
| 2026-02-16 | enhance-knowledge-sdd-pipeline | Quality Gate, Brownfield/Greenfield, Technical Summary | US-3, US-8; REQ-TEMPLATES-040~045 |
| 2026-02-16 | add-design-phase | Design Phase dual mode, 4 platform adapters, UI Scope | US-9; REQ-TEMPLATES-050~058 |
| 2026-03-01 | remove-skill-language-directives | Reference format language neutrality | US-7; REQ-REF-001 |
| 2026-03-02 | v2-product-first migration | Reorganized into a product-first feature spec | All |
| 2026-03-02 | redesign-spec-architecture | Product-First architecture: Feature Spec Sync, Product Spec auto-generation, Spec Health, Feature/Story routing, deprecated Capability Spec Format | US-3,5,6,7; REQ-SPEC-010~013, REQ-TEMPLATES-010/033/034, REQ-SPECS-001; -REQ-TEMPLATES-031 |
| 2026-06-04 | skill-alignment (PR #2) | Canonical status lifecycle enforced across the full chain + Plan Call Chain/layering check | REQ-CHNG-004 (MODIFIED), REQ-TEMPLATES-059 (ADDED) |
| 2026-06-06 | decouple-verify-from-feature-spec | verify 4/5 changed to Knowledge↔code consistency, breaking the verify↔archive deadlock; lifecycle documents artifact ownership | REQ-TEMPLATES-034 (MODIFIED), REQ-CHNG-004 (MODIFIED) |
| 2026-06-14 | centralize-index-column-schema | related-module parsing switched to canonical column constants (position-stable, Description taken from the correct column, non-module rows skipped) | REQ-CHNG-003 (MODIFIED) |
| 2026-06-07 | add-output-contract | 11 skills add an Output Contract (success/failure self-assessment) + contract test | US-11; REQ-TEMPLATES-060/061, REQ-TESTS-001 |
| 2026-06-07 | make-constitution-executable | verify reports by Constitution severity grading | US-5; REQ-TEMPLATES-063 |
| 2026-06-08 | add-entry-exit-gates | Entry/Exit dual gates + quality_log cross-phase quality traceability | US-12; REQ-TYPES-022, REQ-TEMPLATES-064/065, REQ-TESTS-022 |
| 2026-06-08 | add-review-fix-loop | adversarial review→fix loop between implement↔verify + commit boundary moved to after verify(S/A) | US-13; REQ-TYPES-023, REQ-TEMPLATES-066/067/068, REQ-TESTS-023 |
| 2026-06-11 | gate-knowledge-at-archive | verify V4 downgrades this change's gap to informational; the archive Entry Gate becomes the sole mandatory knowledge sync checkpoint (BL-038 direction B) | US-14; REQ-TEMPLATES-083 (ADDED), REQ-TEMPLATES-034/045/010 (MODIFIED) |
| 2026-06-12 | add-scale-adapter | proportionate process: scale (quick/standard/full) process scaling + task kind schema frozen + quick dual backstop (BL-004 + OPT-B3/B5/B6) | US-15; REQ-TYPES-026, REQ-TEMPLATES-084~090 (ADDED), REQ-CHNG-004/014, REQ-TEMPLATES-010, REQ-SERVICES-010 (MODIFIED) |
| 2026-06-12 | add-drift-checker | verify V1/V4 changed to consume the `prospec check --json` deterministic report (explicit fallback, skipped≠PASS); the engine itself graduates to the drift-detection feature | US-16; REQ-TEMPLATES-092 (ADDED), REQ-TEMPLATES-045/088 (MODIFIED) |
| 2026-06-13 | enhance-skill-instructions | skill instruction quality pass: Constitution emptiness prompt, Phase-1 + per-phase gate (ff renumbered), status-aware handoff + new-session detection, implement progress anchoring (OPT B1/D1/A1/D5; D9 deferred to icebox) | US-17~20; REQ-TEMPLATES-096~100 (ADDED), REQ-TEMPLATES-061/085 (MODIFIED), REQ-TESTS-026 (ADDED) |
| 2026-06-15 | add-dependency-knowledge | plan/implement add optional on-demand Context7 dependency-layer knowledge (query only when touching a third-party lib, inject into Technical Summary, graceful/untrusted/non-gating, never enters the stable prefix) (BL-034) | US-21; REQ-TEMPLATES-101/102/103 (ADDED), REQ-TESTS-027 (ADDED), REQ-TEMPLATES-044 (MODIFIED) |
| 2026-06-15 | complete-capability-to-feature-migration | capability→feature terminology migration wrap-up: remove the orphaned capability-spec-format.hbs (completing REQ-TEMPLATES-031's implementation-layer removal), fix new-story's broken load path specs/capabilities/→specs/features/, align archive/implement residual wording with Feature Spec | REQ-CHNG-006/009 (MODIFIED); REQ-TEMPLATES-031 (REMOVED implementation-layer wrap-up) |
| 2026-06-16 | add-reverse-spec-extraction | brownfield WHAT-layer reverse spec extraction: prospec-design Extract Mode input=code variant (triangulation→route-compatible draft, >50% story-level guardrail, trust-zone never-write, uncovered detection, completeness/count-fidelity); MODIFIED REQ-DSGN-003 cross-reference (BL-032) | US-22; REQ-TEMPLATES-104~107, REQ-TESTS-028 (ADDED); REQ-DSGN-003 (MODIFIED, design-phase) |
| 2026-06-17 | extract-backfill-spec-skill | the input=code reverse variant is extracted into the standalone Lifecycle skill `prospec-backfill-spec` (naming reverse→backfill, reverse-draft.md→backfill-draft.md); prospec-design returns to pure Generate/Extract; contract REQ-TESTS-028 retarget + negative | US-22; REQ-TEMPLATES-108 (ADDED); REQ-TEMPLATES-104~107, REQ-TESTS-028 (MODIFIED); REQ-DSGN-003 (MODIFIED, design-phase) |
| 2026-06-19 | feature-first-backfill | backfill sourcing/coverage-scan unit module→feature vertical slice (two-stage gather→cluster, Pass-2 tracing cite `file:line`, cross-module integration-edge as a first-class AC gated on both-end grounding, Phase 4 uncovered feature, infrastructure-not-a-feature NEVER, feature-boundary-criteria reference externalized hasReferences:true) (BL-039) | US-22; REQ-TEMPLATES-109~112, REQ-TESTS-030 (ADDED); REQ-TEMPLATES-104/105/107/108 + US-22 AC (MODIFIED) |
| 2026-06-19 | backfill-promotion-path | `scale: backfill` (the 4th CHANGE_SCALES value, a lightweight scale) + the `/prospec-promote-backfill` skill let a brownfield backfill spec graduate end-to-end: promote produces a lightweight scaffold (proposal+delta-spec+metadata, no plan/tasks); verify assesses spec-fidelity, existing quality MUST downgraded to informational (provenance-gated), 1/5 N/A; archive accepts, derives from related_modules/Feature→feature-map, skips REQ-prefix auto knowledge-update | US-23; REQ-TEMPLATES-115~119, REQ-SERVICES-031, REQ-TESTS-034 (ADDED) |
| 2026-06-20 | harden-feature-prefixed-req-sync | archive standard/full derives feature-prefixed REQs from related_modules/feature-map instead (Entry Gate + service auto-update consistent), fixing the knowledge-sync miss + phantom module risk (BL-043) | US-14; REQ-TEMPLATES-120, REQ-SERVICES-033, REQ-TESTS-035 (ADDED) |
| 2026-07-03 | add-plan-flow-diagram | /prospec-plan produces a Mermaid behavior flow diagram for complex user stories (any-of structural signals, following _diagram-conventions.md, not counted toward the 120-line cap, read on-demand not entering Startup Loading); the contract test includes a cross-file consistency guard (issue #47) | US-2; REQ-TEMPLATES-125 (ADDED) |
| 2026-07-04 | carry-review-verify-evidence | the archive summary carries review/verify evidence: archive-format §6 `## Review & Verify` section (grade / criticals-majors / quality_log digest, no-fabrication, backfilled attach Source), prospec-archive Phase 2 write + Gate + NEVER, contract section-scoped pinning (issue #56) | US-6; REQ-TEMPLATES-126/127, REQ-TESTS-041 (ADDED) |
| 2026-07-04 | sync-knowledge-at-verify-commit | knowledge sync + count re-derivation moved earlier to the verify S/A commit prompt (prevention point), the archive Entry Gate downgraded to backstop (still FAIL-if-not-synced); kills PB-005's structural root cause (issue #65 part b) | US-14 (MODIFIED); REQ-TEMPLATES-129 (ADDED); REQ-CHNG-004, REQ-TEMPLATES-045, REQ-TEMPLATES-083 (MODIFIED) |
| 2026-07-04 | mechanize-review-gate | review provenance machine gate: verify Entry Gate blocks non-backfill absent/stale review (backfill exempt, CLI-unavailable falls back to reading quality_log), review records provenance each round + `--record-review` baseline, residual playbook PB-001/003/006/007 pushed back into implement/review gate, PB-004/005 retired (issue #66 scope 1+2+4) | US-24; REQ-TYPES-053, REQ-TEMPLATES-130/131/132, REQ-TESTS-043 (ADDED) |
| 2026-07-05 | converge-constitution-audit | Constitution full audit converged to the single verify site: planning/execution sites reduced to site-specific, non-verify Exit Gate narrowed to site-specific (quality_log retained), orphaned Constitution [STABLE] loading cleared, ff NEVER-skip removed; verify keeps the sole full audit (issue #66 scope 3) | US-25; REQ-TEMPLATES-133, REQ-TESTS-044 (ADDED); REQ-CHNG-008, REQ-TEMPLATES-065 (MODIFIED) |
| 2026-07-05 | remove-archive-auto-knowledge-update | remove archive.service.execute()'s auto knowledge-update (`updateIndex` would wipe the curated index) and the same block's raw-scan safety-net dead code + ArchiveResult/ArchivedChange fields, fix the prospec-archive skill's reverse claim; knowledge sync handled uniformly by the Entry Gate (issue #57 stop-the-bleed) | US-6; REQ-SERVICES-064 (ADDED); REQ-TESTS-034/035 (MODIFIED); REQ-SERVICES-031/033 (REMOVED) |
| 2026-07-05 | unlock-measurement | quality_log structured count fields (verify grade/dimensions, review criticals/majors machine-aggregatable) + introduced_by escaped-defect registration convention (shipped template + project doc); verify/review templates write the structured fields (issue #61) | US-12; REQ-TYPES-058, REQ-TEMPLATES-145 (ADDED); REQ-TYPES-022, REQ-TESTS-022 (MODIFIED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-28 | enforce-metadata-schema | metadata.yaml enforced as a runtime contract at the four stations that cast it unchecked; single validated read/write helper; bare module names with one shared stripper; dimension vocabulary widened to `not-applicable`; loose-at-every-level schema plus a strict build view | US-27; REQ-TYPES-064, REQ-LIB-031, REQ-SERVICES-067, REQ-TESTS-055 (ADDED); REQ-CHNG-003 (MODIFIED) |
| 2026-07-28 | split-verify-adjudication | ADDED REQ-TYPES-066, REQ-TEMPLATES-153/154/155/156/157, REQ-TESTS-057 (verify dimensions split between engine adjudication and fresh-context judgment); MODIFIED US-5 acceptance scenarios, REQ-TEMPLATES-034/045/063/145 (machine verdicts adopted verbatim, severities from the machine inventory, adjudicator recorded), REQ-TYPES-022 + REQ-TESTS-022 (dimension vocabulary) (issue #96) | US-5, US-12, REQ-TYPES-066, REQ-TEMPLATES-153, REQ-TEMPLATES-154, REQ-TEMPLATES-155, REQ-TEMPLATES-156, REQ-TEMPLATES-157, REQ-TESTS-057, REQ-TYPES-022, REQ-TEMPLATES-034, REQ-TEMPLATES-045, REQ-TEMPLATES-063, REQ-TEMPLATES-145, REQ-TESTS-022 |
| 2026-07-29 | add-status-router | Routing as code: read-only `prospec status` computes each in-flight change's current node / next station / blocking gates / reasons — the executable copy of `_status-lifecycle.md` (quick skip, backfill entry, no-status design/review placement, B/C/D stays); entry-config Session Start points at the command (net L0 reduction); MODIFIED REQ-TEMPLATES-099 + US-19 scenario (prose derivation → command); REQ-TEMPLATES-158 graduates in agent-integration (issue #97) | US-28; REQ-TYPES-070, REQ-LIB-035, REQ-SERVICES-070, REQ-CLI-023, REQ-TESTS-058 (ADDED); REQ-TEMPLATES-099 (MODIFIED) |
| 2026-07-30 | add-harness-capability-flags | prospec-review and prospec-verify stop judging harness capability in prose and render the shared `harness-capabilities` partial against the sync-resolved flags, each supplying only its own degraded action (issue #95) | REQ-TEMPLATES-066, REQ-TEMPLATES-155 (MODIFIED) |
| 2026-07-30 | report-dropped-req-bullets | archive spec-sync reports the authored `WHEN/THEN` bullets a `**Spec:**` block replaced without restating — a SET difference, never a count — in a `droppedBehavior` worklist distinct from `pendingConvergence`, rendered by the CLI and gated at Phase 3.5; delta-spec-format tells authors to write the resulting requirement, not the delta | US-30; REQ-SERVICES-073, REQ-CLI-032, REQ-TEMPLATES-168, REQ-TESTS-064 (ADDED); REQ-SERVICES-072, REQ-TEMPLATES-166 (MODIFIED) |
