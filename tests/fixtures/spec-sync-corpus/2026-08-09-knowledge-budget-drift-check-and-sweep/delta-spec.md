## ADDED

### REQ-LIB-001: Token Budget Override Drift Check

**Feature:** drift-checks
**Story:** US-1

**Description:**
Any `token_budget` override in `.prospec.yaml` that exceeds the shipped default must include an adjacent reason comment.

**Acceptance Criteria:**
1. A drift check is executed during `prospec check`.
2. Overrides > default without a comment trigger a WARN/FAIL with the field name, current value, and default value.
3. Overrides > default with a comment pass.
4. Overrides <= default pass regardless of comment presence.

**Spec:**
The drift engine enforces justification for token budget increases.
- WHEN a `token_budget` override exceeds its shipped default and lacks an adjacent comment, THEN a drift check warning is emitted
- WHEN the override has a comment or is <= the default, THEN the check passes

**Priority:** High

---

### REQ-SERVICES-001: Knowledge Update Sweep

**Feature:** knowledge-management
**Story:** US-2

**Description:**
The `prospec knowledge update` command runs an automated sweep on affected module READMEs before writing to disk, compressing mechanized content into pointers.

**Acceptance Criteria:**
1. Sweep runs during Phase 3a of knowledge update.
2. Applies criteria: mechanized content compression, replaced content removal, absorbed content removal.
3. Logs token count before and after (using `Math.ceil(chars/4)`).

**Spec:**
The knowledge update flow mechanically compresses repetitive knowledge.
- WHEN updating a module README, THEN a sweep compresses mechanized Pitfalls and obsolete content before saving
- WHEN the sweep reduces size, THEN the token difference is reported

**Priority:** High

---

### REQ-LIB-002: Knowledge Size Headroom

**Feature:** drift-checks
**Story:** US-3

**Description:**
The `knowledge-size` check evaluates against a headroom band to provide early warnings before the absolute budget is breached.

**Acceptance Criteria:**
1. Headroom threshold can be independently overridden in `.prospec.yaml`.
2. Sizes between headroom and max budget emit a specific pressure signal.

**Spec:**
The knowledge size check provides early warnings via a headroom band.
- WHEN a file's size exceeds the headroom threshold but is under budget, THEN an early warning drift check is emitted

**Priority:** Medium

---
