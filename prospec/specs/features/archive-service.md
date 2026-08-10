---
feature: archive-service
status: active
last_updated: 2026-08-10
story_count: 1
req_count: 1
---

# archive-service

## Who & Why

**Who it serves**: Developers and AI Agents

**Problem it solves**: Centralizes the archival process, preventing artifacts from bloating the working directory, and synchronizes the final code state back into the project's permanent feature specs.

**Why it matters**: Maintains a clean workspace and ensures the permanent specification always matches the shipped behavior.

## User Stories & Behavior Specifications

### US-1: 將過長的 Feature Spec 拆分成切片 [P1]

As an AI Agent or Developer,
I want 能夠在不破壞 REQ ID 與關聯的前提下，將 feature spec 拆分成多個 slice，
So that 載入知識的 token 花費可以減少，提高 agent 執行效率並降低成本。

#### REQ-SERVICES-018: Spec Sync Replaces in Place
Spec sync writes to the specific slice containing the REQ.
- WHEN a MODIFIED or REMOVED REQ exists in a slice, THEN the update is written to that slice.
- WHEN an ADDED REQ specifies a slice (or defaults to the main file), THEN it is written there.
- WHEN graduation logic reads specs, THEN only the slices containing touched REQs are loaded.

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
| 2026-08-10 | feature-spec-sub-modules | Created from archive | REQ-SERVICES-018 |
