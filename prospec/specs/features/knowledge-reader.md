---
feature: knowledge-reader
status: active
last_updated: 2026-08-10
story_count: 1
req_count: 1
---

# knowledge-reader

## Who & Why

**Who it serves**: AI Agents and CLI commands

**Problem it solves**: Provides a unified, single source of truth for reading and parsing the project's AI Knowledge and Feature Specs without executing logic.

**Why it matters**: Prevents parse-drift between different features by centralizing the reading mechanisms into a safe, realpath-contained library.

## User Stories & Behavior Specifications

### US-1: 將過長的 Feature Spec 拆分成切片 [P1]

As an AI Agent or Developer,
I want 能夠在不破壞 REQ ID 與關聯的前提下，將 feature spec 拆分成多個 slice，
So that 載入知識的 token 花費可以減少，提高 agent 執行效率並降低成本。

#### REQ-LIB-067: Feature Spec Slice Parsing
Feature specs support a sub-module slice mechanism. 
- WHEN a main feature spec contains links to `{slice}.md`, THEN the REQs in those slices are indexed as part of the feature.
- WHEN aggregating counters, THEN totals reflect the sum across the main file and all slices.

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
| 2026-08-10 | feature-spec-sub-modules | Created from archive | REQ-LIB-067 |
