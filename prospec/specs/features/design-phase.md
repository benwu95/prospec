---
feature: design-phase
status: active
last_updated: 2026-07-05
story_count: 4
req_count: 10
---

# Design Integration

## Who & Why

**Who it serves**: Frontend developers, full-stack developers, UI/UX designers

**Problem it solves**: When an AI Agent implements UI, it lacks precise visual and interaction specifications and can only develop by guessing. The Design Phase inserts a design-spec production stage between Story and Plan, providing precise references such as colors, spacing, component structure, and interaction states.

**Why it matters**: Generate Mode lets teams without design tools produce structured specs from the proposal; Extract Mode lets teams with design tools reverse-extract them into an AI-readable format. Both modes ensure the AI no longer blindly guesses the UI.

## User Stories & Behavior Specifications

### US-001: Produce Design Specs from Proposal (Generate Mode) [P0]

As a frontend developer,
I want the Design Phase to automatically produce visual specs and interaction specs from the proposal,
so that when the AI implements the UI it has precise design references instead of guessing.

**Acceptance Scenarios:**
- WHEN the proposal's ui_scope is full/partial and there is no existing design THEN enter Generate Mode
- WHEN design-spec.md is produced THEN it includes Visual Identity, Components, Responsive Strategy
- WHEN interaction-spec.md is produced THEN it includes States, Transitions, Flow sequences

#### REQ-DSGN-001: Design Spec Format
`design-spec-format.hbs` defines the platform-agnostic visual design spec structure.

**Scenarios:**
- WHEN referencing design-spec-format, THEN includes Visual Identity (colors, fonts, spacing), Components (layout, states, tokens), Responsive Strategy (breakpoints)
- WHEN writing design spec, THEN no platform-specific references (use tokens, not hardcoded values)

#### REQ-DSGN-002: Interaction Spec Format
`interaction-spec-format.hbs` defines the platform-agnostic interaction spec, using the Interaction DSL draft syntax.

**Scenarios:**
- WHEN referencing interaction-spec-format, THEN includes Screen/Component definitions (States, Transitions), Flow sequences (trigger -> action)
- WHEN DSL syntax used, THEN annotated as draft-1

#### REQ-DSGN-003: prospec-design Skill Dual Modes
`prospec-design.hbs` defines the Design Phase workflow, supporting both Generate and Extract modes (Extract reverse-extracts visual/interaction specs from a design tool). The input=code behavior-layer backfill has been split out into the standalone skill `prospec-backfill-spec` (for its behavior see sdd-workflow US-22).

**Scenarios:**
- WHEN design skill triggered, THEN read proposal.md (ui_scope) and .prospec.yaml (design.platform) to detect mode
- WHEN no design-spec.md and no existing designs, THEN enter Generate Mode (produce design-spec.md + interaction-spec.md)
- WHEN design-spec.md exists or design tool has designs, THEN enter Extract Mode (read via MCP, reverse-produce specs)
- WHEN Extract Mode encounters ambiguous intent, THEN mark [NEEDS CLARIFICATION]
- WHEN Phase 3 executes, THEN use platform adapter from .prospec.yaml
- WHEN Phase 4 verification, THEN verify via screenshot or structural comparison

#### REQ-DSGN-005: Proposal UI Scope Field
`proposal-format.hbs` includes an optional UI Scope section (full/partial/none).

**Scenarios:**
- WHEN ui_scope is full, THEN complete new screen design needed
- WHEN ui_scope is partial, THEN modifying existing UI components
- WHEN ui_scope is none, THEN pure backend change, skip Design Phase
- WHEN proposal lacks UI Scope, THEN legacy proposals unaffected

### US-002: Extract Specs from Design Tools (Extract Mode) [P1]

As a developer already using Figma or pencil.dev,
I want the Design Phase to reverse-extract structured design specs from the design tool,
so that the AI can directly read precise design parameters for implementation.

**Acceptance Scenarios:**
- WHEN the design tool already has designs THEN automatically enter Extract Mode
- WHEN an ambiguous design intent is encountered THEN mark [NEEDS CLARIFICATION]
- WHEN extraction completes THEN produce specs in a format consistent with Generate Mode

_(Extract Mode behavior spec is already covered by REQ-DSGN-003)_

### US-003: Platform Adapters [P1]

As a developer using different design tools,
I want the Design Phase to support multiple design tools through platform adapters,
so that I can integrate seamlessly with Prospec using tools I am familiar with.

**Acceptance Scenarios:**
- WHEN `design.platform: pencil` THEN use the pencil adapter (MCP)
- WHEN `design.platform: figma` THEN use html-to-figma MCP
- WHEN design.platform is not set THEN default to the html adapter

