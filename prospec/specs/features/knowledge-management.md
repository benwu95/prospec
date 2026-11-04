---
feature: knowledge-management
status: deprecated
last_updated: 2026-11-04
story_count: 0
req_count: 0
---

# knowledge-management

## Who & Why

**Who it serves**: Maintainers following historical Story and requirement ownership

**Problem it solves**: Preserves the retired container and its original Change History after its capabilities converge under `ai-knowledge`

**Why it matters**: Stable historical references remain traceable while each capability has one active owner

## Container Status

This deprecated container is permanently retained as history only. Its capabilities remain active under `ai-knowledge`; the Change History records their fully qualified Story and REQ destinations.

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
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from knowledge-management/US-2 to ai-knowledge/US-310; retain the source container as deprecated history | knowledge-management/US-2/REQ-SERVICES-001 → ai-knowledge/US-310/REQ-SERVICES-001 |
| 2026-11-04 | reconcile-feature-ownership | Relocate unchanged identity and complete behavior from knowledge-management/US-3 to ai-knowledge/US-362; retain the source container as deprecated history | knowledge-management/US-3/REQ-SERVICES-090 → ai-knowledge/US-362/REQ-SERVICES-090 |
| 2026-11-04 | reconcile-feature-ownership | MODIFIED REQ-SERVICES-001; MODIFIED REQ-SERVICES-090 | REQ-SERVICES-001, REQ-SERVICES-090 |
| 2026-11-02 | backfill-doc-drift-knowledge-management | MODIFIED REQ-SERVICES-001 | REQ-SERVICES-001 |
| 2026-10-25 | judge-freshness-by-content-digest | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-24 | sync-knowledge-before-evidence | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-03 | contain-knowledge-writes | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-02 | gate-module-map-writers | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-08-14 | mechanize-knowledge-sync-gate | ADDED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-SERVICES-001 |
