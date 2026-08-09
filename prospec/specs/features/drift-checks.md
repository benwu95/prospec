---
feature: drift-checks
status: active
last_updated: 2026-08-09
story_count: 2
req_count: 2
---

# drift-checks

## Who & Why

**Who it serves**: TBD

**Problem it solves**: TBD

**Why it matters**: TBD

## User Stories & Behavior Specifications

### US-1

#### REQ-LIB-001: Token Budget Override Drift Check
The drift engine enforces justification for token budget increases.
- WHEN a `token_budget` override exceeds its shipped default and lacks an adjacent comment, THEN a drift check warning is emitted
- WHEN the override has a comment or is <= the default, THEN the check passes

---

### US-3

#### REQ-LIB-002: Knowledge Size Headroom
The knowledge size check provides early warnings via a headroom band.
- WHEN a file's size exceeds the headroom threshold but is under budget, THEN an early warning drift check is emitted

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
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-LIB-001, REQ-LIB-002 |
