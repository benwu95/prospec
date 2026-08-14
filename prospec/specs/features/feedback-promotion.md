---
feature: feedback-promotion
status: active
last_updated: 2026-08-14
story_count: 4
req_count: 13
---

# Feedback Promotion Pipeline

## Who & Why

**Audience**: Developers and project maintainers using Prospec who want the team to "get smarter the more it is used" — session feedback can settle into shared experience.

**Problem solved**: Corrections during a session, repeated verify FAILs, and recurring review criticals currently do not flow back into durable rules (`.tasks/lessons.md` is only a personal note and does not enter Constitution/conventions). Every new session and every new hire starts over from the same baseline; goal G6 is absent in the current state. The industry (Claude memory, Cursor Team Rules, AGENTS.md) can do "correction → rule", but all lack an **auditable decision step** for whether a piece of feedback is worth promoting to a team-shared rule.

**Why it matters**: Prospec differentiates itself with its structured assets (archive cross-change statistics, module-map impact scope, Constitution as a gate) — turning the promotion decision into an **explicit, reproducible, version-control-traced** process rather than a black-box heuristic. This is the positive design for G6 "get smarter the more it is used".

---

## Slices

- [US-1–US-2](./feedback-promotion/us-1.md)
- [US-3–US-4](./feedback-promotion/us-3.md)

## Edge Cases

- Early project with few changes and insufficient samples: do not generate promotion suggestions, only accumulate personal lessons
- Cross-person preference conflict (two developers giving opposite feedback): the decision layer flags the conflict and defers to human arbitration, not automatically picking a side
- A lesson duplicates an existing Constitution rule: detect the duplication and suggest "strengthen the existing one" rather than adding a new one
- Promotion write failure: do not fail silently; retain the pending-promotion queue and report it

## Success Criteria

- **SC-1**: A lesson that recurs across multiple changes can complete the full cycle of "collect → decision suggestion → human approval → write to shared rule → referenceable by verify"
- **SC-2**: The promotion decision produces the same output for the same ledger, with each suggestion carrying traceable scoring details (not a black box; reproducibility is conditioned on a stable ledger key)
- **SC-3**: All shared-tier/Constitution promotions have a version-controlled diff recording the source change and approver
- **SC-4**: Expired or conflicting shared rules 100% enter the pending review list and are not silently carried over

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace the existing version
2. **Functional Grouping**: New requirements are inserted under the corresponding User Story
3. **No Inline Provenance**: Historical attribution lives only in the Change History table
4. **Deprecation over Deletion**: Removed requirements are moved to the Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|--------------|
| 2026-08-14 | detect-inlined-gate-desync | MODIFIED REQ-TEMPLATES-174; MODIFIED REQ-TEMPLATES-072; MODIFIED REQ-TESTS-024 | REQ-TEMPLATES-174, REQ-TEMPLATES-072, REQ-TESTS-024 |
| 2026-08-10 | unify-line-splitting | MODIFIED REQ-CLI-030 | REQ-CLI-030 |
| 2026-08-03 | add-learn-staleness-sweep | ADDED REQ-TEMPLATES-174; MODIFIED REQ-TEMPLATES-071; MODIFIED REQ-TEMPLATES-072; MODIFIED REQ-CLI-030; MODIFIED REQ-TESTS-024; MODIFIED REQ-TEMPLATES-128; MODIFIED REQ-TYPES-024 | US-4 (MODIFIED), REQ-TEMPLATES-174, REQ-TEMPLATES-071, REQ-TEMPLATES-072, REQ-CLI-030, REQ-TESTS-024, REQ-TEMPLATES-128, REQ-TYPES-024 |
| 2026-07-30 | restore-cli-first | ADDED REQ-CLI-030 | REQ-CLI-030 |
| 2026-06-08 | add-feedback-promotion-pipeline | Establish the G6 feedback promotion pipeline: collect → auditable decision → human-approved three-tier promotion → governance | US-1~4; REQ-TYPES-024, REQ-TEMPLATES-069/070/071/072, REQ-TESTS-024 |
| 2026-06-12 | add-knowledge-flywheel | Version-control the ledger (survives across worktree) + archive Phase 4.5 automatic extraction + tasks×kind feed + knowledge_health review prioritization | US-1/2/4 reshaped; MODIFIED REQ-TEMPLATES-069/071/072; ADDED REQ-TEMPLATES-093/094/095, REQ-TESTS-025 |
| 2026-07-04 | carry-review-verify-evidence | The committed evidence for each source_changes in the ledger points to `_archived-history/{date}-{name}.md` (explicitly carried in the promotion-format Harvest + ledger header), replacing the evaporated gitignored bundle (issue #56) | US-1; REQ-TEMPLATES-128 (ADDED) |
| 2026-07-17 | translate-feature-specs-to-english | Translated spec to English (Language Policy); no requirement changes. | — |
| 2026-07-25 | align-language-policy-scope | promotion-format declares the ledger description/status language exception, so downstream ledgers inherit it | REQ-TEMPLATES-072 (MODIFIED) |
