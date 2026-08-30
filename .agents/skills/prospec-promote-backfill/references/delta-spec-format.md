# Delta Spec Format Reference

This document defines the expected format for `delta-spec.md`, used by the **prospec-plan** Skill.

---

## Purpose

`delta-spec.md` describes requirement deltas using ADDED/MODIFIED/REMOVED categories to track requirement evolution.

---

## REQ ID Naming Convention

```
REQ-{MODULE}-{NUMBER}
```

- `{MODULE}`: Module name in uppercase, hyphen-separated (e.g., `AUTH`, `API-MIDDLEWARE`, `ERROR-HANDLER`)
- `{NUMBER}`: Three-digit sequential number (e.g., `001`, `002`, `003`)

**Examples:**
- `REQ-AUTH-001`
- `REQ-API-MIDDLEWARE-001`
- `REQ-ERROR-HANDLER-002`

**Backfill (`scale: backfill`):** feature-first extraction uses a feature-slug REQ-id
(`REQ-{FEATURE-SLUG}-{NUMBER}`, e.g. `REQ-USER-PROFILE-001`) instead of a module name —
`/prospec-archive` routes the REQ by its `**Feature:**` field and derives affected modules from
`metadata.related_modules`/feature-map, so a backfill REQ-id need not be module-based.

---

## Standard Format

### 1. ADDED - New Requirements

New requirements with full details:

```markdown
## ADDED

### REQ-{MODULE}-{NUMBER}: [Requirement title]

**Feature:** {feature-slug}
**Story:** US-{N}

**Description:**
[Detailed description of the requirement]

**Acceptance Criteria:**
1. [Specific verifiable condition 1]
2. [Specific verifiable condition 2]
3. [Specific verifiable condition 3]

**Spec:** (optional for ADDED — see "The `**Spec:**` Block" below)
[The REQ body to land verbatim in the Feature Spec; omitted, Description + Acceptance Criteria land instead]

**Priority:** [High/Medium/Low]

---
```

> **Feature** routes this REQ to `specs/features/{feature-slug}.md` (or its resolved sub-module slice) at archive Spec Sync. A MODIFIED/REMOVED header MUST name the feature that already hosts the REQ id: archive locates the REQ by its id and **refuses** a header that resolves to a different feature rather than appending a stale duplicate.
> **Story** is a **trust-zone** story number, not a proposal.md number. An ADDED REQ uses the target Feature Spec's story it lands under — an existing story's number, or that feature's current highest story number plus one for a new story (archive routes it to that story's slice). A MODIFIED/REMOVED REQ names the trust-zone story it already lives under; archive resolves the REQ by its id regardless, so the field is a human-read pointer.

**Example:**

```markdown
## ADDED

### REQ-ERROR-HANDLER-001: Centralized Error Types

**Feature:** error-handling
**Story:** US-1

**Description:**
Define a set of standard error types that can be used across all modules in prospec. Each error type should have a unique error code and HTTP status mapping.

**Acceptance Criteria:**
1. Error types include ValidationError, NotFoundError, UnauthorizedError, ServerError
2. Each error type has a unique error code following the convention in prospec/CONSTITUTION.md
3. Error codes map to appropriate HTTP status codes (400, 401, 404, 500, etc.)

**Priority:** High

---

### REQ-ERROR-HANDLER-002: Error Response Formatter

**Feature:** error-handling
**Story:** US-1

**Description:**
Implement a formatter that converts errors into standardized JSON responses for API endpoints.

**Acceptance Criteria:**
1. Response includes error code, message, and timestamp
2. Stack traces are excluded from production responses
3. Supports localization for error messages

**Priority:** Medium

---
```

---

### 2. MODIFIED - Changed Requirements

Modified requirements showing before/after comparison:

```markdown
## MODIFIED

### REQ-{MODULE}-{NUMBER}: [Requirement title]

**Feature:** {feature-slug}
**Story:** US-{N}

**Before:**
[Original requirement description or condition]

**After:**
[Updated requirement description or condition]

**Reason:**
[Why this modification was needed]

**Spec:** (REQUIRED for MODIFIED — see "The `**Spec:**` Block" below)
[The REQ body to land verbatim in the Feature Spec: a 1-2 sentence statement plus `- WHEN …, THEN …` bullets]

**Dropped:** (whenever the new body does not carry an existing bullet's exact text)
[Each such bullet, copied from `archive --dry-run` — a rewrite counts, not only a retirement]

**Priority:** [High/Medium/Low]

---
```

