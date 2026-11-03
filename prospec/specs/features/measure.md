---
feature: measure
status: deprecated
last_updated: 2026-11-03
story_count: 0
req_count: 0
---

# measure

## Who & Why

This feature is deprecated. Its CLI entry points and dedicated implementation have been retired. The preserved definitions below document historical behavior; shared token estimation and workflow-evaluation cost accounting remain specified by REQ-LIB-108.

## User Stories & Behavior Specifications

No active stories or requirements remain for this feature.

## Edge Cases

Historical edge cases are retained under Deprecated Requirements.

## Success Criteria

The retirement contract is specified by REQ-CLI-064; historical criteria below describe the retired feature.

## Maintenance Rules

1. **Replace-in-Place**: MODIFIED User Stories and REQs directly replace existing versions
2. **Functional Grouping**: New requirements insert under the corresponding User Story
3. **No Inline Provenance**: Historical attribution only in Change History table
4. **Deprecation over Deletion**: Removed requirements move to Deprecated section

## Deprecated Requirements

- **REQ-MEASURE-007**: Theoretical Baseline Estimation _(removed 2026-11-03)_
- **REQ-MEASURE-006**: Local Session Log Parsing _(removed 2026-11-03)_

- **REQ-MEASURE-002**: Token Usage Reporting _(removed 2026-11-03)_

### Historical Context

**Who it serves**: TBD

**Problem it solves**: TBD

**Why it matters**: TBD

### Historical User Stories & Behavior Specifications

### Retired Story US-1

#### ~~REQ-MEASURE-006: Local Session Log Parsing~~
The prospec measure command parses local session logs from supported AI CLIs (Antigravity, Claude Code, Copilot, Codex) instead of calling provider APIs.
- WHEN a supported log file is found, THEN it extracts input, output, and cached token metrics per turn
- WHEN encountering an unparsable line, THEN it gracefully skips the line without failing the run

**Removal reason:** The Measure CLI, reports and benchmark are retired; this definition records historical behavior only.

---

#### ~~REQ-MEASURE-007: Theoretical Baseline Estimation~~
The measure command calculates a theoretical full-dump baseline using `git ls-files` to estimate token savings against the actual local log usage.
- WHEN displaying savings, THEN the report explicitly labels the baseline as a theoretical estimate
- WHEN calculating baseline, THEN it relies on tracked text files via `git ls-files` rather than hardcoded directories

**Removal reason:** The Measure CLI, reports and benchmark are retired; this definition records historical behavior only.

---

#### ~~REQ-MEASURE-002: Token Usage Reporting~~
The measure command reports token savings and cache hit rates based on parsed historical local session logs.
- WHEN the report is generated, THEN it displays aggregated input, output, and cached tokens per CLI source
- WHEN the report is generated, THEN it shows the token savings percentage compared to a theoretical full-dump baseline

**Removal reason:** The Measure CLI, reports and benchmark are retired; this definition records historical behavior only.

---

### Historical Edge Cases

_(TBD)_

### Historical Success Criteria

_(TBD)_

## Change History

| Date | Change | Impact | Stories/REQs |
|------|--------|--------|-------------|
| 2026-11-03 | retire-measurement | REMOVED REQ-MEASURE-002; REMOVED REQ-MEASURE-006; REMOVED REQ-MEASURE-007 | REQ-MEASURE-002, REQ-MEASURE-006, REQ-MEASURE-007 |
| 2026-08-16 | local-log-token-measurement | Created from archive | REQ-MEASURE-006, REQ-MEASURE-007, REQ-MEASURE-002 |
