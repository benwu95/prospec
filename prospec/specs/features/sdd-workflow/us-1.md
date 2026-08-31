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
- WHEN the caller supplies a pre-rendered proposal body, THEN it is written verbatim and the template is not rendered — one creation procedure, whichever body it writes
- WHEN the caller supplies a `scale`, THEN it is written into `metadata.yaml` at creation, so a change whose scale is known up front needs no second command to record it
- WHEN the caller asks for a dry run, THEN every resolution and validation still runs — the collision refusal and the metadata schema check included — and nothing is written; the result says `dryRun`, and its file list is what WOULD be written rather than a claim that it exists

#### REQ-CHNG-003: Auto-Identify Related Modules
Identify related modules by keyword-matching against the root-level `{base_dir}/index.md`, taking the **bare** module name from the Module cell.
- WHEN change name contains module keywords, THEN Related Modules lists matches
- WHEN no match, THEN Related Modules is empty
- WHEN parsing the `{base_dir}/index.md` table, THEN cells are read position-stably and Description comes from the canonical column index (REQ-KNOW-020); non-module rows (e.g. the Progressive Knowledge Loading Strategy table) are skipped by column count
- WHEN the Module cell carries display emphasis (`**types**`), THEN the emphasis is stripped via the shared `stripCellEmphasis` before the value is used as a module name — one source shared with `parseIndexModules`, so the two never disagree on a module's identity
- WHEN the name reaches `related_modules` or the proposal, THEN it is bare: metadata holds `types`, and the proposal template applies the single layer of bolding
- WHEN the caller passes an explicit module list — INCLUDING an empty one — THEN keyword matching is not run: an empty list is the caller's answer, not the absence of one

#### REQ-CHNG-004: Change Metadata Lifecycle
Track status via metadata.yaml, with `ai-knowledge/_status-lifecycle.md` as the single source of truth: `story` → `plan` → `tasks` → `implemented` → `verified` → `archived`; `scale: quick` permits `story` → `tasks`, a legal skip of plan.
- WHEN each workflow skill completes, THEN advance status per the canonical lifecycle: new-story → `story`, plan → `plan`, tasks → `tasks`, implement → `implemented`
- WHEN metadata `scale: quick`, THEN `story → tasks` is the single legal skip (no plan.md/delta-spec.md produced; spec and knowledge impact are re-checked by the archive Entry Gate against the actual diff)
- WHEN verify reaches grade S/A, THEN status → `verified`; WHEN grade B/C/D, THEN status unchanged (re-run after fixing)
- WHEN archive runs, THEN accept only `verified` changes
- WHEN any workflow skill needs the state machine, THEN point at `_status-lifecycle.md` as the source of truth
- WHEN gating artifacts, THEN Feature Specs are updated ONLY by `/prospec-archive` (Phase 3.5 graduation); `/prospec-verify` gates on Knowledge↔code and does NOT gate on Feature Spec freshness — preventing a verify↔archive deadlock
- WHEN reaching the S/A commit boundary, THEN module-README Knowledge is synced at the verify S/A commit prompt (the prevention point) and the archive Entry Gate is the backstop that still FAILs when unsynced; Feature Specs remain archive-Phase-3.5-only (the deadlock-avoidance line above is unchanged)
- WHEN `prospec change auto-draft` creates a change, THEN its `scale` is assigned from the drift check that triggered it rather than confirmed by a user — a machine-assigned scale is as legal as a confirmed one, and the lifecycle document says so rather than stating a blanket "user-confirmed"

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

#### REQ-TEMPLATES-059: Plan Call Chain, Architecture Verification, and Multi-Candidate Selection
Plan Call Chain, architecture verification, and multi-candidate selection in `/prospec-plan` and plan-format.
- WHEN prospec-plan produces plan.md, THEN include a Call Chain section (and plan-format.hbs defines it)
- WHEN metadata.scale is full, THEN Phase 4 performs Best-of-N candidate architecture generation and pairwise tournament selection
- WHEN Plan Phase 6 runs, THEN an independent Architecture Verifier audits the plan and delta-spec against project architecture principles and the orthogonal rubric
- WHEN verify dimension 3/5 runs, THEN re-check layering against the Constitution