**Example:**

```markdown
## MODIFIED

### REQ-API-MIDDLEWARE-003: Error Logging

**Feature:** error-handling
**Story:** US-2

**Before:**
Log all errors to console with full stack traces.

**After:**
Log errors to the logger module with configurable log levels. Stack traces are only logged in development mode.

**Reason:**
Align with the logging strategy defined in prospec/CONSTITUTION.md and improve production security.

**Priority:** Medium

---
```

---

### 3. REMOVED - Removed Requirements

Removed requirements with rationale:

```markdown
## REMOVED

### REQ-{MODULE}-{NUMBER}: [Requirement title]

**Reason:**
[Why this requirement was removed]

---
```

**Example:**

```markdown
## REMOVED

### REQ-ERROR-HANDLER-004: Email Notification on Errors

**Reason:**
Out of scope for this story. Email notification will be handled by a separate monitoring module in a future story.

---
```

---

## The `**Spec:**` Block — What Lands in the Feature Spec

`prospec archive`'s Feature-Spec sync is mechanical: it can copy text, never author it. The
`**Spec:**` block is the ONE part of a delta-spec entry that lands **verbatim** as the REQ's body in
`specs/features/{feature-slug}.md` (or its automatically resolved sub-module slice). Write it in spec form — a 1-2 sentence statement of the resulting
behavior, then `- WHEN …, THEN …` bullets — and in the **target Feature Spec's language**, not the
change-artifact language (a project whose change artifacts are non-English still lands English spec
bodies when its Feature Specs are English).

**Write the resulting requirement, not the delta.** For a **MODIFIED** REQ, the `**Spec:**` block replaces the WHOLE body in the feature spec. What the block omits leaves the trust zone; the archive CLI reports omitted bullets on the MODIFIED path only (an ADDED entry replacing a pre-existing body is reported by neither worklist). Any existing behavior not restated must be declared under `**Dropped:**` (omitted WHEN/THEN bullets must be declared, or `prospec archive` will refuse spec sync).

| Entry | `**Spec:**` | Without it |
|-------|-------------|------------|
| **MODIFIED** | REQUIRED | Existing body is preserved unchanged; reported as pending convergence |
| **ADDED** | Optional | `**Description:**` + `**Acceptance Criteria:**` land as body; title only (bare title) if neither |

Fields outside the block (like Before, After, Reason) are narrative explanation and never copied into the Feature Spec.

**Where the block ends**: at one of this template's OWN field labels —
`**Feature:**`, `**Story:**`, `**Description:**`, `**Acceptance Criteria:**`, `**Before:**`,
`**After:**`, `**Reason:**`, `**Spec:**`, `**Dropped:**`, `**Priority:**` — appearing for the first
time in the entry, at any Markdown heading, or at `---`. Any other label causes `prospec archive` to refuse it: `prospec archive` refuses that REQ leaving the feature spec byte-identical.

### `**Dropped:**` — declaring a deliberate removal

When a `**Spec:**` block omits an existing `WHEN/THEN` bullet, declare it under `**Dropped:**` immediately following `**Spec:**`:

```markdown
**Spec:**
The library filters items by tag and owner.
- WHEN a tag filter is applied, THEN only tagged items are listed

**Dropped:**
- WHEN no item matches, THEN an empty-state card is shown

**Priority:** High
```

Undeclared dropped bullets cause the CLI to refuse spec sync (the CLI holds the write until declared). A declared bullet not dropped is reported as a **stale declaration**. A `**Dropped:**` declaration does NOT release a refusal. Copy dropped bullets directly from `prospec archive --dry-run`.

---

## File Length Guidelines

- Keep under **100 lines**
- If deltas exceed 10 requirements, consider splitting into multiple Stories

---

## Reference Information

- Project name: `prospec`
- AI Knowledge path: `prospec/ai-knowledge`
- Constitution file: `prospec/CONSTITUTION.md`
