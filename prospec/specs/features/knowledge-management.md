---
feature: knowledge-management
status: active
last_updated: 2026-08-14
story_count: 2
req_count: 2
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

### US-3: Explicit knowledge confirmation stamp [P1]

As a maintainer of a knowledge base other people trust to be current,
I want a CLI-owned command that records when each module's knowledge was last confirmed against its source,
so that "is this knowledge stale?" is answered by an explicit, auditable confirmation time instead of being inferred from whenever a README file happened to get committed.

**Acceptance Scenarios:**
- WHEN a maintainer names one or more modules, THEN each one's confirmation time is stamped and written back to the module map
- WHEN the map is rewritten, THEN the curated comments and every other module's stamp survive the write
- WHEN any other knowledge command edits the map, THEN it preserves existing stamps but never mints one — a confirmation is a deliberate act, never a side effect of regenerating something else

#### REQ-SERVICES-090: `prospec knowledge verify` stamps and preserves `last_verified`
`prospec knowledge verify <module>...` stamps each named module's `last_verified` with the current ISO 8601 time and writes it back to `module-map.yaml` through the comment-preserving document path, so the curated header comments and every other module's existing `last_verified` value survive the write. Stamping is CLI-owned and deterministic — the timestamp source is injected — so no contributor hand-edits a date. `prospec knowledge verify` is the sole writer of `last_verified`: `knowledge update` preserves every surviving module's existing value when it adds or removes modules but never stamps one (it does not rewrite existing READMEs), and `knowledge init` / `buildModuleMap` leave a newly-generated module's `last_verified` absent — an unverified module reads as stale until a `knowledge verify` confirms it.
- WHEN `prospec knowledge verify` names one or more modules, THEN each named module's `last_verified` is stamped with the current time and written back
- WHEN the map is written, THEN the curated header comments and other modules' existing `last_verified` values are preserved
- WHEN `knowledge update` adds or removes a module, THEN every surviving module's existing `last_verified` is preserved and no module is auto-stamped

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
| 2026-08-14 | mechanize-knowledge-sync-gate | ADDED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-SERVICES-001 |