#### REQ-TEMPLATES-125: Plan Conditional User Story Flow Diagram
`/prospec-plan` produces a Mermaid behavior/decision flow diagram in plan.md (Section 5) for structurally complex user stories, following the `_diagram-conventions.md` conventions, complementary in scope to the Call Chain (REQ-TEMPLATES-059).
- WHEN a user story matches any-of the structural signals (>=2 branching decision points / >=3 sequential state transitions or multiple terminal states / cross-module, cross-role where sequence is the key to understanding), THEN plan.md embeds one Mermaid diagram of that story's behavior/decision flow
- WHEN a user story is a single linear happy path or a single-step CRUD, THEN do not produce a flow diagram
- WHEN producing a flow diagram, THEN follow the `_diagram-conventions.md` classDef/node conventions, and the diagram block does not count toward the 120-line standard cap
- WHEN describing the diagram-production step, THEN prospec-plan Phase 4 reads `_diagram-conventions.md` on-demand, and never adds it to Startup Loading (cache stability)

#### REQ-TEMPLATES-182: Plan Architecture Verifier Rubric Reference
A structured architecture verification rubric template (`plan-verifier-rubric.md`) defining architecture-agnostic orthogonal criteria decomposition for plan-stage review.
- WHEN `plan-verifier-rubric.md` is rendered, THEN it defines five orthogonal evaluation dimensions: Project Layering & Dependency Direction, Blast Radius & Ripple Effects, State Safety & Reversibility, Delta-Spec Completeness, and Reuse & Single-Source
- WHEN the Reuse & Single-Source dimension is applied, THEN for every new writer / creator / parser / formatter surface the plan introduces, the verifier either names the target project's existing owner with retrieval evidence (module README Modification Guide, conventions, module map, grep) or confirms the plan argues the rewrite explicitly; a plan with no new surface states a vacuous PASS, an owner search that finds nothing records that negative evidence, evidence collection may be delegated to a fast executor while the verifier only adjudicates, and a `standard` plan missing its `Simpler Alternative` counts as an unargued rewrite
- WHEN an existing owner is bypassed without a stated rationale, or a `standard` plan lacks its Simpler Alternative, THEN the Verdict table grades it FLAWS regardless of the path the surface sits on (Break-Glass Override unchanged); the rubric names the single-source bypass criterion in `review-format.md` only as the review-stage counterpart — whose two-condition threshold is deliberately narrower — and never restates its definition
- WHEN evaluating a project, THEN the rubric instructs dynamic inspection against the project's `CONSTITUTION.md` and `_conventions.md` without hardcoding CLI-specific layers
- WHEN measured for knowledge token budget, THEN the template size remains $\le 2500$ tokens
- WHEN the Architecture Verifier writes its report, THEN the reference owns a JSON schema with `verdict`, the exact five dimensions, evidence, and warnings; the orchestrator accepts only a readable non-empty schema-valid file, probes lifecycle while pending, discloses terminal degradation, and NEVER synthesizes PASS

