---
feature: sdd-workflow
status: active
last_updated: 2026-08-14
story_count: 38
req_count: 202
---

# SDD Workflow

## Who & Why

**Who it serves**: Developers and teams doing Spec-Driven Development with Prospec.

**Problem it solves**: In software development, requirements are scattered, specs drift, changes go untracked, and Knowledge decouples from implementation. Without a structured flow, AI Agent output quality is unstable, and a project accumulates technical debt over time with no way to verify it.

**Why it matters**: The SDD Workflow is Prospec's core value proposition — through the six-phase lifecycle Story → Plan → Tasks → Implement → Verify → Archive, every change gets complete spec tracking, quality gates, and knowledge sedimentation. The spec is a Living Spec, and Knowledge is kept in sync as the project evolves, forming a positive flywheel.

---

## Slices

- [US-1–US-4](./sdd-workflow/us-1.md)
- [US-5: Verify Implementation Compliance](./sdd-workflow/us-5.md)
- [US-6: Archive Completed Changes](./sdd-workflow/us-6.md)
- [US-7–US-11](./sdd-workflow/us-7.md)
- [US-12–US-13](./sdd-workflow/us-12.md)
- [US-21–US-26](./sdd-workflow/us-21.md)
- [US-30: A Landing Block Never Drops Behavior Silently](./sdd-workflow/us-30.md)
- [US-31–US-32](./sdd-workflow/us-31.md)
- [US-33: product.md Is Authored, With One Machine-Owned Region](./sdd-workflow/us-33.md)
- [US-34: Stations Read the Requirements a Change Touches](./sdd-workflow/us-34.md)
- [US-35: A Change Carries the Tracker Item It Belongs To](./sdd-workflow/us-35.md)
- [US-36: Delegated Evidence Stays in the Artifact, Not in the Context](./sdd-workflow/us-36.md)
- [US-37–US-14](./sdd-workflow/us-37.md)
- [US-15–US-20](./sdd-workflow/us-15.md)
- [US-22: Backfill Spec Extraction (brownfield WHAT-layer completion)](./sdd-workflow/us-22.md)
- [US-23–US-25](./sdd-workflow/us-23.md)
- [US-27–US-28](./sdd-workflow/us-27.md)
- [US-29: Deterministic Station Work Belongs to the CLI](./sdd-workflow/us-29.md)

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
| 2026-08-14 | mechanize-knowledge-sync-gate | ADDED REQ-TESTS-088 | REQ-TESTS-088 |
| 2026-08-11 | converge-req-body-boundary | MODIFIED REQ-SERVICES-072; ADDED REQ-TESTS-085 | REQ-SERVICES-072, REQ-TESTS-085 |
| 2026-08-11 | configurable-generated-artifacts | ADDED REQ-SERVICES-088 | REQ-SERVICES-088 |
| 2026-08-10 | unify-line-splitting | ADDED REQ-LIB-051; ADDED REQ-TESTS-083 | REQ-LIB-051, REQ-TESTS-083 |
| 2026-08-10 | separate-review-evidence | ADDED REQ-TYPES-081; ADDED REQ-LIB-049; ADDED REQ-LIB-050; ADDED REQ-SERVICES-086; ADDED REQ-SERVICES-087; ADDED REQ-CLI-037; ADDED REQ-CLI-038; ADDED REQ-TEMPLATES-180; ADDED REQ-TEMPLATES-181; ADDED REQ-TESTS-082; MODIFIED REQ-CLI-028; MODIFIED REQ-CLI-029; MODIFIED REQ-TEMPLATES-067 | REQ-TYPES-081, REQ-LIB-049, REQ-LIB-050, REQ-SERVICES-086, REQ-SERVICES-087, REQ-CLI-037, REQ-CLI-038, REQ-TEMPLATES-180, REQ-TEMPLATES-181, REQ-TESTS-082, REQ-CLI-028, REQ-CLI-029, REQ-TEMPLATES-067 |
| 2026-08-09 | add-issue-link-field | ADDED REQ-TYPES-080; ADDED REQ-LIB-047; ADDED REQ-LIB-048; ADDED REQ-SERVICES-085; ADDED REQ-CLI-036; ADDED REQ-TEMPLATES-178; ADDED REQ-TEMPLATES-179; ADDED REQ-TESTS-081; MODIFIED REQ-CLI-023 | REQ-TYPES-080, REQ-LIB-047, REQ-LIB-048, REQ-SERVICES-085, REQ-CLI-036, REQ-TEMPLATES-178, REQ-TEMPLATES-179, REQ-TESTS-081, REQ-CLI-023 |
| 2026-08-08 | read-specs-by-req | ADDED REQ-LIB-046; ADDED REQ-SERVICES-084; ADDED REQ-CLI-035; ADDED REQ-TEMPLATES-176; ADDED REQ-TEMPLATES-177; ADDED REQ-TESTS-080 | REQ-LIB-046, REQ-SERVICES-084, REQ-CLI-035, REQ-TEMPLATES-176, REQ-TEMPLATES-177, REQ-TESTS-080 |
| 2026-08-08 | stop-silent-spec-body-loss | ADDED REQ-TESTS-079; ADDED REQ-SERVICES-081; ADDED REQ-CLI-034; ADDED REQ-SERVICES-083; ADDED REQ-TESTS-077; MODIFIED REQ-SERVICES-072; MODIFIED REQ-SERVICES-073; MODIFIED REQ-CLI-032; MODIFIED REQ-CLI-033; MODIFIED REQ-TEMPLATES-166; MODIFIED REQ-TEMPLATES-168; MODIFIED REQ-SPEC-010; MODIFIED REQ-TESTS-070 | REQ-TESTS-079, REQ-SERVICES-081, REQ-CLI-034, REQ-SERVICES-083, REQ-TESTS-077, REQ-SERVICES-072, REQ-SERVICES-073, REQ-CLI-032, REQ-CLI-033, REQ-TEMPLATES-166, REQ-TEMPLATES-168, REQ-SPEC-010, REQ-TESTS-070 |
| 2026-08-07 | refuse-near-miss-feature-map | ADDED REQ-SERVICES-080; ADDED REQ-CLI-033; ADDED REQ-TESTS-076; MODIFIED REQ-SERVICES-079; MODIFIED REQ-SPEC-011; MODIFIED REQ-TEMPLATES-175 | REQ-SERVICES-080, REQ-CLI-033, REQ-TESTS-076, REQ-SERVICES-079, REQ-SPEC-011, REQ-TEMPLATES-175 |
| 2026-08-06 | stop-clobbering-product-spec | ADDED REQ-SERVICES-079; ADDED REQ-LIB-043; ADDED REQ-TEMPLATES-175; ADDED REQ-TESTS-075; MODIFIED REQ-SPEC-013; MODIFIED REQ-SPEC-011; MODIFIED REQ-CLI-024 | REQ-SERVICES-079, REQ-LIB-043, REQ-TEMPLATES-175, REQ-TESTS-075, REQ-SPEC-013, REQ-SPEC-011, REQ-CLI-024 |
| 2026-08-06 | unify-req-heading-matcher | ADDED REQ-SERVICES-078; MODIFIED REQ-SERVICES-072; MODIFIED REQ-CLI-024; MODIFIED REQ-TESTS-060; MODIFIED REQ-SERVICES-071; MODIFIED REQ-TEMPLATES-159; MODIFIED REQ-TESTS-057 | REQ-SERVICES-078, REQ-SERVICES-072, REQ-CLI-024, REQ-TESTS-060, REQ-SERVICES-071, REQ-TEMPLATES-159, REQ-TESTS-057 |
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
