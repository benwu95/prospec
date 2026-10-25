---
feature: knowledge-management
status: active
last_updated: 2026-10-25
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
I want a CLI-owned command that records when each module's knowledge was last confirmed and which source content it was confirmed against,
so that "is this knowledge stale?" is answered by an explicit, auditable confirmation time instead of being inferred from whenever a README file happened to get committed.

**Acceptance Scenarios:**
- WHEN a maintainer names one or more modules, THEN each one's confirmation time and source digest are stamped and written back to the module map, unless its stamp is already later than the committed one and its source is unchanged since
- WHEN the map is rewritten, THEN the curated comments and every other module's stamp survive the write
- WHEN any other knowledge command edits the map, THEN it preserves existing stamps but never mints one — a confirmation is a deliberate act, never a side effect of regenerating something else

#### REQ-SERVICES-090: `prospec knowledge verify` stamps `last_verified` and `source_digest`
`prospec knowledge verify <module>...` stamps each named module's `last_verified` with the current ISO 8601 time and its `source_digest` with the digest of its current source (REQ-LIB-015), computed from the same validated, path-clamped module map the freshness rule reads — except a module whose working-tree stamp is already later than its value at `HEAD` and whose recorded `source_digest` equals its current digest, which it leaves untouched — and writes them back to `module-map.yaml` through the comment-preserving document path, so the curated header comments and every other module's existing `last_verified` and `source_digest` values survive the write. Stamping is CLI-owned and deterministic — the timestamp source is injected — so no contributor hand-edits a date or a digest. Inside a git work tree, when the digest of any named module cannot be computed, it refuses with the reason and writes nothing; where git cannot confirm a work tree, it stamps `last_verified` alone and leaves any recorded `source_digest` unchanged. `prospec knowledge verify` is the sole writer of `last_verified` and `source_digest`: `knowledge update` preserves every surviving module's existing values when it adds or removes modules but never stamps one (it does not rewrite existing READMEs), and `knowledge init` / `buildModuleMap` leave a newly-generated module's `last_verified` and `source_digest` absent — an unverified module reads as stale until a `knowledge verify` confirms it. Before it writes any `last_verified`, `knowledge verify` judges `module-map.yaml` through `readKnownModules` (REQ-LIB-097) and, when that reports the map unreadable, refuses with a `PrerequisiteError` naming the cause and remedy it reports, writing nothing; it reads the map through the knowledge-root-contained reader. It writes the stamp to the real path `module-map.yaml` resolves to inside the knowledge root. A usable map is one that can be read, passes the module-map schema, resolves inside the knowledge root and declares every named module; each outcome below that stamps, skips or keeps a module presumes a usable map, and every refusal writes nothing.
- WHEN, with a usable map, `prospec knowledge verify` names one or more modules inside a git work tree and every named module's source digest is computable, THEN each named module that is not skipped has its `last_verified` stamped with the current time and its `source_digest` set to that digest, and both are written back
- WHEN, with a usable map, every named module's source digest is computable and a named module's working-tree `last_verified` parses and is later than its value in `HEAD`'s `module-map.yaml` (an absent module, an absent stamp or an unparsable stamp at `HEAD` counts as earlier), and its recorded `source_digest` equals its current digest, THEN the module is skipped: its values are kept, and the result lists only the stamped modules as verified and the skipped ones as skipped
- WHEN, with a usable map, every named module's source digest is computable and that working-tree stamp is later than `HEAD`'s but the module's source digest has changed since it was recorded, THEN the module is stamped again, whatever the day
- WHEN, with a usable map inside a git work tree, the source digest of a named module cannot be computed, THEN `prospec knowledge verify` refuses with the reason and writes nothing
- WHEN, with a usable map, git cannot confirm a work tree, THEN each named module is stamped with `last_verified` alone and any recorded `source_digest` is left unchanged
- WHEN every named module is skipped, THEN `module-map.yaml` is not written and its bytes are unchanged
- WHEN `HEAD`'s `module-map.yaml` cannot be read — no repository, no commit, the file absent at `HEAD`, or content that does not pass the module-map schema — THEN no module is skipped
- WHEN the result is printed, THEN each stamped module and each skipped module is named on its own line
- WHEN the map is written, THEN the curated header comments and other modules' existing `last_verified` values are preserved
- WHEN `knowledge update` adds or removes a module, THEN every surviving module's existing `last_verified` is preserved and no module is auto-stamped
- WHEN the map is written, or `knowledge update` adds or removes a module, THEN other modules' existing `source_digest` values are preserved
- WHEN `module-map.yaml` is a symlink resolving outside the knowledge root, THEN `prospec knowledge verify` refuses with a message containing `resolves outside the knowledge root`, writes no `last_verified`, and the filesystem is byte-identical afterwards
- WHEN `module-map.yaml` exists but cannot be read, parsed or validated, THEN `prospec knowledge verify` refuses with the cause and remedy `readKnownModules` reports and writes nothing
- WHEN `module-map.yaml` is absent, or is a symlink whose target does not exist, THEN `prospec knowledge verify` refuses with `module-map.yaml not found`
- WHEN the map is usable, THEN the judgment adds no write of its own and each named module that is not skipped is stamped, unless the digest refusal above applies
- WHEN `module-map.yaml` is a symlink to another file inside the knowledge root, the map is usable and the digest refusal above does not apply, THEN the stamp is written to that file and `module-map.yaml` stays a symlink

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
| 2026-10-25 | judge-freshness-by-content-digest | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-24 | sync-knowledge-before-evidence | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-03 | contain-knowledge-writes | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-10-02 | gate-module-map-writers | MODIFIED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-08-14 | mechanize-knowledge-sync-gate | ADDED REQ-SERVICES-090 | REQ-SERVICES-090 |
| 2026-08-09 | knowledge-budget-drift-check-and-sweep | Created from archive | REQ-SERVICES-001 |