#### REQ-TEMPLATES-183: Shift-Left Architecture Verifier in prospec-plan
Phase 6 of `/prospec-plan` performs independent architecture verification against plan.md and delta-spec.md using orthogonal criteria decomposition.
- WHEN Phase 6 begins, THEN `prospec-plan` loads `references/plan-verifier-rubric.md` on-demand in-phase without placing it in Startup Loading
- WHEN the environment supports subagents (`can_spawn_subagent: yes`), THEN an independent fresh-context Architecture Verifier subagent is spawned to audit `plan.md` and `delta-spec.md`
- WHEN the environment does not support subagents, THEN verification degrades to a two-phase prompt isolation with clear notification to the developer
- WHEN the verifier discovers architectural flaws or warnings, THEN findings are recorded to `plan.md` Risk Assessment and appended to `metadata.yaml` `quality_log`
- WHEN false positives occur, THEN the developer may exercise Break-Glass Override by providing a manual bypass rationale
- WHEN `/prospec-ff` executes Plan phase verification, THEN it aligns with the same architecture verification gate and degradation policy
- WHEN the verifier returns a report path or completion prose, THEN Phase 6 MUST verify the readable non-empty file against the rubric-owned report schema before progression, inspect lifecycle/transcript evidence while pending, and NEVER fabricate a report or fresh-context PASS; terminal failure follows the disclosed degraded path

#### REQ-TESTS-089: Contract Tests for Plan Verifier and Rubric
Contract test suite asserts the invariants of the Plan Architecture Verifier and its rubric.
- WHEN contract tests execute, THEN they assert `plan-verifier-rubric.md` is cited on-demand in Phase 6 and excluded from Startup Loading
- WHEN measuring reference size, THEN `plan-verifier-rubric.md` satisfies the $\le 2500$ tokens budget
- WHEN verifying reference deployment, THEN `getSkillReferences` contains `plan-verifier-rubric.md` for both `prospec-plan` and `prospec-ff`

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
- WHEN delta-spec generated, THEN each MODIFIED/REMOVED REQ's `**Feature**` header is checked mechanically by `prospec check` to resolve to the feature that hosts the REQ id, while the ADDED `**Story**` follows the delta-spec-format reference's trust-zone numbering as an authoring rule rather than a mechanical check

#### REQ-SPEC-012: Delta-Spec Feature Routing Metadata
Each REQ in delta-spec.md adds Feature/Story routing fields, specifying which Feature Spec to write to at archive time. The `**Story**` value is a trust-zone story number, not a proposal.md number: archive routes an ADDED REQ to the slice owning that story, while a MODIFIED or REMOVED REQ is located by its REQ id and the field stays a human-read, auditable pointer to where the REQ already lives.
- WHEN ADDED/MODIFIED REQ, THEN includes `**Feature**: {feature-name}` field
- WHEN ADDED/MODIFIED REQ, THEN includes `**Story**: US-{N}` field
- WHEN Plan Skill generates delta-spec, THEN routing fields auto-populated
- WHEN an ADDED REQ lands under an existing trust-zone story, THEN its `**Story**` is that story's number in the target Feature Spec; opening a new story uses the feature's current highest story number plus one
- WHEN a MODIFIED or REMOVED REQ carries `**Story**`, THEN it names the trust-zone story the REQ currently lives under, and archive resolves the REQ by its id regardless

#### REQ-TEMPLATES-206: Plan Brownfield/Greenfield Detection
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

#### REQ-TEMPLATES-184: Candidate Evaluation Reference Template
A structured candidate evaluation rubric template (`candidate-evaluation.md`) defining orthogonal architecture generation and symmetric pairwise tournament selection.
- WHEN `candidate-evaluation.md` is rendered, THEN it defines orthogonal candidate generation guidelines (Option A Pragmatic/Minimal Surface vs Option B Decoupled/Clean Architecture)
- WHEN evaluating candidates, THEN it instructs dynamic anchoring to the project's manifests and `_conventions.md`
- WHEN conducting tournament comparison, THEN it uses position-swapped pairwise comparison across Blast Radius & Complexity, Constitution & Layering Adherence, and Extensibility vs Simplicity
- WHEN measured for knowledge token budget, THEN the template size remains $\le 2500$ tokens
- WHEN a Candidate or Tournament Judge writes a delegated report, THEN this reference owns its JSON schema and required closed fields; the orchestrator accepts only a readable non-empty schema-valid file, probes lifecycle while pending, discloses terminal degradation, and NEVER substitutes a verbal or mock record