#### REQ-DSGN-004: Platform Adapter -- pencil.dev
**Scenarios:**
- WHEN Design Phase, THEN use batch_design() for components, set_variables() for tokens
- WHEN Implement Phase, THEN use batch_get() + get_screenshot() for precise details
- WHEN Verify Phase, THEN use get_screenshot() + search_all_unique_properties()

#### REQ-DSGN-006: Platform Adapter -- Figma
**Scenarios:**
- WHEN Design Phase, THEN produce HTML prototype, push via html-to-figma MCP
- WHEN Implement Phase, THEN read Figma node details (fills, strokes, auto-layout)
- WHEN Verify Phase, THEN compare Figma node properties with implementation

#### REQ-DSGN-007: Platform Adapter -- Penpot
**Scenarios:**
- WHEN Design Phase, THEN use Penpot API to create components
- WHEN Implement Phase, THEN export designs to readable format
- WHEN Verify Phase, THEN API structural comparison

#### REQ-DSGN-008: Platform Adapter -- HTML
**Scenarios:**
- WHEN Design Phase, THEN produce prototype/ directory (index.html, styles.css, pages)
- WHEN Implement Phase, THEN read CSS custom properties and HTML structure
- WHEN Verify Phase, THEN DOM structure and CSS property comparison

#### REQ-DSGN-009: Implement Skill Design Awareness
`prospec-implement.hbs` adds design awareness to UI tasks.

**Scenarios:**
- WHEN implementing UI task, THEN load design-spec.md + interaction-spec.md + adapter
- WHEN Phase 3 executes, THEN first read design values via adapter MCP, then implement
- WHEN no design-spec.md, THEN warn (UI task lacks design spec)

---

## US-004: Design's Position in the SDD Lifecycle [P2]

As an agent resuming interrupted work or running verify,
I want design's lifecycle position to be made explicit,
so that I can determine when design applies and when it does not, instead of guessing.

**Acceptance Scenarios:**
- WHEN consulting `_status-lifecycle.md`, THEN it states explicitly: design has no status, applies only when `ui_scope != none`, and sits between plan and tasks
- WHEN `ui_scope: none`, THEN design does not run, verify V6 is `not-applicable`, and the lifecycle is identical to one that never ran design

#### REQ-TEMPLATES-138: `_status-lifecycle.md` Makes Design's Position Explicit
`_status-lifecycle.md` (plus the shipped `init/status-lifecycle.md.hbs`, the two copies kept consistent) adds a "Stations without a status transition" section, recording design (`ui_scope != none`, between plan and tasks, no status), review, and learn, so that resume logic locates position by workflow order rather than by status.

## Edge Cases

- `.prospec.yaml` has no `design.platform`: default to the html adapter
- Extract Mode encounters an ambiguous design intent: mark [NEEDS CLARIFICATION]
- UI task but no design-spec.md: the Implement Skill issues a warning
- ui_scope is none: skip the Design Phase
- Legacy proposal without a UI Scope: backward compatible
- Design tool MCP connection fails: prompt to check the MCP configuration

## Success Criteria

- **SC-1**: The design-spec.md produced by Generate Mode contains complete Visual Identity, Components, Responsive Strategy
- **SC-2**: Extract Mode can extract structured specs from pencil.dev and Figma
- **SC-3**: Each of the 4 adapters covers operational guidance across the three phases Design/Implement/Verify
- **SC-4**: When implementing UI tasks, precise design parameters can be read through the adapter MCP

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED requirements are replaced directly with their latest state
2. **Functional Grouping**: New requirements are inserted into the corresponding functional group
3. **No Inline Provenance**: Historical traceability lives only in the Change History
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-02-16 | add-design-phase | Design Phase Generate/Extract dual modes and 4 platform adapters | US-001~003, REQ-DSGN-001~009 |
| 2026-03-02 | v2-product-first | Migrated to Feature Spec; REQ IDs changed from REQ-TEMPLATES-050~058 to REQ-DSGN-001~009 | All |
| 2026-06-16 | add-reverse-spec-extraction | REQ-DSGN-003 added an input=code reverse-spec variant cross-reference (behavior substantively belongs to sdd-workflow US-22, avoiding semantic pollution of the UI feature) | REQ-DSGN-003 (MODIFIED) |
| 2026-06-17 | extract-backfill-spec-skill | REQ-DSGN-003 removed the input=code reverse-variant cross-reference -- the capability was split out into the standalone skill prospec-backfill-spec; prospec-design returns to pure Generate/Extract | REQ-DSGN-003 (MODIFIED) |
| 2026-07-05 | quick-scale-and-ceremony-cleanup | ADDED US-004 (design's position in the lifecycle) + REQ-TEMPLATES-138 (`_status-lifecycle.md` + shipped template make explicit that design has no status, ui_scope-gated) (issue #67) | US-004, REQ-TEMPLATES-138 |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
