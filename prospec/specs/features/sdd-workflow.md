---
feature: sdd-workflow
status: active
last_updated: 2026-07-14
story_count: 26
req_count: 119
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
Identify related modules by keyword-matching against the root-level `{base_dir}/index.md`.
- WHEN change name contains module keywords, THEN Related Modules lists matches
- WHEN no match, THEN Related Modules is empty
- WHEN parsing the `{base_dir}/index.md` table, THEN cells are read position-stably and Description comes from the canonical column index (REQ-KNOW-020); non-module rows (e.g. the Progressive Knowledge Loading Strategy table) are skipped by column count

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
- WHEN plan.md valid, THEN tasks.md groups by architecture layer
- WHEN parallelizable, THEN mark `[P]`
- WHEN design-spec.md exists, THEN UI tasks annotated for MCP design reading

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

### Behavior Specifications

#### REQ-TEMPLATES-034: Verify Skill Knowledge↔Implementation Consistency
- WHEN triggered, THEN verify dimension 4/5 grades ONLY pre-existing Knowledge drift (module READMEs vs code not touched by this change)
- WHEN a README describes behavior the code lacks (beyond this change's gap) or an existing module has no README at all, THEN graded WARN/FAIL (remediate via /prospec-knowledge-update or /prospec-knowledge-generate)
- WHEN this change's knowledge gap (delta-spec REQ not entered into README / README not updated / a module newly added by this change has no README yet), THEN informational only — not counted toward the grade, points to the `/prospec-archive` Entry Gate
- WHEN a permanent Feature Spec lags an un-archived change, THEN informational only (graduates at /prospec-archive) — not drift, does not affect grade
- WHEN an already-archived capability regresses or Feature Spec Health (Density/Freshness/Consistency) degrades, THEN informational signal for the developer, not grade-blocking
- WHEN ui_scope != none + design-spec.md exists, THEN execute design consistency check

#### REQ-TEMPLATES-045: Verify Knowledge Staleness Detection
- WHEN delta-spec MODIFIED but module README not updated, THEN informational note + pointer to the **verify S/A commit prompt** (folding the sync in before commit; the archive Entry Gate is the backstop) (not counted toward the grade)
- WHEN the `prospec check --json` report is available, THEN the source of truth for staleness is its `knowledge_health` section (git timestamps, deterministic) — verify references the data and does not re-derive it; when unavailable, fall back to LLM judgment and state so explicitly (grade semantics unchanged)

#### REQ-TEMPLATES-063: Verify Grades Constitution by Severity
verify Verification 3/5 reports by RFC-2119 severity grading of rules; the grade vocabulary stays PASS/WARN/FAIL (no fourth state added).
- WHEN a principle carries `[MUST]`/`[SHOULD]`/`[MAY]`, THEN map a violation MUST→FAIL, SHOULD→WARN, MAY→informational (does not affect grade)
- WHEN the Constitution is free-text without severity tags, THEN fall back to judgment-based PASS/WARN/FAIL (backward-compatible)

---

## US-6: Archive Completed Changes [P0]

As a developer using Prospec,
I want to archive completed changes via `/prospec-archive`,
so that `.prospec/changes/` stays clean, the SDD lifecycle closes correctly, and an audit trail accumulates.

**Acceptance Scenarios:**
- WHEN running `/prospec-archive` THEN the Entry Gate checks verified status and knowledge sync, and upon passing scans and moves to `.prospec/archive/{date}-{name}/`
- WHEN archiving completes THEN generate summary.md (knowledge sync is enforced by the Entry Gate; the service layer does not auto-trigger knowledge-update/raw-scan)
- WHEN Feature Spec Sync THEN read delta-spec ADDED/MODIFIED/REMOVED and merge into `specs/features/` (Replace-in-Place)
- WHEN Feature Spec Sync completes THEN auto-regenerate `specs/product.md`
- WHEN archiving completes THEN summary.md (and its committed `_archived-history` copy) carries a `## Review & Verify` section, so the audit trail carries review/verify evidence and does not evaporate with the gitignored bundle

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
`archive.service.execute()` no longer auto-triggers `executeKnowledgeUpdate` (→ `updateIndex`) or `generateRawScan` after archiving — because there is no `prospec archive` CLI command, and the auto knowledge-update's `updateIndex` would wipe the curated `index.md` table. Knowledge sync is enforced by the `/prospec-archive` skill Entry Gate, and the module README is folded in at the verify S/A commit; running each phase manually is the only path. `ArchiveResult` does not include `knowledgeUpdated`/`knowledgeWarnings`/`rawScanRefreshed` (`generateProductSpec`/`syncFeatureMap` are retained).
- WHEN `execute()` finishes archiving, THEN it does not call `executeKnowledgeUpdate`, does not call `generateRawScan`
- WHEN inspecting `ArchiveResult`, THEN it does not include knowledgeUpdated/knowledgeWarnings/rawScanRefreshed fields
- WHEN inspecting the prospec-archive skill template, THEN there is no reverse claim of a "service auto-triggers knowledge-update/raw-scan safety net"

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
The `ChangeMetadataSchema` optional `quality_log` entry: `skill`/`date`/`result`/`warnings[]`, additionally carrying optional structured fields `grade` (enum S/A/B/C/D), `dimensions` (`{name, result: PASS|WARN|FAIL}[]`), `criticals_found`/`criticals_fixed`/`majors` (int≥0) — so verify grade + dimensions and review counts can be machine-aggregated. `result` retains `GATE_RESULTS` (PASS/WARN/FAIL) gate semantics; grade goes in the separate `grade` field and does not override result.
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
- WHEN the unit test runs, THEN quality_log may be omitted, result is limited to PASS/WARN/FAIL, grade is limited to S/A/B/C/D, the new structured fields may be omitted and are correctly typed, and all 6 lifecycle states (including implemented) pass; the result three-state is not replaced by grade (mutation-verified)

#### REQ-TYPES-058: ChangeMetadata introduced_by escaped-defect registration field
`ChangeMetadataSchema` adds an optional `introduced_by` (string, pointing back to the change name that let this defect escape), so per-gate escaped-defect rate can accumulate; `_status-lifecycle.md` (and the shipped `init/status-lifecycle.md.hbs`) documents its format convention and example. It only registers a convention, performing no referential-integrity validation and adding no drift enforcement.
- WHEN metadata contains introduced_by, THEN the schema accepts it; omitting it still passes (backward-compatible)
- WHEN consulting the convention doc, THEN hit the introduced_by definition + example (the shipped template uses a consumer-agnostic example; the project doc uses issue #48 → fix-init-clobber-add-upgrade)

#### REQ-TEMPLATES-145: verify/review write structured quality_log fields
`prospec-verify` writes the structured `grade` (S/A/B/C/D) and `dimensions` (5+1 per-dimension PASS/WARN/FAIL) in the Exit/Status section; `result` still records the gate three-state; `prospec-review` writes `criticals_found`/`criticals_fixed`/`majors` in each round's quality_log entry. `metadata-completeness` reads only `grade` (`dimensions`/counts are for aggregation, read by no check).
- WHEN the contract test runs, THEN the verify section contains the `grade`+`dimensions` write instructions, and the review section contains the criticals/majors write instructions
- WHEN verify writes, THEN `result` is still PASS/WARN/FAIL (grade does not override result)

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
`prospec-review` uses a fresh-context reviewer to review the change diff between implement→verify; reviewer mode B by default / A opt-in; the **spec-architecture lens** (delta-spec REQ / dependency direction / conventions / ripple) is always layered on; a critical is drop-in auto-fixed after an independent verifier confirms it, escalating to a human after the hard cap.
- WHEN rendered, THEN it includes Entry Gate / Reviewer Modes / spec-architecture lens / verifier-confirmed critical / hard cap / escalation / Output Contract + Exit Gate
- WHEN a critical is reported, THEN auto-fix only when existence-verified; architectural/ambiguous → escalate to a human
- WHEN findings persist, THEN land them in `review.md` (dedup by Location, take the highest severity, carry forward across rounds)

#### REQ-TEMPLATES-067: Review Severity Contract + review.md Format
`references/review-format.md` defines the severity criteria and review.md structure. critical = real defect/security + dependency-direction violation + logical contradiction with a delta-spec REQ (completeness left to verify); major = perf/maintainability (does not block, downgraded to WARN, not counted toward grade); nit dropped.
- WHEN referenced, THEN it includes the three-tier criteria + auto-fix boundary + review.md fields (location/severity/lens/status) + reviewer-lens definitions

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
- **SC-002**: The Feature Spec Change History accumulates an audit trail, and product.md automatically reflects the latest feature map
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
ff reads `metadata.scale`: quick skips Phase 3 (Plan Generation; no plan.md/delta-spec.md produced, no module README loaded), status story → tasks; standard/full keep the three-phase flow. The lifecycle's two copies (`_status-lifecycle.md` + init template) document the quick transition, with a contract assertion locking their sync.
- WHEN quick, THEN the Output Contract self-assesses "plan absent per contract", not falsely reporting Unmet

#### REQ-TEMPLATES-086: Task Kind Marker Schema (Frozen)
The kind marker syntax is frozen in a single place, the tasks-format reference: `[M]` manual, `[V]` verification, no marker=code, coexisting with `[P]` (`[P]` first). Other template references do not restate it (locked by negative assertion).
- WHEN a consumer (tasks/verify/archive/implement) needs the definition, THEN reference the tasks-format "Task Kind Markers" section

#### REQ-TEMPLATES-087: Scale-Tiered Plan Depth
plan has three tiers by scale: quick is rejected at the Entry Gate and directed to tasks (no file produced), standard ≤120 lines (default), full is a complete architecture analysis (not subject to the 120-line cap). The plan-format reference includes three-tier guidance.

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
- WHEN a new session starts and a change with status≠archived exists THEN the entry config surfaces its name, status, and continuation step

### Behavior Specifications

#### REQ-TEMPLATES-098: Status-Aware Next-Step Handoff
plan/tasks/implement/review/verify/archive end with a Next-Step Handoff per the SDD workflow order + `(Y/n)`; Y triggers the next step via the agent, n stays; includes terminal/non-advancing branches. Carries the `Next:` field from REQ-TEMPLATES-061.
- WHEN rendered, THEN the six skills contain `Next-Step Handoff` + `(Y/n)` + `_status-lifecycle.md` (contract assertion)

#### REQ-TEMPLATES-099: New-Session In-Progress Change Detection
The agent entry config detects `.prospec/changes/` changes with status≠archived at session startup and surfaces the continuation step (per workflow order).
- WHEN rendered, THEN the entry config contains `Session Start` + `.prospec/changes/` detection

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
- WHEN reviewing the skill templates, THEN the residual playbook rules PB-001/003/006/007 are grep-hittable in the corresponding template (implement NEVER + review lens); PB-004/005, whose root cause was fixed in #65, are retired in the ledger/playbook

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
The residual playbook rules are inlined into the authoring decision points: PB-001 (contract assertions section-scoped+mutation-verify) → `prospec-implement` NEVER + review test-quality lens; PB-003 (claim ⊆ impl) → review docs-claims lens; PB-006 (extract a helper for parallel modules) → strengthen the review DRY lens; PB-007 (sweep every consumer) → `prospec-implement` NEVER + review parallel-site lens. PB-002 (freq 1, design-time) keeps its ruling in the playbook. PB-004/PB-005, whose root cause was fixed in #65, are retired in `_playbook.md`/`_lessons-ledger.md`.
- WHEN reviewing the template, THEN PB-001/003/006/007 are grep-hittable in the corresponding template
- WHEN reviewing the ledger/playbook, THEN PB-004/005 are marked retired and PB-002's ruling is recorded

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
| 2026-07-14 | add-metadata-format-reference | ADDED REQ-TEMPLATES-150 (the single authority reference for the metadata.yaml serialization format: loaded by new-story/ff, pointed to when downstream skills append fields, semantics defer to schema/`_status-lifecycle.md`) | US-1; REQ-TEMPLATES-150 (ADDED) |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-26 (scale honesty and ceremony pruning) + REQ-TEMPLATES-134/135/136/137/139/140 (verify quick reduction, archive quick parity, [P]/~lines optional, INVEST advisory, Quality-Gate dedup, commit semantics unified) (issue #67) | US-26, REQ-TEMPLATES-134, REQ-TEMPLATES-135, REQ-TEMPLATES-136, REQ-TEMPLATES-137, REQ-TEMPLATES-139, REQ-TEMPLATES-140 |
| 2026-06-19 | archive-sync | MODIFIED REQ-SERVICES-010; MODIFIED REQ-TEMPLATES-010; ADDED REQ-TESTS-033 | REQ-SERVICES-010, REQ-TEMPLATES-010, REQ-TESTS-033 |
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