---

#### REQ-TEMPLATES-185: Multi-Candidate Architecture Selection in prospec-plan
Phase 4 of `/prospec-plan` performs multi-candidate architecture selection and tournament evaluation for `scale: full` changes.
- WHEN `metadata.scale` is `full` (or requested on-demand), THEN Phase 4 loads `references/candidate-evaluation.md` in-phase on-demand without preloading into Startup Loading
- WHEN generating candidate architectures, THEN generate 2-3 orthogonal options and execute symmetric pairwise tournament selection
- WHEN running in a subagent-capable environment, THEN parallelize candidate generation and tournament judging; degrade to sequential prompt isolation in single-context environments
- WHEN finalizing plan.md, THEN record trade-off analysis, winning option rationale, and non-selected candidate summaries in Technical Summary and Risk Assessment
- WHEN any Candidate or Tournament Judge returns a path or completion prose, THEN Phase 4 MUST verify the physical non-empty report against the reference-owned schema before selection, inspect lifecycle/transcript evidence while pending, and NEVER fabricate an option or decision; terminal failure uses the disclosed sequential degraded path

---

#### REQ-TESTS-090: Contract Tests Pin prospec knowledge verify Guidance
Contract tests assert that both `prospec-knowledge-update` and `prospec-verify` contain explicit instructions to run `prospec knowledge verify`.
- `tests/contract/skill-format.test.ts` asserts `skills/prospec-knowledge-update.hbs` instructs running `prospec knowledge verify <modules...>` after README content review/update.
- `tests/contract/skill-format.test.ts` asserts `skills/prospec-verify.hbs` S/A commit prompt instructs running `prospec knowledge verify <modules...>`.

---

#### REQ-TEMPLATES-186: Task Architecture & Contract Verifier Rubric Reference
A structured task verification rubric template (`tasks-verifier-rubric.md`) defining architecture-agnostic orthogonal criteria decomposition for tasks-stage contract review.
- WHEN `tasks-verifier-rubric.md` is rendered, THEN it defines four orthogonal evaluation dimensions: Bidirectional Contract Coverage, DAG Dependency & Layering Topological Order, TDD Module Test Closure, and Task Sizing & Marker Schema Compliance
- WHEN evaluating a project, THEN the rubric instructs dynamic inspection against the project's `CONSTITUTION.md`, `_conventions.md`, and `module-map.yaml` without hardcoding CLI-specific layers
- WHEN measured for knowledge token budget, THEN the template size remains $\le 2500$ tokens
- WHEN the Task Verifier writes its report, THEN the reference owns a JSON schema with `verdict`, the exact four dimensions, evidence, and warnings; the orchestrator accepts only a readable non-empty schema-valid file, probes lifecycle while pending, discloses terminal degradation, and NEVER synthesizes PASS

---

#### REQ-TEMPLATES-187: Shift-Left Task Contract & DAG Dependency Verifier in prospec-tasks and prospec-ff
Phase 6 of `/prospec-tasks` performs independent task contract and DAG dependency verification against `tasks.md`, `delta-spec.md`, and `plan.md` using orthogonal criteria decomposition.
- WHEN Phase 6 begins, THEN `prospec-tasks` loads `references/tasks-verifier-rubric.md` on-demand in-phase without placing it in Startup Loading
- WHEN the environment supports subagents (`can_spawn_subagent: yes`), THEN an independent fresh-context Task Verifier subagent is spawned to audit `tasks.md` against `delta-spec.md` and `plan.md`
- WHEN the environment does not support subagents, THEN verification degrades to a two-phase prompt isolation with clear notification to the developer
- WHEN the verifier discovers defects or layering violations, THEN findings are recorded to `metadata.yaml` `quality_log` (FLAWS block progression unless a Break-Glass Override is provided)
- WHEN `/prospec-ff` executes Tasks phase verification, THEN it aligns with the same task verification gate and degradation policy
- WHEN the verifier returns a report path or completion prose, THEN the station MUST verify the readable non-empty file against the rubric-owned report schema before progression, inspect lifecycle/transcript evidence while pending, and NEVER fabricate a report or PASS; terminal failure follows the disclosed degraded path

