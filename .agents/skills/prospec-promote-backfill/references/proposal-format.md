# Proposal Format Reference

`prospec-new-story` authors `proposal.md` in this format.

---

## Standard Format

### Premise (new standard/full changes)

One unfenced `## Premise`, ending at the next level-one/two heading, contains one `yaml` fenced mapping:

## Premise

```yaml
problem: ""
source: ai-proposed
source_ref: ""
evidence:
  kind: observation
  ref: ""
  result: ""
withdrawal: ""
verification:
  status: pending
  by: ""
  conclusion: ""
```

Keys and enum values stay English; narrative values follow this proposal's artifact language.
- `problem`: observed need; `source`: original `user-observation`, `third-party-report`, or `ai-proposed`; `source_ref`: traceable input or investigation reference.
- `evidence`: `kind: observation` with `ref` and `result`; `kind: reproduction` additionally requires substantive `steps`, `expected`, and `actual` strings. Bug reproduction shortens the interview, not this structure.
- `withdrawal`: evidence that would invalidate the need; do not invent it merely to fill the field.
- `verification`: `status: pending|verified`, `by`, and `conclusion`. Preserve the original source after verification. User/third-party origin alone does not mean verified.

Required values must be substantive; blanks, placeholders and NEEDS CLARIFICATION remain blocked. Duplicate sections/keys/blocks, unknown keys, YAML aliases and unclosed fences are invalid. Fenced examples elsewhere do not satisfy the real section.

New scaffolds declare `premise_version: 1` in CLI-owned metadata and remain pending until authored. `prospec validate proposal <change>` reads that metadata and the proposal together: new standard/full changes require ready; quick/backfill are exempt; absent version is legacy with a visible limitation. Unknown versions or unreadable metadata refuse rather than become legacy. Validation checks structure only, never source authenticity or evidence truth, and never runs reproduction steps. A blocked result returns to explore, then new-story updates the same proposal. All autonomous inferences still belong in Stated Assumptions.

### 1. Background (Why)

`## Background`: 1–3 sentences describing the sourced problem and motivation.

### 2. User Stories

Use independently developable, testable and deployable INVEST stories:

```markdown
## User Stories

### US-1: [Short title] [P0]

As a [role],
I want [feature],
So that [value].

**Acceptance Scenarios:**

- WHEN [condition], THEN [concrete, measurable outcome]
- WHEN [condition], THEN [concrete, measurable outcome]

**Independent Test:**
[How to verify this story in isolation]
```

**Priority levels:** P0 (must-have), P1 (should-have), P2 (nice-to-have)

Freeze substantive scenarios via `prospec change story <name> --freeze-scenarios`. Later changes require `prospec change story <name> --amend-scenarios --reason "<reason>" --expected-digest <sha256>`; never hand-edit metadata or invent history.

### 3. Stated Assumptions

Under `## Stated Assumptions`, list assumptions in `artifact_language`, including inferred problem/value, name, scale, scope and defaults. Every autonomous inference not confirmed in prior interaction MUST be listed here for one-pass human review.

### 4. Edge Cases

`## Edge Cases`: boundary conditions and errors, each with its expected behavior.

### 5. Functional Requirements

`## Functional Requirements`: numbered `FR-001...` behaviors, mapped to delta-spec REQs later.

### 6. Success Criteria

`## Success Criteria`: numbered `SC-001...` measurable completion criteria.

### 7. Related Modules

`## Related Modules`: each module's name and relevance, matched against `prospec/index.md` keywords.

### 8. Open Questions (Optional)

`## Open Questions`: unresolved questions marked `NEEDS CLARIFICATION`.

### 9. Constitution Check

`## Constitution Check`: record review against `prospec/CONSTITUTION.md` and any violations.

### 10. UI Scope (Optional)

Declare `## UI Scope` with `**Scope:** full | partial | none`, choosing one:
- `full`: complete screens/pages, layout and interactions.
- `partial`: changes to existing components.
- `none`: CLI/backend only, no visual component.

If omitted, design assumes full and confirms with the user; existing proposals are unaffected.

## File Length Guidelines

Keep under **150 lines**, with 2–5 acceptance scenarios per story. Consider splitting above five stories or five scenarios per story.
