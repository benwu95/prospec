---
feature: drift-checks
status: deprecated
last_updated: 2026-11-04
story_count: 0
req_count: 0
---

# drift-checks

## Who & Why

**Who it serves**: Maintainers following historical Story and requirement ownership

**Problem it solves**: Preserves the retired container and its original Change History after its capabilities converge under `drift-detection`

**Why it matters**: Stable historical references remain traceable while each capability has one active owner

## Container Status

This deprecated container is permanently retained as history only. Its capabilities remain active under `drift-detection`; the Change History records their fully qualified Story and REQ destinations.

## Edge Cases

_(TBD)_

## Success Criteria

_(TBD)_

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

_(None)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from drift-checks/US-1 to drift-detection/US-8; retain the source container as deprecated history | drift-checks/US-1/REQ-LIB-001 → drift-detection/US-8/REQ-LIB-001 |
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from drift-checks/US-3 to drift-detection/US-8; retain the source container as deprecated history | drift-checks/US-3/REQ-LIB-002 → drift-detection/US-8/REQ-LIB-002 |
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from drift-checks/US-4 to drift-detection/US-24; retain the source container as deprecated history | drift-checks/US-4/REQ-LIB-052 → drift-detection/US-24/REQ-LIB-052 |
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from drift-checks/US-5 to drift-detection/US-25; retain the source container as deprecated history | drift-checks/US-5/REQ-LIB-061 → drift-detection/US-25/REQ-LIB-061 |
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from drift-checks/US-6 to drift-detection/US-26; retain the source container as deprecated history | drift-checks/US-6/REQ-LIB-068 → drift-detection/US-26/REQ-LIB-068 |
| 2026-11-04 | reconcile-feature-ownership | MODIFIED REQ-LIB-001; MODIFIED REQ-LIB-002; MODIFIED REQ-LIB-052; MODIFIED REQ-LIB-061; MODIFIED REQ-LIB-068 | REQ-LIB-001, REQ-LIB-002, REQ-LIB-052, REQ-LIB-061, REQ-LIB-068 |
| 2026-10-24 | fail-empty-modified-spec | MODIFIED REQ-LIB-061 | REQ-LIB-061 |
| 2026-09-29 | fix-spec-sync-safety | MODIFIED REQ-LIB-061 | REQ-LIB-061 |
| 2026-09-18 | internalize-skill-budgets | MODIFIED REQ-LIB-001 | REQ-LIB-001 |
| 2026-09-01 | standardize-module-readme-format | MODIFIED REQ-LIB-052 | REQ-LIB-052 |
| 2026-08-28 | add-req-id-uniqueness-check | ADDED REQ-LIB-068 | REQ-LIB-068 |
| 2026-08-23 | validate-routing-headers-before-landing | MODIFIED REQ-LIB-061 | REQ-LIB-061 |
| 2026-08-22 | add-landing-fidelity-check | ADDED REQ-LIB-061 | REQ-LIB-061 |
| 2026-08-13 | guard-canonical-doc-drift | ADDED REQ-LIB-052 | REQ-LIB-052 |
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-LIB-001, REQ-LIB-002 |
