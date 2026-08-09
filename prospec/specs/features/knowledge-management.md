---
feature: knowledge-management
status: active
last_updated: 2026-08-09
story_count: 1
req_count: 1
---

# knowledge-management

## Who & Why

**Who it serves**: TBD

**Problem it solves**: TBD

**Why it matters**: TBD

## User Stories & Behavior Specifications

### US-2

#### REQ-SERVICES-001: Knowledge Update Sweep
The knowledge update flow mechanically compresses repetitive knowledge.
- WHEN updating a module README, THEN a sweep compresses mechanized Pitfalls and obsolete content before saving
- WHEN the sweep reduces size, THEN the token difference is reported

---

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
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-SERVICES-001 |
