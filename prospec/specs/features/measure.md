---
feature: measure
status: active
last_updated: 2026-08-16
story_count: 1
req_count: 3
---

# measure

## Who & Why

**Who it serves**: TBD

**Problem it solves**: TBD

**Why it matters**: TBD

## User Stories & Behavior Specifications

### US-1

#### REQ-MEASURE-006: Local Session Log Parsing
The prospec measure command parses local session logs from supported AI CLIs (Antigravity, Claude Code, Copilot, Codex) instead of calling provider APIs.
- WHEN a supported log file is found, THEN it extracts input, output, and cached token metrics per turn
- WHEN encountering an unparsable line, THEN it gracefully skips the line without failing the run

---

#### REQ-MEASURE-007: Theoretical Baseline Estimation
The measure command calculates a theoretical full-dump baseline using `git ls-files` to estimate token savings against the actual local log usage.
- WHEN displaying savings, THEN the report explicitly labels the baseline as a theoretical estimate
- WHEN calculating baseline, THEN it relies on tracked text files via `git ls-files` rather than hardcoded directories

---

#### REQ-MEASURE-002: Token Usage Reporting
The measure command reports token savings and cache hit rates based on parsed historical local session logs.
- WHEN the report is generated, THEN it displays aggregated input, output, and cached tokens per CLI source
- WHEN the report is generated, THEN it shows the token savings percentage compared to a theoretical full-dump baseline

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
| 2026-08-16 | local-log-token-measurement | Created from archive | REQ-MEASURE-006, REQ-MEASURE-007, REQ-MEASURE-002 |
