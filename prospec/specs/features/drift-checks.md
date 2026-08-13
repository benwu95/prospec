---
feature: drift-checks
status: active
last_updated: 2026-08-13
story_count: 3
req_count: 3
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

### US-4

#### REQ-LIB-052: Canonical Doc Drift Check
The `canonical-doc-drift` check WARNs when a canonical/no-authored-content init doc has diverged from the installed version's template. Scope is the in-project README and the two canonical convention docs (`_status-lifecycle.md`, `_module-readme-conventions.md`), resolved at their actual locations and rendered through the shared init-doc path; user-authored docs (CONSTITUTION, index, user-managed conventions) are out of scope, and the canonical subset is the single classification `INIT_DOC_REGISTRY` carries.
- WHEN a present canonical doc's on-disk content differs from its rendered template after normalizing line endings and a single trailing newline, THEN a WARN finding names that doc
- WHEN a present canonical doc matches its rendered template, THEN the check passes for it
- WHEN a canonical doc is absent, THEN it is skipped (absence is not drift)
- WHEN a user-authored doc differs from its template, THEN this check reports nothing (out of scope)

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
| 2026-08-13 | guard-canonical-doc-drift | ADDED REQ-LIB-052 | REQ-LIB-052 |
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-LIB-001, REQ-LIB-002 |
