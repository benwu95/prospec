# Archive Summary Format Reference

`prospec-archive` writes `summary.md` in this format for completed changes.

---

## Standard Format

### 1. Change Overview

```markdown
# {change-name} — Archive Summary

- **Archived**: {YYYY-MM-DD}
- **Original Created**: {created date from metadata.yaml}
- **Quality Grade**: {S / A / B / C / D / Unverified}
- **Issue**: {issue from metadata.yaml — omit the whole line when unregistered}
- **Plan Decision**: {option} (graded_by: {human / in-session}) — omit the whole line when the change recorded no decision
```

The `Issue` line takes `metadata.yaml.issue` (reference, URL or tracker id; see metadata-format) as a **single line**: runs of whitespace collapse to one space, preventing forged headings or quality-grade rows. It is omitted **entirely** when unregistered, in both summary and committed `_archived-history` copy.

`prospec archive` computes `Plan Decision` in the scaffold: fresh human sign-off gives `graded_by: human`; otherwise a valid `candidates/decision.json` gives `graded_by: in-session`. Carry it over verbatim when the Phase 2 summary replaces the scaffold — never re-derive it.

---

### 2. User Story Summary

Extract from `proposal.md`:

```markdown
## User Story

As a [role],
I want [feature],
So that [value].
```

---

### 3. Affected Modules

List all changed modules from `delta-spec.md`:

```markdown
## Affected Modules

| Module | Impact | Description |
|--------|--------|-------------|
| auth | High | Added session rotation |
| api | High | Updated session refresh endpoint |
```

---

### 4. Requirement Traceability

List all REQ IDs from `delta-spec.md`:

```markdown
## Requirements

| REQ ID | Status | Description |
|--------|--------|-------------|
| REQ-AUTH-010 | ADDED | Session token rotation |
| REQ-API-011 | MODIFIED | Login endpoint returns the rotated token |
```

---

### 5. Completion Summary

```markdown
## Completion

- **Tasks**: {completed}/{total} ({percentage}%)
- **Acceptance Criteria**: {met}/{total}
```

---

### 6. Review & Verify

From the change bundle (`review.md`, verify report, `metadata.yaml` `quality_log`), record the **quality grade** (S/A/B/C/D/Unverified), **critical/major counts with a findings excerpt**, and **`quality_log` digest** of WARN/FAIL entries. Disclose no review round, empty `quality_log` or older artifacts (`Unverified`, `no review round`); **never fabricate** grades or counts.

```markdown
## Review & Verify

- **Review**: {rounds} round(s), {N} critical / {M} major — {short findings excerpt, or "review-clean"}
- **Verify**: Grade {S/A/B/C/D}, {dimensions PASS summary}; {test-suite result}
- **Quality Log**: {WARN/FAIL digest from metadata.yaml, or "no WARN/FAIL"}
```

A **backfilled or reconstructed** entry, recovered from the committed summary + `_lessons-ledger.md` after bundle loss, adds `- **Source**: {where recovered}` to identify recovered evidence; live archives omit it.

---

### 7. Knowledge Update Hints (Optional)

If affected modules have AI Knowledge documentation:

```markdown
## Knowledge Update

Module documentation to check:
- `prospec/ai-knowledge/modules/{module}/README.md`
```

---

## File Length Guidelines

- Keep under **80 lines**
- Prioritize traceability and searchability over implementation details

---

## Spec Archiving

Run `prospec archive finalize <name> --bundle <archiveIdentity>` in the original source before removing its worktree. It copies `summary.md` from returned `archivePath` to `prospec/specs/_archived-history/{archiveIdentity}.md`, the committed spec-history audit trail. Reuse returned identity; never reconstruct dates. The complete bundle stays in the main worktree project's gitignored `.prospec/archive/`; retention is not Git-object backup.

`_archived-history/` matches `ARCHIVED_EXCLUDES`, excluding frozen REQs from drift checks. Finalize refreshes both summaries' Escalation History from metadata; preserve summary formatting, authored prose, fenced examples and override reasons after PASS.

Finalize reconciles counters from complete final spec bodies and refreshes the product Feature Map after semantic graduation. Only `status: deprecated` permits a positive declared counter to become a body-derived zero; active, absent or unknown status retains positive-to-zero refusal. Retired REQ history stays resolvable at the existing feature-spec path. A product-sync decline leaves the map untouched: apply its named remedy and re-run finalize before confirming sync. Curated entries retain bootstrap no-clobber; routing/status decisions remain authored.