---

#### REQ-TEMPLATES-188: tasks-format.hbs Bidirectional Contract & Verifier Self-Check Enhancement
The `tasks-format.md` reference specifies bidirectional traceability self-checking guidelines and verifier compliance for tasks generation.
- WHEN referencing `tasks-format.md`, THEN it includes guidelines for forward REQ-ID coverage and backward traceability to plan steps
- WHEN explaining layer ordering, THEN it specifies dynamic adaptation to project conventions with neutral examples only (e.g. `Domain → Ports → Adapters` or `Models → Services → Controllers`), never the host project's own dependency direction

---

#### REQ-TESTS-091: Contract Tests for Task Verifier and Rubric
Contract test suite asserts the invariants of the Task Verifier and its rubric.
- WHEN contract tests execute, THEN they assert `tasks-verifier-rubric.md` is cited on-demand in Phase 6 of `prospec-tasks` and Phase 4 of `prospec-ff`, and excluded from Startup Loading
- WHEN measuring reference size, THEN `tasks-verifier-rubric.md` satisfies the $\le 2500$ tokens budget
- WHEN verifying reference deployment, THEN `getSkillReferences` contains `tasks-verifier-rubric.md` for both `prospec-tasks` and `prospec-ff`

---

#### REQ-TEMPLATES-189: Draft-First Protocol in prospec-new-story Skill
The `prospec-new-story` skill template operates under a Draft-First protocol by default to minimize cognitive interruption and context switching.
- WHEN activated without `--interactive`, THEN the skill autonomously infers a kebab-case change name and `metadata.scale` (with explicit reasoning) based on user prompt and `index.md` module keywords
- WHEN scaffolding and generating `proposal.md`, THEN the skill appends all inferred assumptions to a `## Stated Assumptions` section in the project's configured `artifact_language`
- WHEN intent ambiguity is high (key context/constraints missing and cannot be derived from code/specs), THEN the skill asks at most one targeted question at a time (Action: Question)
- WHEN `--interactive` is specified or requested, THEN the skill falls back to step-by-step interview and confirmation mode
- WHEN advisory checks (INVEST advisory check, knowledge single-line check) produce warnings, THEN they are silently recorded to `metadata.yaml` `quality_log` without blocking the workflow or cluttering the conversation

---

#### REQ-TEMPLATES-190: Stated Assumptions Section in Proposal Format Reference
The proposal format reference (`references/proposal-format.md`) includes a structured `## Stated Assumptions` section.
- WHEN rendering `references/proposal-format.md`, THEN it defines the `## Stated Assumptions` section for capturing autonomous inferences (change name, scale, default constraints, boundary assumptions) for human review
- WHEN written in downstream projects, THEN the section is authored in the downstream project's configured `artifact_language`

---

#### REQ-TEMPLATES-191: Streamlined Next-Step Handoff Partial
The `_next-step-handoff.hbs` partial provides non-blocking, direct next-step guidance across all SDD skill templates.
- WHEN a skill completes and renders the Next-Step Handoff section, THEN it recommends the successor skill and command directly without asking blocking `Run <next-step> now? (Y/n)` questions
- WHEN the lifecycle reaches a terminal or non-advancing state, THEN it directs the user to the appropriate review, corrective, or periodic skill (e.g. `/prospec-learn`)

---

#### REQ-TESTS-092: Contract Tests for Draft-First Protocol and Streamlined Handoff
Contract tests verify that generated skill templates conform to the Draft-First protocol and streamlined handoff rules.
- WHEN verifying `prospec-new-story`, THEN contract tests assert Draft-First instructions, Stated Assumptions requirements, `--interactive` fallback, and silence-aware quality logging
- WHEN verifying `_next-step-handoff.hbs` and rendered skills, THEN contract tests assert the absence of blocking `(Y/n)` prompts
- WHEN verifying `references/proposal-format.md`, THEN contract tests assert the presence of `## Stated Assumptions`

