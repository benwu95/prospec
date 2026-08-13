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
