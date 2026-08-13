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
`feature-spec-format.hbs` uses User Story as the core organizing unit, demoting REQ IDs to sub-items of Behavior Specifications. Its REQ body scaffold shows the optional scenarios label, and it states plainly that the label belongs to a hand-authored spec only: a delta-spec landing block must not contain it, because a labelled line ends the block and the archive refuses the REQ rather than landing the truncated remainder. The two shapes read the same, so a landed body is never decorated with the label to match the scaffold.
- WHEN creating a Feature Spec, THEN the structure is frontmatter, then Who and Why, then User Stories and Behavior Specs, then Edge Cases, then Success Criteria, then Maintenance Rules, then Deprecated, then Change History
- WHEN the User Stories section is measured, THEN it occupies at least 40% of total content
- WHEN Maintenance Rules are written, THEN they define Replace-in-Place, Functional Grouping, No Inline Provenance, and Deprecation over Deletion
- WHEN the scenarios label appears in the scaffold, THEN the reference states that a delta-spec landing block may not carry it and what the archive does when one does

#### REQ-SPEC-011: Product Spec Format Template
`product-spec-format.hbs` (the PRD entry contract) defines vision, target users, feature map, a summary of core Stories, and the ownership boundary between the author and the generator.
- WHEN product.md, THEN ≤ 80 lines, readable in 2 minutes
- WHEN Feature Map, THEN each item links to its corresponding Feature Spec and carries a 1-2 sentence description
- WHEN a file is bootstrapped, THEN it is synthesized from all Feature Spec frontmatter and contains every section this reference requires
- WHEN describing frontmatter, THEN the reference states that the bootstrap skeleton seeds `product`, `last_updated` and a `version: TBD` placeholder, that `last_updated` is the only key prospec writes afterwards, and that every other key is preserved byte-for-byte — `version` and `feature_count` are author-maintained and are never rewritten, and `feature_count` is not a prospec-managed field at all
- WHEN describing the generator, THEN the reference states that `## Feature Map` is the only machine-owned region of the file
- WHEN describing that region's heading, THEN the reference states that a decorated variant such as `## Feature Map (34 active)` is a near miss that makes the sync refuse rather than append, and that the remedy is to give curated content a heading of its own

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