---

#### REQ-TYPES-086: Cascade and Circuit Breaker Types
The types module exports type definitions and Zod schemas for pipeline cascading orchestration, oscillation detection, and circuit breaker states.
- WHEN cascade types are imported, THEN `CascadeScale`, `CircuitBreakerState`, `OscillationRecord`, and `EscalationReport` are available
- WHEN validating cascading configuration or state, THEN Zod schemas enforce type constraints and default thresholds (3-5 max rounds)

---

#### REQ-LIB-057: Oscillation Breaker and Circuit Breaker Logic
The lib module provides a `ReviewCircuitBreaker` utility to guard against runaway loops and flip-flop defect oscillations.
- WHEN a defect or test flips from FAIL to PASS to FAIL, THEN `detectOscillation` returns true and identifies the oscillating signature
- WHEN the in-loop round count reaches the configured maximum (default 3, max 5) while unresolved criticals remain, or oscillation is detected, THEN `checkCircuitBreaker` trips and returns an `EscalationReport`

---

#### REQ-LIB-058: Dynamic Multi-Language Project Test Command Detection
The lib module dynamically detects and resolves test commands across multiple programming ecosystems (`src/lib/project-runner.ts`).
- WHEN `tech_stack.test_command` is set in `.prospec.yaml`, THEN that command is returned verbatim
- WHEN `tech_stack.test_command` is unset, THEN `detectTestCommand` checks project manifests (`Cargo.toml` -> `cargo test`, `pytest.ini`/`pyproject.toml` -> `pytest`, `go.mod` -> `go test ./...`, `package.json` -> package manager test script) and returns the matching test command or null

---

#### REQ-SERVICES-091: Cascade Orchestration Service and Transition Evaluator
The services module provides cascading workflow state transition evaluation and Tastemaker delivery generation.
- WHEN evaluating a transition with all verifiers passing, THEN the next valid lifecycle station for the change's scale is returned
- WHEN a change achieves Verify Grade S/A, THEN a Tastemaker presentation is generated and status transitions to awaiting human sign-off without performing automated git commit or push

---

#### REQ-TEMPLATES-192: Cascade Protocol, Circuit Breaker, and Project Test Runner References
The template library includes skill references for cascading execution, circuit breakers, and project test runner adapters.
- WHEN skills consult cascading references on demand, THEN `cascade-protocol.md`, `circuit-breaker.md`, and `project-test-runner.md` provide clear, verifiable rules for autonomous execution, runaway prevention, and ecosystem adaptation
- WHEN `cascade-protocol.md` states the plan → tasks transition gate, THEN it requires Architecture Verifier PASS on five orthogonal dimensions (or a documented Break-Glass override), matching the rubric's dimension count

---

#### REQ-TEMPLATES-193: Autonomous Pipeline Cascading Integration in Prospec Skills
Prospec skill templates instruct AI agents to perform autonomous pipeline cascading gated on machine verifiers and human sign-off.
- WHEN cascading mode is triggered, THEN the agent advances sequentially through planning, implementation, review, and verification whenever verifiers pass
- WHEN Grade S/A is reached in verification, THEN the agent presents the Tastemaker summary and halts for human sign-off before any commit or archive
- WHEN cascading enters a delegated station or receives its subagent result, THEN it MUST reload and follow that station's receipt/schema contract, MUST stop on a missing or invalid payload, and MUST NEVER use a verbal/mock shortcut or claim a fresh-context PASS without a verified physical report

---

#### REQ-TESTS-093: Unit, Contract, and E2E Tests for Pipeline Cascading
The test suite validates pipeline cascading components, oscillation breakers, project test runner resolvers, and skill template contracts.
- WHEN running unit and contract tests, THEN oscillation detection, project test command resolution, and template contracts pass without regressions

---

#### REQ-TEMPLATES-195: Per-station Execution Loop in cascade protocol
The cascading protocol reference defines a per-station Execution Loop whose first step reloads the station's skill.
- WHEN a station is entered during cascading, THEN the loop runs Step 1 [LOAD] (read the station's `SKILL.md`) → Step 2 [ENTRY] (station entry gates) → Step 3 [EXEC] (per SKILL.md and its references) → Step 4 [GATE] (machine verifiers; FAIL trips the Oscillation Breaker) → Step 5 [NEXT] (`prospec status`, then back to Step 1)
- WHEN the loop names the skill read, THEN it uses harness-neutral wording and a relative reference to the station skill, not an absolute or hardcoded path

---

#### REQ-TEMPLATES-196: Standardized fresh-context delegation without named agents
Heavy stations delegate to fresh context through the shared harness-capabilities partial, never through named agents or tools.
- WHEN review or verify requires fresh context, THEN it resolves the sub-agent-vs-degradation path from the `can_spawn_subagent` capability flag via the harness-capabilities partial
- WHEN any skill or reference body describes delegation, THEN it names no harness-specific tool (`view_file`, `invoke_subagent`) and no plugin agent type (`code-reviewer`, `security-auditor`, `test-engineer`)

---

#### REQ-TYPES-087: ChangeRoute carries the next station's skill path
The `ChangeRoute` contract carries an optional `nextSkillPath` string for the next station's skill file.
- WHEN a next station and a configured agent both resolve, THEN `nextSkillPath` is the resolved skill file path
- WHEN the change is terminal or no agent is configured, THEN `nextSkillPath` is absent

---

#### REQ-LIB-059: Pure resolver for the next station's skill path
A pure resolver derives the next station's skill file path from the configured agents and the target station.
- WHEN given a non-empty agent list and a non-null station, THEN it returns `{canonicalSkillPath}/{STATION_SKILLS[station] without leading slash}/SKILL.md`, where the canonical skill path comes from the first configured agent's registry entry
- WHEN the agent list is empty or the station is null, THEN it returns null
- WHEN resolving, THEN it performs no I/O (agent names and station are passed in)

---

#### REQ-SERVICES-092: status service attaches the resolved skill path
The status service enriches each routed change with its next station's resolved skill path.
- WHEN the service routes a change, THEN it calls the pure resolver with the project's configured agents and the routed next station and sets `nextSkillPath` on the route
- WHEN config cannot be read or declares no agents, THEN the route's `nextSkillPath` stays absent and routing is otherwise unchanged

---

#### REQ-CLI-039: status output surfaces the actionable skill target
`prospec status` surfaces the next station's skill file as an actionable target.
- WHEN a routed change has a `nextSkillPath`, THEN the output prints, below `next:`, an `action:` line naming that path and instructing the agent to read the skill file before executing station checks
- WHEN `nextSkillPath` is absent, THEN the output is unchanged (slash-command `next:` only), never a hardcoded skills directory

---

#### REQ-TESTS-094: Contract, unit, and e2e coverage for station-transition awareness
The test suite pins the station-transition awareness contracts.
- WHEN contract tests run, THEN they assert `entry.md.hbs` renders a Station Transition Protocol using `{{skill_path}}` with no harness tool name, `cascade-protocol.hbs` defines the Step 1 [LOAD] per-station loop, and a repo-wide sweep finds no named plugin agent type or harness tool name in any skill/reference body
- WHEN unit tests run, THEN they assert `resolveNextSkillPath` returns the composed path for a configured agent and null otherwise, and that `status.service` sets `nextSkillPath` from config
- WHEN an e2e test runs `prospec status` on a change with a configured agent, THEN the output contains the resolved skill path and the read-first action line

---
